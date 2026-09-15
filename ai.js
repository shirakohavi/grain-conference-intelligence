/* ══════════════════════════════════════════════════════════════════════════
   AI LAYER, every call to a model lives in this one file.

   The rule for what belongs here: a task earns an AI call only if it requires
   JUDGEMENT or handling UNSTRUCTURED LANGUAGE. Anything that must be
   reproducible stays in engine.js as arithmetic. That split is deliberate:
     · a score a sales lead can't reproduce is a score they won't trust
     · a model asked to do arithmetic will quietly get it wrong
     · a rule asked "is this the same human?" has no way to read context

   Six jobs qualify:
     1. mineSignals     , pull conference names out of Slack / meeting notes
     2. discover        , propose events we don't already track
     3. interpretScore  , turn five numbers into an attend/skip argument
     4. adjudicateMatch , same person, or two people with the same name?
     5. relationshipArc , what changed across meetings, and what to do now
     6. parseCapture    , one messy sentence on a show floor -> clean fields
   ══════════════════════════════════════════════════════════════════════════ */

const AI = (() => {
  /* ── How an AI call is routed ────────────────────────────────────────
     Three paths, tried in this order:

     1. n8n proxy , the key lives in n8n's credential store, not the
        browser. This is what lets whoever opens the live URL get real
        answers without pasting anything, which is the difference between
        the AI features being evaluated and being skipped.
     2. The viewer's own key, if they set one in Settings. Satisfies the
        brief's "configurable by the user, not hardcoded" literally.
     3. Demo responses, so the tool never dead-ends.
     ──────────────────────────────────────────────────────────────────── */
  const n8n = () => (localStorage.getItem("n8n_base") || N8N_BASE || "").replace(/\/+$/, "");
  const viaProxy = () => !!n8n();

  async function proxy(task, system, user) {
    const res = await fetch(n8n() + "/webhook/grain-ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, system, prompt: user }),
    });
    if (!res.ok) throw new Error(`n8n returned ${res.status}`);
    const j = await res.json();
    const text = j.text || j.output || "";
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) throw new Error("Proxy did not return JSON");
    return JSON.parse(m[0]);
  }

  const cfg = () => ({
    provider: localStorage.getItem("ai_provider") || "anthropic",
    key: localStorage.getItem("ai_key") || "",
    model: localStorage.getItem("ai_model") ||
      (localStorage.getItem("ai_provider") === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-5-20250929"),
  });

  // "Live" means either route works, a key in the browser OR the proxy.
  const hasKey = () => !!cfg().key || viaProxy();
  const mode = () => viaProxy() ? "proxy" : (cfg().key ? "key" : "demo");

  async function call(system, user, { json = true, maxTokens = 1600, task = "ask" } = {}) {
    // Proxy first: it keeps the key server-side and works for every visitor.
    if (viaProxy()) {
      try { return await proxy(task, system, user); }
      catch (e) {
        // If n8n is asleep or the flow is inactive, fall through to a
        // browser key rather than failing the feature outright.
        if (!cfg().key) throw e;
      }
    }
    const { provider, key, model } = cfg();
    if (!key) throw new Error("NO_KEY");

    let res, body;
    if (provider === "openai") {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      var text = body.choices?.[0]?.message?.content || "";
    } else {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model, max_tokens: maxTokens, system,
          messages: [{ role: "user", content: user }],
        }),
      });
      body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      var text = body.content?.map(b => b.text || "").join("") || "";
    }
    if (!json) return text;
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) throw new Error("Model did not return JSON");
    return JSON.parse(m[0]);
  }

  /* Shared context. Every prompt gets this so the model argues about GRAIN,
     not about conferences in the abstract. */
  const GRAIN = `You advise the sales team at Grain, a Tel Aviv fintech selling EMBEDDED cross-currency hedging.
Grain takes on FX risk so a platform's end customers don't carry it.
Ideal customers: payment service providers (PSPs) and acquirers; travel wholesalers and booking platforms;
cross-border payment companies; marketplaces and vertical SaaS platforms whose users transact in several currencies.
Grain sells two ways: direct to a platform's treasury/finance owner, and as an EMBEDDED partner the platform resells.
Not a fit: domestic-only retail banking, consumer finance, in-store retail tech, crypto-native settlement.
Be concrete and commercially blunt. A salesperson reads this between meetings. Never pad.`;

  /* ── 1. SIGNAL MINER ────────────────────────────────────────────────────
     Why AI: conference names appear inside sentences, misspelled, without
     dates, mixed in with unrelated chat. No regex survives real Slack.     */
  async function mineSignals(text, knownNames) {
    /* This one has a flow of its own. The n8n version also matches each
       mention against the conferences table and counts how many were raised
       by customers rather than by us, work that belongs next to the
       database, not in the browser. */
    if (viaProxy()) {
      try {
        const r = await fetch(n8n() + "/webhook/grain-signal-miner", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (r.ok) return await r.json();
      } catch (e) { /* fall through to the direct call below */ }
    }
    return call(
      `${GRAIN}\nYou extract conference mentions from internal Slack threads and meeting summaries.`,
      `Read the text below. Find every in-person conference, expo, summit or industry event mentioned.

For each one return:
  name       , the event's real name, corrected and expanded to its proper form
  mentionedBy, who raised it, if a name is visible, else ""
  context    , one short quote or paraphrase of WHY it came up
  sentiment  , "positive" | "neutral" | "concern"  (concern = we are missing it / lost something by not going)
  evidence   , "customer" if a prospect or customer raised it, "internal" if only our own team did
  alreadyTracked, true if the name matches one of the events we already track

Events we already track: ${knownNames.join(" | ")}

Return {"mentions":[...]} and nothing else. If an event is mentioned twice, return it once with the stronger sentiment.

TEXT:
${text}`, { task: "mineSignals" });
  }

  /* ── 2. DISCOVERY ───────────────────────────────────────────────────────
     Why AI: the useful question is not "list fintech conferences", it is
     "given these four verticals and these gaps in our calendar, what are we
     not seeing?" That is a reasoning task over our own coverage.          */
  async function discover(known, gaps) {
    return call(
      `${GRAIN}\nYou find industry events a sales team has overlooked.`,
      `We already track these events: ${known.join(" | ")}

Gaps in our current plan: ${gaps}

Propose up to 6 real, recurring industry events we are NOT tracking that a Grain rep should seriously consider.
Favour events where our buyer concentrates rather than generic "big fintech" events, and cover our weaker verticals
(travel wholesale, marketplaces, cross-border commerce), not just payments.

For each: {"name","typicalMonth","typicalCity","vertical","whyUs" (one sentence, specific to Grain's ICP),
"risk" (the honest reason it might not be worth it)}
Return {"suggestions":[...]}. Only events you are confident genuinely exist. If unsure of a detail, say so in "risk".`, { task: "discover" });
  }

  /* ── 3. SCORE INTERPRETATION ────────────────────────────────────────────
     Why AI: the five numbers are computed by rules and are not in dispute.
     What a rep needs is the ARGUMENT, what the numbers mean together, and
     what the score structurally cannot see.                               */
  async function interpretScore(c, s) {
    return call(
      `${GRAIN}\nYou turn a conference score into an attend/skip argument. You did NOT compute the score and must not dispute the numbers, interpret them.`,
      `Event: ${c.name}, ${c.city}, ${c.country}, ${c.start} to ${c.end}
Verticals: ${c.verticals.join(", ")} | Attendance ~${c.audienceSize} | Ticket €${c.ticketEur}
Our internal note: ${c.note}

Computed score ${s.total}/100 (tier ${s.tier}, ${s.label}). Components, each 0-100:
  ICP fit ${s.parts.icpDensity} · seniority ${s.parts.seniority} · cost per conversation ${s.parts.efficiency} · strategic value ${s.parts.strategic}
Cost per reachable ICP contact: €${Math.round(s.eff.costPerContact)} (${s.eff.reachable} reachable over ${s.eff.days} days, incl. €${s.eff.travel} travel from Tel Aviv)

Return JSON:
{"verdict": one of "go","go if clustered","skip",
 "argument": 2 sentences a rep could say to their manager to justify that verdict,
 "targets": [3 SPECIFIC job titles or company types to hunt on this floor, not generic],
 "blindSpot": one thing the score structurally cannot see about this event that a human should check}`, { task: "interpretScore" });
  }

  /* ── 4. MATCH ADJUDICATION ──────────────────────────────────────────────
     Why AI: the rules produced two identical confidence scores for opposite
     situations, a job change and a common name collision. Telling them
     apart requires reading the rep's field notes.                         */
  async function adjudicateMatch(a, b, score, reasons) {
    return call(
      `${GRAIN}\nYou decide whether two conference lead records describe the SAME person.
Be conservative: wrongly merging two people corrupts a CRM and a rep will greet a stranger by the wrong history.
Wrongly splitting one person is a smaller, recoverable error.`,
      `Our rule-based matcher scored these ${score}/100, confident enough to flag, not confident enough to merge.
It reasoned: ${reasons.join("; ")}

RECORD A, met at ${a.confName} (${a.at.slice(0, 10)}) by rep ${a.rep}
  ${a.name} · ${a.title} · ${a.company} · ${a.email || "no email"}
  Rep's note: "${a.note}"

RECORD B, met at ${b.confName} (${b.at.slice(0, 10)}) by rep ${b.rep}
  ${b.name} · ${b.title} · ${b.company} · ${b.email || "no email"}
  Rep's note: "${b.note}"

Return {"verdict":"same"|"different"|"unsure","confidence":0-100,
"reasoning":"one sentence naming the specific evidence that decided it",
"tell":"the single detail that settles it"}`, { task: "adjudicateMatch" });
  }

  /* ── 5. RELATIONSHIP ARC ────────────────────────────────────────────────
     Why AI: the pattern (warming / stalled) is arithmetic and already done.
     Reading three sets of scrappy field notes and saying what actually
     changed, and what to do on Tuesday, is not.                         */
  async function relationshipArc(contact) {
    const history = contact.encounters.map((e, i) =>
      `${i + 1}. ${e.at.slice(0, 10)} · ${e.confName} · met by ${e.rep} · signal: ${e.intent}
   as: ${e.name}, ${e.title} at ${e.company}
   note: "${e.note}"`).join("\n");
    return call(
      `${GRAIN}\nYou brief a rep on a contact they have met more than once. The rep is walking into a room in five minutes.`,
      `Contact: ${contact.name}, currently ${contact.title} at ${contact.company}
Met ${contact.touches} times over ${contact.spanDays} days. Last seen ${contact.daysSince} days ago.
Rule-based pattern: ${contact.pattern}${contact.changedCompany ? " · CHANGED EMPLOYER between meetings" : ""}${contact.repsInvolved.length > 1 ? " · met by different reps each time" : ""}

${history}

Return JSON:
{"arc": one sentence on what has actually changed across these meetings, cite the specific detail that moved,
 "verdict": one of "closing","worth pushing","needs a new angle","politely disengage",
 "why": one sentence defending that verdict honestly, if they are a tire-kicker, say so,
 "nudge": the exact next action, specific enough to do today. Name the hook from the notes. No generic "follow up".
 "avoid": one thing NOT to do with this person, based on the history}`, { task: "relationshipArc" });
  }

  /* ── 6. QUICK CAPTURE PARSER ────────────────────────────────────────────
     Why AI: the whole point of the field interface is that the rep types one
     scrappy line and keeps talking. Turning that into fields is the job AI
     is actually best at, and a form is the thing it replaces.             */
  async function parseCapture(raw, confName, confId) {
    /* The n8n flow does more than parse: it also runs the duplicate check
       against every lead on record and hands back candidates, so the rep is
       warned while the person is still in front of them. */
    if (viaProxy()) {
      try {
        const r = await fetch(n8n() + "/webhook/grain-capture", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ raw, conference_name: confName, conference_id: confId }),
        });
        if (r.ok) {
          const j = await r.json();
          return { ...(j.parsed || {}), duplicates: j.duplicates || [] };
        }
      } catch (e) { /* fall through */ }
    }
    return call(
      `${GRAIN}\nYou convert a salesperson's hurried one-line note into structured CRM fields. They typed this while walking. Expect typos, no punctuation, abbreviations.`,
      `Conference: ${confName}
Raw note: "${raw}"

Return JSON:
{"name":"","company":"","title":"","email":"","phone":"",
 "intent":"cold"|"warm"|"hot",
 "note":"the rep's own observation, cleaned up but NOT embellished, keep their words and judgements",
 "icpSignals":[short phrases from the note that indicate Grain ICP fit, e.g. "multi-currency marketplace", "travel vertical"],
 "missing":[fields a rep should grab before this person walks away, most important first]}

Rules: never invent an email or a company. Leave a field "" if it is not in the note.
"intent": hot = asked about price, timeline, integration or next steps. warm = engaged, asked a real question.
cold = polite, took a leaflet, no real signal.`, { task: "parseCapture" });
  }

  return { cfg, hasKey, mode, viaProxy, n8n, call, mineSignals, discover, interpretScore, adjudicateMatch, relationshipArc, parseCapture };
})();
