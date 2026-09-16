/* ══════════════════════════════════════════════════════════════════════════
   AI LAYER, every call to a model lives in this one file.

   The rule for what belongs here: a task earns an AI call only if it requires
   JUDGEMENT or handling UNSTRUCTURED LANGUAGE. Anything that must be
   reproducible stays in engine.js as arithmetic. That split is deliberate:
     · a score a sales lead can't reproduce is a score they won't trust
     · a model asked to do arithmetic will quietly get it wrong
     · a rule asked "is this the same human?" has no way to read context

   Three jobs qualify, and all three are reachable from the UI. That is the
   whole list, deliberately:
     1. interpretScore  , turn four numbers into an attend/skip argument
     2. adjudicateMatch , same person, or two people with the same name?
     3. relationshipArc , what changed across meetings, what to do about it,
                          and the follow-up email already written

   Three more were built and then cut: a conference discovery search, a
   Slack / meeting-notes miner, and a free-text capture parser. All three
   worked. None survived the question "would a rep open this twice?" (the
   capture parser lost to a three-box form, which is faster and never
   guesses), and an AI feature nobody opens is the definition of bolted on.
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

  /* ── 1. SCORE INTERPRETATION ────────────────────────────────────────────
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

  /* ── 2. MATCH ADJUDICATION ──────────────────────────────────────────────
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

  /* ── 3. RELATIONSHIP ARC ────────────────────────────────────────────────
     Why AI: the verdict is arithmetic and engine.js has already decided it.
     The model is told the answer and never gets a vote, so the label on
     screen stays reproducible. What it does instead is the part no rule can
     do: read three sets of scrappy human notes, work out what actually moved,
     and write the email that uses it.

     The draft is written, never sent. A tool that emails prospects on its own
     is a tool nobody deploys, HubSpot owns sequences, and the one action that
     touches a customer keeps a human on it.                              */
  async function relationshipArc(contact) {
    const history = contact.encounters.map((e, i) =>
      `${i + 1}. ${e.at.slice(0, 10)} · ${e.confName} · met by ${e.rep} · signal: ${e.intent}
   as: ${e.name}, ${e.title} at ${e.company}
   note: "${e.note}"`).join("\n");

    const flags = [
      contact.changedCompany ? "CHANGED EMPLOYER between meetings" : "",
      contact.repsInvolved.length > 1 ? `met by ${contact.repsInvolved.length} different reps` : "",
      contact.overdue ? `OVERDUE: silent ${contact.daysSince} days against their usual gap of ${contact.usualGapDays}` : "",
      contact.everHot ? "was hot at some point" : "has never once been hot",
    ].filter(Boolean).join(" · ");

    return call(
      `${GRAIN}
You brief a rep on a contact they have met more than once, then draft the follow-up email for them.
The rep is between meetings. They will read the brief in ten seconds and edit the email in thirty.`,
      `Contact: ${contact.name}, currently ${contact.title} at ${contact.company}
Met ${contact.touches} times over ${contact.spanDays} days. Last seen ${contact.daysSince} days ago.
Verdict, already decided by rule, do not argue with it: ${contact.verdict}
Because: ${contact.test}
${flags}

${history}

Do not invent facts. Use only what is above. If the notes do not say why
something changed, say the notes do not say. A job change, a budget, a date
or a competitor that is not written above does not exist.

Return JSON:
{"arc": one sentence on what has actually changed across these meetings. Cite the specific detail that moved. If nothing moved, say that.,
 "why": one sentence on what the verdict means commercially. Be blunt. If they are a tire-kicker, say so in those words.,
 "nudge": the exact next action, specific enough to do today, naming the hook from the notes. Never "follow up" or "check in".,
 "avoid": one thing NOT to do with this person, drawn from the history,
 "email": {
   "subject": under 60 characters, no colon-heavy marketing phrasing, reads like a person wrote it,
   "body": "3 to 5 short sentences. Open by referencing the specific thing THEY said, quoting their own words where you can. Make one concrete ask. No pleasantries about hoping they are well, no company boilerplate, no bullet points, no signature block. Plain text."
 }}`, { task: "relationshipArc" });
  }

  return { cfg, hasKey, mode, viaProxy, n8n, call, interpretScore, adjudicateMatch, relationshipArc };
})();
