/* ══════════════════════════════════════════════════════════════════════════
   Conference Intelligence — UI + state.
   No framework, no build step. Open index.html and it runs.
   REDESIGNED: Notion-style views, quiet inline filters, improved contacts grid.
   ══════════════════════════════════════════════════════════════════════════ */

// Loaded from Postgres at boot. Declared here so every view can reach them.
let CONFERENCES = [], ENCOUNTERS = [], LEADS = [];

const TODAY = "2026-09-14";           // demo clock, so the seeded year reads correctly
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  view: "conferences",
  // Conferences, leads and encounters all live in Postgres now. `attending`
  // is derived from conferences.status rather than kept separately — one
  // source of truth, so n8n and the app can never disagree.
  attending: new Set(),
  extra: [],                                     // unused: captures go straight to the DB
  decisions: LS.get("matchDecisions", {}),       // resolved review-queue items
  weights: LS.get("weights", { ...DEFAULT_WEIGHTS }),
  mined: LS.get("mined", []),                    // conference mentions found in internal text
  aiCache: LS.get("aiCache", {}),
  pushed: new Set(LS.get("pushed", [])),         // contacts sent to HubSpot
  sel: null, busy: {},
};
// Only genuinely local preferences are persisted in the browser. Anything
// the team shares lives in the database.
const save = () => {
  LS.set("matchDecisions", S.decisions); LS.set("weights", S.weights);
  LS.set("mined", S.mined); LS.set("aiCache", S.aiCache);
};

/* ── derived ─────────────────────────────────────────────────────────── */
const confById = id => CONFERENCES.find(c => c.id === id);
const allEncounters = () => ENCOUNTERS
  .map(e => ({ ...e, confName: confById(e.confId)?.name || e.confId }));
const scored = () => CONFERENCES.map(c => ({ c, s: scoreConference(c, S.weights) }));
const upcoming = () => CONFERENCES.filter(c => c.start >= TODAY);
const identities = () => resolveIdentities(allEncounters(), S.decisions);

/* Customer signal: was this event raised by a prospect in Slack / a meeting? */
const signalFor = name => S.mined.find(m =>
  normName(m.name).includes(normName(name).slice(0, 12)) ||
  normName(name).includes(normName(m.name).slice(0, 12)));

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtRange = c => c.start === c.end ? `${fmtDate(c.start)} ${c.start.slice(0, 4)}`
  : `${fmtDate(c.start)}–${fmtDate(c.end)} ${c.end.slice(0, 4)}`;
const monthName = k => new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
const eur = n => "€" + Math.round(n).toLocaleString();

/* ── AI plumbing: one path, demo fallback, cached ───────────────────── */
async function ask(cacheKey, live, demo) {
  if (S.aiCache[cacheKey]) return S.aiCache[cacheKey];
  let out;
  if (AI.hasKey()) {
    try { out = await live(); }
    catch (e) {
      if (String(e.message) === "NO_KEY") out = { ...demo(), __demo: true };
      else return { __error: humanError(e.message) };
    }
  } else out = { ...demo(), __demo: true };
  S.aiCache[cacheKey] = out; save();
  return out;
}
function humanError(m) {
  if (/model/i.test(m) && /not.*(found|exist)|invalid/i.test(m))
    return "That model name isn't available on your key. Change it in Settings.";
  if (/401|authentication|api key/i.test(m)) return "The API key was rejected. Check it in Settings.";
  if (/429|rate/i.test(m)) return "Rate limited by the provider — wait a moment and retry.";
  if (/fetch|network/i.test(m)) return "Couldn't reach the provider from the browser.";
  return m;
}
const badge = r => r?.__demo ? `<span class="badge">demo response</span>` : `<span class="badge">live</span>`;

/* ── shell ───────────────────────────────────────────────────────────── */
const NAVS = [
  ["conferences", "◎", "Conferences"],
  ["plan", "▤", "Plan the year"],
  ["field", "⚡", "Field mode"],
  ["contacts", "◆", "Contacts"],
  ["signals", "◈", "Signal miner"],
  ["settings", "⚙", "Settings"],
];

function render() {
  const { review } = identities();
  document.getElementById("nav").innerHTML = NAVS.map(([k, ic, label]) => {
    let cnt = "";
    if (k === "contacts" && review.length) cnt = `<span class="cnt">${review.length}</span>`;
    if (k === "plan" && S.attending.size) cnt = `<span class="cnt">${S.attending.size}</span>`;
    return `<button class="nav ${S.view === k ? "on" : ""}" onclick="go('${k}')">
      <span class="ic">${ic}</span>${label}${cnt}</button>`;
  }).join("");
  document.getElementById("main").innerHTML = VIEWS[S.view]();
  if (VIEWS[S.view].after) VIEWS[S.view].after();
}
function go(v) { S.view = v; S.sel = null; render(); window.scrollTo(0, 0); }

/* ══════════════════════════════════════════════════════════════════════
   VIEW 1 — CONFERENCES.  Decide what's worth attending.
   REDESIGNED: Quiet inline filter bar instead of boxed inputs.
   ══════════════════════════════════════════════════════════════════════ */
const F = { q: "", region: "", tier: "", when: "upcoming", vertical: "" };

VIEWS_CONF = () => {
  let list = scored();
  if (F.when === "upcoming") list = list.filter(x => x.c.start >= TODAY);
  if (F.when === "past") list = list.filter(x => x.c.start < TODAY);
  if (F.region) list = list.filter(x => x.c.region === F.region);
  if (F.tier) list = list.filter(x => x.s.tier === F.tier);
  if (F.vertical) list = list.filter(x => x.c.verticals.includes(F.vertical));
  if (F.q) { const q = F.q.toLowerCase();
    list = list.filter(x => (x.c.name + x.c.city + x.c.country + x.c.verticals.join()).toLowerCase().includes(q)); }
  list.sort((a, b) => b.s.total - a.s.total);

  const regions = [...new Set(CONFERENCES.map(c => c.region))].sort();
  const verts = [...new Set(CONFERENCES.flatMap(c => c.verticals))].sort();
  const budget = [...S.attending].map(confById).filter(Boolean)
    .reduce((t, c) => t + c.ticketEur + (TRAVEL_FROM_TLV[c.region] || 1500), 0);

  return `
  <div class="head">
    <h1>Conferences</h1>
    <p>Every event scored for Grain's ICP, ranked. The score is arithmetic you can audit — open any row to see
       the five inputs and what the tier actually means for a booking decision.</p>
  </div>

  <div class="filter-bar">
    <input class="filter-input" style="width:180px" placeholder="Search events…" value="${esc(F.q)}"
      oninput="F.q=this.value;render();setTimeout(()=>{const e=document.querySelector('[placeholder=\\'Search events…\\']');e.focus();e.setSelectionRange(e.value.length,e.value.length)})">
    <div class="filter-group">
      <span class="filter-label">When</span>
      ${["upcoming", "past", ""].map(v => `<button class="filter-control ${F.when === v ? "active" : ""}"
        onclick="F.when='${v}';render()">${v === "upcoming" ? "Upcoming" : v === "past" ? "Already happened" : "All"}</button>`).join("")}
    </div>
    <div class="filter-group">
      <span class="filter-label">Region</span>
      <select class="filter-control" style="border-bottom:1px solid var(--line)" onchange="F.region=this.value;render()">
        <option value="">All regions</option>
        ${regions.map(r => `<option value="${r}"${F.region === r ? " selected" : ""}>${r}</option>`).join("")}
      </select>
    </div>
    <div class="filter-group">
      <span class="filter-label">Vertical</span>
      <select class="filter-control" style="border-bottom:1px solid var(--line)" onchange="F.vertical=this.value;render()">
        <option value="">All verticals</option>
        ${verts.map(v => `<option value="${v}"${F.vertical === v ? " selected" : ""}>${v}</option>`).join("")}
      </select>
    </div>
    <div class="filter-group">
      <span class="filter-label">Tier</span>
      ${["", "A", "B", "C", "D"].map(t => `<button class="filter-control ${F.tier === t ? "active" : ""}"
        onclick="F.tier='${t}';render()">${t || "All"}</button>`).join("")}
    </div>
    <div class="filter-stat">${list.length} of ${CONFERENCES.length} · ${S.attending.size} booked · ${eur(budget)} committed</div>
  </div>

  <div class="grid" style="grid-template-columns:1fr 268px;align-items:start">
    <div class="card">
      <div class="pad" style="padding-bottom:0"><table>
        <thead><tr><th style="width:30px"></th><th style="width:46px">Score</th><th>Event</th>
          <th style="width:120px">When</th><th style="width:150px">Where</th><th style="width:112px">Cost / contact</th>
          <th style="width:58px">Going</th></tr></thead>
        <tbody>${list.map(({ c, s }) => {
          const sig = signalFor(c.name);
          return `<tr onclick="openConf('${c.id}')">
            <td><span class="tier ${s.tier}">${s.tier}</span></td>
            <td><span class="score">${s.total}</span></td>
            <td><div style="font-weight:600">${esc(c.name)}</div>
                <div class="tiny dim">${c.verticals.join(" · ")}${sig ? ` · <span style="color:var(--accent);font-weight:700">★ raised by ${sig.evidence === "customer" ? "a customer" : "the team"}</span>` : ""}</div></td>
            <td class="tiny">${fmtRange(c)}</td>
            <td class="tiny">${esc(c.city)}, ${esc(c.country)}</td>
            <td class="tiny mono">${eur(s.eff.costPerContact)}<span class="dim"> ×${s.eff.reachable}</span></td>
            <td onclick="event.stopPropagation();toggleGoing('${c.id}')" style="text-align:center;font-size:16px">
              ${S.attending.has(c.id) ? "☑" : "<span class='dim'>☐</span>"}</td>
          </tr>`; }).join("")}
        </tbody></table>
        ${list.length ? "" : `<div class="empty">Nothing matches those filters.</div>`}
      </div>
    </div>

    <div class="card pad">
      <h4>Scoring weights</h4>
      <p class="tiny muted" style="margin:-2px 0 12px">These are the sales lead's call, not the tool's. Move a
         slider and every score and tier re-ranks instantly.</p>
      ${Object.entries({ icpDensity: "ICP density", seniority: "Decision-maker seniority",
        crossBorder: "Cross-border relevance", efficiency: "Cost efficiency", strategic: "Embedded-partner presence" })
        .map(([k, label]) => `
        <div style="margin-bottom:11px">
          <div class="spread tiny" style="margin-bottom:2px"><span>${label}</span><b class="mono">${S.weights[k]}</b></div>
          <input type="range" min="0" max="50" value="${S.weights[k]}" style="width:100%;accent-color:var(--accent)"
            oninput="S.weights['${k}']=+this.value;S.aiCache={};save();render()">
        </div>`).join("")}
      <button class="btn ghost sm" style="width:100%"
        onclick="S.weights={...DEFAULT_WEIGHTS};S.aiCache={};save();render()">Reset to default</button>
      <div class="alert" style="margin-top:13px">
        <b>Why the ranking may surprise you.</b> Cost efficiency is measured per <i>reachable</i> ICP contact —
        one rep can hold about ${MEETINGS_PER_DAY} real conversations a day, so attendance above that stops counting.
        It's why a free Dubai expo can out-rank a €3,670 flagship.
      </div>
    </div>
  </div>`;
};

async function openConf(id) {
  S.sel = id; drawConf();
  const c = confById(id), s = scoreConference(c, S.weights);
  const r = await ask(`interp:${id}:${JSON.stringify(S.weights)}`,
    () => AI.interpretScore(c, s), () => DEMO.interpret(c, s));
  if (S.sel === id) drawConf(r);
}
function drawConf(ai) {
  const c = confById(S.sel); if (!c) return;
  const s = scoreConference(c, S.weights);
  const met = allEncounters().filter(e => e.confId === c.id);
  const sig = signalFor(c.name);
  const labels = { icpDensity: "ICP density", seniority: "Decision-maker seniority",
    crossBorder: "Cross-border relevance", efficiency: "Cost efficiency", strategic: "Embedded-partner presence" };
  drawer(`
    <div class="spread"><div>
      <div class="row" style="gap:8px"><span class="tier ${s.tier}">${s.tier}</span>
        <h3 style="margin:0">${esc(c.name)}</h3></div>
      <div class="tiny dim" style="margin-top:4px">${fmtRange(c)} · ${esc(c.city)}, ${esc(c.country)} ·
        ~${c.audienceSize.toLocaleString()} attending · ticket ${eur(c.ticketEur)}</div>
    </div><button class="x" onclick="closeDrawer()">×</button></div>`, `
    <div class="row" style="justify-content:space-between;background:var(--accent-soft);padding:12px 14px;border-radius:9px">
      <div><div class="tiny" style="color:var(--accent-ink);font-weight:700;letter-spacing:.05em;text-transform:uppercase">Tier ${s.tier} — ${s.label}</div>
        <div style="font-size:13px;margin-top:3px">${s.action}</div></div>
      <div style="text-align:right"><div class="score" style="font-size:28px">${s.total}</div>
        <div class="tiny dim">of 100</div></div>
    </div>

    ${sig ? `<div class="alert good"><b>★ Raised internally.</b> ${esc(sig.context)}
      <div class="tiny dim" style="margin-top:3px">${esc(sig.source || "internal signal")} — via ${esc(sig.mentionedBy || "the team")}</div></div>` : ""}

    <div><h4>How the ${s.total} is built</h4>
      ${Object.keys(labels).map(k => `
        <div class="row tiny" style="margin-bottom:6px;gap:9px">
          <span style="width:170px">${labels[k]}</span>
          <span class="bar"><i style="width:${s.parts[k]}%"></i></span>
          <b class="mono" style="width:26px;text-align:right">${s.parts[k]}</b>
          <span class="dim" style="width:44px;text-align:right">×${S.weights[k]}</span>
        </div>`).join("")}
      <div class="tiny dim" style="margin-top:9px;line-height:1.6">
        Raw weighted average ${s.raw}, stretched onto 0–100 (a raw 15 is an irrelevant event, a raw 75 the realistic
        best case). Cost efficiency comes from ${eur(c.ticketEur)} ticket + ${eur(s.eff.travel)} travel from Tel Aviv
        ÷ ${s.eff.reachable} reachable ICP contacts over ${s.eff.days} day${s.eff.days > 1 ? "s" : ""}
        = <b>${eur(s.eff.costPerContact)} per qualified conversation</b>.
      </div>
    </div>

    <div><h4>Our note on file</h4><div style="font-size:13px">${esc(c.note)}</div></div>

    ${!ai ? `<div class="ai"><h4>AI read <span class="spin"></span></h4><div class="tiny muted">Reading the score…</div></div>`
      : ai.__error ? `<div class="alert bad"><b>AI unavailable.</b> ${esc(ai.__error)}</div>`
      : `<div class="ai">
        <h4>AI read ${badge(ai)}</h4>
        <div class="row" style="margin-bottom:8px"><span class="pill" style="background:#fff;border:1px solid #cfe4dc;color:var(--accent-ink)">${esc(ai.verdict)}</span></div>
        <p style="margin:0 0 10px;font-size:13px">${esc(ai.argument)}</p>
        <h4 style="margin-bottom:5px">Hunt for</h4>
        <ul style="margin:0 0 10px;padding-left:17px;font-size:12.5px">${(ai.targets || []).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        <h4 style="margin-bottom:5px">What the score can't see</h4>
        <p style="margin:0;font-size:12.5px">${esc(ai.blindSpot)}</p>
      </div>`}

    ${met.length ? `<div><h4>${met.length} contact${met.length > 1 ? "s" : ""} met here</h4>
      ${met.map(e => `<div class="spread tiny" style="padding:6px 0;border-top:1px solid var(--line2)">
        <span><b>${esc(e.name)}</b> · ${esc(e.company)}</span>
        <span class="sig ${e.intent}">${e.intent}</span></div>`).join("")}</div>` : ""}

    <div class="row">
      <button class="btn" onclick="toggleGoing('${c.id}');drawConf(${ai ? JSON.stringify(ai).replace(/"/g, "&quot;") : "null"})">
        ${S.attending.has(c.id) ? "Remove from plan" : "Add to plan"}</button>
      ${c.start >= TODAY ? `<button class="btn ghost" onclick="closeDrawer();S.view='field';S.fieldConf='${c.id}';render()">Capture a lead here</button>` : ""}
    </div>`);
}
async function toggleGoing(id) {
  const going = S.attending.has(id);
  const status = going ? "New" : "Attending";
  going ? S.attending.delete(id) : S.attending.add(id);
  const c = confById(id); if (c) c.status = status;
  render(); if (S.sel === id) openConf(id);
  try { await DB.setConferenceStatus(id, status); }
  catch (e) { toast("Couldn't save that to the database: " + e.message, true); }
}

/* A small non-blocking message. Writes can fail; the rep should know without
   losing what they were doing. */
function toast(msg, bad) {
  let t = document.getElementById("toast");
  if (!t) { document.body.insertAdjacentHTML("beforeend",
    `<div id="toast" style="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;
      padding:11px 18px;border-radius:11px;font-size:13px;font-weight:600;box-shadow:var(--sh);
      max-width:90vw"></div>`); t = document.getElementById("toast"); }
  t.style.background = bad ? "#FDF1F0" : "var(--ink)";
  t.style.color = bad ? "var(--bad)" : "#fff";
  t.style.border = bad ? "1px solid #F0D3CF" : "0";
  t.textContent = msg; t.style.display = "block";
  clearTimeout(t._h); t._h = setTimeout(() => t.style.display = "none", 4200);
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW 2 — PLAN THE YEAR.  Coverage, gaps, clusters, clashes, budget.
   ══════════════════════════════════════════════════════════════════════ */
VIEWS_PLAN = () => {
  const fut = upcoming();
  const months = coverageByMonth(fut, S.attending);
  const keys = Object.keys(months).sort();
  const booked = [...S.attending].map(confById).filter(Boolean).filter(c => c.start >= TODAY);
  const spend = booked.reduce((t, c) => t + c.ticketEur + (TRAVEL_FROM_TLV[c.region] || 1500), 0);
  const clusters = findClusters(fut, {}, S.weights);
  const clashes = findConflicts(fut, S.weights);

  // A gap is a month with a genuinely good event available and nothing booked.
  const gaps = keys.filter(k => {
    const m = months[k];
    return !m.booked.length && m.all.some(c => scoreConference(c, S.weights).total >= 80);
  });
  // Region coverage against where our A-tier opportunities actually are.
  const byRegion = {};
  fut.forEach(c => {
    const s = scoreConference(c, S.weights);
    const r = byRegion[c.region] = byRegion[c.region] || { a: 0, booked: 0 };
    if (s.total >= 80) r.a++;
    if (S.attending.has(c.id)) r.booked++;
  });
  const under = Object.entries(byRegion).filter(([, v]) => v.a >= 2 && v.booked === 0).map(([k]) => k);

  return `
  <div class="head"><h1>Plan the year</h1>
    <p>Where the team is covered, where it isn't, and which trips could be one trip.
       ${booked.length} event${booked.length === 1 ? "" : "s"} booked, ${eur(spend)} committed including travel from Tel Aviv.</p></div>

  ${(gaps.length || under.length || clashes.length) ? `
  <div class="grid" style="gap:9px;margin-bottom:16px">
    ${under.length ? `<div class="alert bad"><b>Under-invested ${under.length > 1 ? "regions" : "region"}.</b>
      ${under.map(r => `<b>${r}</b> has ${byRegion[r].a} A-tier event${byRegion[r].a > 1 ? "s" : ""} coming up`).join(", and ")} —
      with nothing booked.</div>` : ""}
    ${gaps.length ? `<div class="alert"><b>${gaps.length} month${gaps.length > 1 ? "s" : ""} with an A-tier event and no coverage:</b>
      ${gaps.map(monthName).join(", ")}.</div>` : ""}
    ${clashes.slice(0, 3).map(([a, b]) => `<div class="alert"><b>Clash.</b>
      ${esc(a.c.name)} (${esc(a.c.city)}, ${a.s.total}) and ${esc(b.c.name)} (${esc(b.c.city)}, ${b.s.total}) overlap
      on ${fmtDate(a.c.start)}. Two reps, or pick the ${a.s.total >= b.s.total ? esc(a.c.name) : esc(b.c.name)}.</div>`).join("")}
  </div>` : `<div class="alert good" style="margin-bottom:16px"><b>No gaps or clashes</b> at the current weighting.</div>`}

  <h3>Coverage by month</h3>
  <div class="months" style="margin-bottom:22px">
    ${keys.map(k => {
      const m = months[k], on = m.booked.length, gap = gaps.includes(k);
      return `<div class="mon ${on ? "on" : gap ? "gap" : ""}">
        <div class="mh"><span>${monthName(k)}</span><span>${on ? `${on} booked` : gap ? "gap" : ""}</span></div>
        ${m.all.map(c => { const s = scoreConference(c, S.weights);
          return `<div class="ev ${S.attending.has(c.id) ? "" : "off"}" onclick="openConf('${c.id}')" title="${esc(c.name)} — ${esc(c.city)}">
            <b class="tier ${s.tier}" style="width:15px;height:15px;font-size:9px">${s.tier}</b>
            <span>${esc(c.name.length > 26 ? c.name.slice(0, 25) + "…" : c.name)}</span></div>`; }).join("")}
      </div>`; }).join("")}
  </div>

  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card pad">
      <h3>Trips you could combine</h3>
      <p class="tiny muted" style="margin:-4px 0 12px">Same region, within 10 days of each other, both worth attending.
         Saving is one return flight and hotel from Tel Aviv per event folded in.</p>
      ${clusters.length ? clusters.slice(0, 6).map(cl => `
        <div style="border-top:1px solid var(--line2);padding:10px 0">
          <div class="spread"><b style="font-size:13px">${esc(cl.cities.join(" → "))}</b>
            <span class="pill" style="background:var(--accent-soft);color:var(--accent-ink)">saves ~${eur(cl.savedTravel)}</span></div>
          <div class="tiny dim" style="margin:2px 0 5px">${fmtDate(cl.start)} – ${fmtDate(cl.end)} · ${cl.span} days · avg score ${cl.avgScore}</div>
          ${cl.items.map((c, i) => `<div class="tiny" style="padding:1px 0">
            <span class="tier ${cl.scores[i].tier}" style="width:14px;height:14px;font-size:8.5px;vertical-align:-2px">${cl.scores[i].tier}</span>
            ${esc(c.name)} <span class="dim">· ${esc(c.city)} · ${fmtDate(c.start)}</span></div>`).join("")}
        </div>`).join("") : `<div class="empty tiny">No combinable trips at the current weighting.</div>`}
    </div>

    <div class="card pad">
      <h3>What's booked</h3>
      ${booked.length ? booked.sort((a, b) => a.start.localeCompare(b.start)).map(c => {
        const s = scoreConference(c, S.weights);
        return `<div class="spread" style="border-top:1px solid var(--line2);padding:9px 0">
          <div><div style="font-weight:600;font-size:13px">${esc(c.name)}</div>
            <div class="tiny dim">${fmtRange(c)} · ${esc(c.city)} · ${eur(c.ticketEur + (TRAVEL_FROM_TLV[c.region] || 1500))} all-in</div></div>
          <div class="row"><span class="tier ${s.tier}">${s.tier}</span>
            <button class="btn ghost sm" onclick="toggleGoing('${c.id}')">Drop</button></div>
        </div>`; }).join("")
        : `<div class="empty tiny">Nothing booked yet. Tick events on the Conferences tab.</div>`}
      ${booked.length ? `<div class="spread" style="border-top:2px solid var(--line);padding-top:10px;margin-top:6px">
        <b>Total committed</b><b class="mono">${eur(spend)}</b></div>
        <div class="tiny dim" style="margin-top:4px">${booked.length} events ·
        ${eur(spend / Math.max(1, booked.reduce((t, c) => t + scoreConference(c, S.weights).eff.reachable, 0)))} blended per reachable contact</div>` : ""}
    </div>
  </div>`;
};

/* ══════════════════════════════════════════════════════════════════════
   VIEW 3 — FIELD MODE.  The show-floor interface.
   The design constraint: a rep is standing up, holding a phone, and the
   person in front of them is still talking. Speed beats completeness, so
   the input is one box and the structuring happens afterwards.
   ══════════════════════════════════════════════════════════════════════ */
S.fieldConf = LS.get("fieldConf", null);
S.draft = null;

VIEWS_FIELD = () => {
  const opts = upcoming().concat(CONFERENCES.filter(c => c.start < TODAY && c.end >= "2026-09-01"));
  const conf = confById(S.fieldConf) || opts[0];
  const today = allEncounters().filter(e => e.confId === conf?.id).length;
  return `
  <div class="head"><h1>Field mode</h1>
    <p>One box. Say what you'd say to a colleague and keep talking — it gets structured after you hit save,
       not while the person is standing there.</p></div>

  <div class="field">
    <div class="spread" style="margin-bottom:10px">
      <select class="inp" style="width:auto" onchange="S.fieldConf=this.value;LS.set('fieldConf',this.value);render()">
        ${opts.map(c => `<option value="${c.id}"${conf?.id === c.id ? " selected" : ""}>${esc(c.name)} — ${esc(c.city)}</option>`).join("")}
      </select>
      <span class="tiny dim">${today} logged here</span>
    </div>

    <textarea id="raw" placeholder="met nadia @ wafeq, gulf b2b invoicing, their SMEs invoice usd/eur settle aed, asked how we price the hedge"
      >${esc(S.rawText || "")}</textarea>
    <div class="chips">
      <span class="tiny dim" style="align-self:center">Try:</span>
      <button class="chip" onclick="fillDemo(1)">A hot lead</button>
      <button class="chip" onclick="fillDemo(2)">Half a name and a company</button>
      <button class="chip" onclick="fillDemo(3)">Someone we've met before</button>
    </div>
    <button class="btn bigbtn" onclick="doCapture()" id="capbtn">Save lead</button>
    <div class="tiny dim" style="text-align:center;margin-top:8px">
      Saves locally first, then structures. Conference wifi doesn't have to work for this to.
    </div>

    <div id="draft" style="margin-top:18px"></div>

    ${today ? `<div class="card pad" style="margin-top:20px">
      <h4>Logged at ${esc(conf.name)}</h4>
      ${allEncounters().filter(e => e.confId === conf.id).reverse().map(e => `
        <div class="spread" style="border-top:1px solid var(--line2);padding:8px 0">
          <div><b style="font-size:13px">${esc(e.name)}</b> <span class="tiny dim">${esc(e.company)}${e.title ? " · " + esc(e.title) : ""}</span>
            <div class="tiny muted" style="margin-top:2px">${esc(e.note).slice(0, 110)}${e.note.length > 110 ? "…" : ""}</div></div>
          <span class="sig ${e.intent}">${e.intent}</span>
        </div>`).join("")}
    </div>` : ""}
  </div>`;
};
const DEMOS = [null,
  "met nadia @ wafeq, gulf b2b invoicing platform. their SMEs invoice in usd/eur but settle aed+sar, spread is a constant complaint. asked how we price the hedge. didnt get her email",
  "guy from mirakl, sophie something? marketplace payments. 300 marketplace clients. wants to know about rev share",
  "ran into daniel mercer again at the nuvei stand, third time now. asked about THB and MXN. said q1 budget opens november"];
function fillDemo(i) { document.getElementById("raw").value = DEMOS[i]; }

async function doCapture() {
  const raw = document.getElementById("raw").value.trim();
  if (!raw) return;
  const conf = confById(S.fieldConf) || upcoming()[0];
  const btn = document.getElementById("capbtn");
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Structuring…`;
  const r = await ask(`cap:${raw.slice(0, 60)}`, () => AI.parseCapture(raw, conf.name), () => DEMO.capture);
  btn.disabled = false; btn.textContent = "Save lead";
  if (r.__error) { document.getElementById("draft").innerHTML =
    `<div class="alert bad"><b>AI unavailable.</b> ${esc(r.__error)} The raw note is saved — nothing is lost.</div>`;
    return commit({ name: "(unparsed)", company: "", title: "", email: "", intent: "warm", note: raw }, conf, raw); }
  S.draft = { r, conf, raw };
  document.getElementById("draft").innerHTML = `
    <div class="ai">
      <h4>Check before it saves ${badge(r)}</h4>
      <div class="kv" style="margin-bottom:10px">
        ${[["name", "Name"], ["company", "Company"], ["title", "Title"], ["email", "Email"], ["phone", "Phone"]].map(([k, l]) =>
          `<label>${l}</label><input class="inp" id="f_${k}" value="${esc(r[k] || "")}" placeholder="—">`).join("")}
        <label>Signal</label>
        <select class="inp" id="f_intent">${["cold", "warm", "hot"].map(i =>
          `<option${r.intent === i ? " selected" : ""}>${i}</option>`).join("")}</select>
        <label>Note</label><textarea class="inp" id="f_note" style="min-height:64px">${esc(r.note || "")}</textarea>
      </div>
      ${(r.icpSignals || []).length ? `<h4 style="margin-bottom:5px">ICP signals it spotted</h4>
        <div class="chips" style="margin-bottom:10px">${r.icpSignals.map(s => `<span class="pill" style="background:var(--accent-soft);color:var(--accent-ink)">${esc(s)}</span>`).join("")}</div>` : ""}
      ${(r.missing || []).length ? `<div class="alert" style="margin-bottom:10px"><b>Grab before they walk off:</b> ${r.missing.map(esc).join(" · ")}</div>` : ""}
      <button class="btn" onclick="commitDraft()">Confirm &amp; save</button>
      <button class="btn ghost" onclick="S.draft=null;document.getElementById('draft').innerHTML=''">Discard</button>
    </div>`;
}
function commitDraft() {
  const g = id => document.getElementById(id)?.value || "";
  commit({ name: g("f_name"), company: g("f_company"), title: g("f_title"), email: g("f_email"),
    phone: g("f_phone"), intent: g("f_intent"), note: g("f_note") }, S.draft.conf, S.draft.raw);
}
async function commit(rec, conf, raw, existingLeadId) {
  try {
    let leadId = existingLeadId;
    if (!leadId) {
      const lead = await DB.upsertLead({
        full_name: rec.name || "(unnamed)", work_email: rec.email || null,
        company: rec.company || null, title: rec.title || null,
        phone: rec.phone || null, icp_segment: rec.segment || null,
      });
      leadId = lead.id;
    }
    await DB.addEncounter({
      lead_id: leadId, conference_id: conf.id, rep: REP_NAME(),
      met_at: new Date().toISOString(), intent: rec.intent || "warm",
      raw_note: raw, note: rec.note || raw,
      name_as_given: rec.name || null, company_as_given: rec.company || null,
      title_as_given: rec.title || null, email_as_given: rec.email || null,
      icp_signals: rec.icpSignals || [],
    });
    S.rawText = ""; S.draft = null;
    await reload();
    const { contacts } = identities();
    const c = contacts.find(x => x.encounters.some(e => e.leadId === leadId));
    toast(c && c.touches > 1
      ? `Saved. ${c.name} has now been met ${c.touches} times — ${c.pattern.toLowerCase()}.`
      : "Saved.");
  } catch (e) { toast("Save failed: " + e.message, true); }
}
const REP_NAME = () => localStorage.getItem("rep_name") || "You";

/* ══════════════════════════════════════════════════════════════════════
   VIEW 4 — CONTACTS.  Cross-conference intelligence.
   REDESIGNED: Repeat contacts use Notion-style grid cards with better visual hierarchy.
   Rules find the candidates, AI settles the ambiguous ones and reads the
   arc. A repeat contact is only interesting if the temperature moved.
   ══════════════════════════════════════════════════════════════════════ */
VIEWS_CONTACTS = () => {
  const { contacts, review } = identities();
  const repeat = contacts.filter(c => c.touches > 1).sort((a, b) => b.priority - a.priority);
  const once = contacts.filter(c => c.touches === 1).sort((a, b) => b.priority - a.priority);
  const enc = allEncounters().length;

  return `
  <div class="head"><h1>Contacts</h1>
    <p>${enc} encounters across ${new Set(allEncounters().map(e => e.confId)).size} conferences resolved into
       ${contacts.length} people. ${repeat.length} have been met more than once — those are the only ones where a
       pattern exists to read.</p></div>

  ${review.length ? `
  <div class="card pad" style="margin-bottom:16px;border-color:#e8d5a8;background:#fefcf6">
    <div class="spread" style="margin-bottom:4px"><h3 style="margin:0">${review.length} to adjudicate</h3>
      <span class="tiny dim">rule confidence 50–84 · too close to merge automatically</span></div>
    <p class="tiny muted" style="margin:0 0 12px;max-width:78ch">Above 85 the tool merges silently; below 50 it keeps
      them apart. In between, string similarity has run out of road — the answer is in what the rep wrote down, which
      is exactly the kind of question a model can answer and a rule cannot.</p>
    ${review.map(r => `
      <div style="border-top:1px solid var(--line2);padding:12px 0" id="rv_${r.key.replace(/\|/g, "_")}">
        <div class="spread">
          <div class="row" style="gap:14px">
            <div><b>${esc(r.a.name)}</b><div class="tiny dim">${esc(r.a.title)} · ${esc(r.a.company)}<br>${esc(r.a.confName)} · ${r.a.at.slice(0, 10)}</div></div>
            <span class="dim" style="font-size:18px">≟</span>
            <div><b>${esc(r.b.name)}</b><div class="tiny dim">${esc(r.b.title)} · ${esc(r.b.company)}<br>${esc(r.b.confName)} · ${r.b.at.slice(0, 10)}</div></div>
          </div>
          <div style="text-align:right"><div class="score">${r.score}</div><div class="tiny dim">rule score</div></div>
        </div>
        <div class="tiny muted" style="margin:7px 0">Rules saw: ${esc(r.reasons.join("; "))}</div>
        <div id="aj_${r.key.replace(/\|/g, "_")}"></div>
        <div class="row" style="margin-top:8px">
          <button class="btn sm" onclick="adjudicate('${r.key}')">Ask AI to decide</button>
          <button class="btn ghost sm" onclick="decide('${r.key}','same')">Same person</button>
          <button class="btn ghost sm" onclick="decide('${r.key}','different')">Two people</button>
        </div>
      </div>`).join("")}
  </div>` : `<div class="alert good" style="margin-bottom:16px"><b>Review queue clear.</b>
      Every ambiguous pair has been resolved. <button class="btn ghost sm" onclick="S.decisions={};save();render()">Reset the queue</button></div>`}

  <h3>Met more than once</h3>
  <div class="contacts-grid" style="margin-bottom:22px">
    ${repeat.map(c => `
      <div class="contact-card" onclick="openContact('${c.id}')">
        <h4>${esc(c.name)}</h4>
        <div class="subtitle">${esc(c.title)}<br>${esc(c.company)}</div>
        <div class="contact-meta">
          <b>${c.touches}× over ${Math.round(c.spanDays / 30)}mo · last ${c.daysSince}d</b>
        </div>
        <div class="contact-signals">
          ${c.encounters.map(e => `<span class="contact-signal ${e.intent}" title="${esc(e.confName)}"></span>`).join("")}
        </div>
        <div style="margin-top:8px">
          <span class="contact-pattern ${c.tone === "good" ? "good" : c.tone === "bad" ? "bad" : ""}">${c.pattern}</span>
        </div>
        ${c.aliases.length > 1 ? `<div class="tiny dim" style="margin-top:6px">logged as ${c.aliases.slice(0, 2).map(esc).join(" / ")}${c.aliases.length > 2 ? "..." : ""}</div>` : ""}
        ${c.changedCompany ? `<div class="tiny" style="color:var(--c);font-weight:600;margin-top:4px">changed employer</div>` : ""}
      </div>`).join("")}
  </div>

  <h3>Met once <span class="tiny dim" style="font-weight:400">— no pattern yet</span></h3>
  <div class="card"><div class="pad" style="padding-bottom:4px"><table>
    <thead><tr><th>Name</th><th>Company</th><th>Where</th><th style="width:70px">Signal</th><th style="width:88px">HubSpot</th></tr></thead>
    <tbody>${once.map(c => `<tr onclick="openContact('${c.id}')">
      <td><b>${esc(c.name)}</b><div class="tiny dim">${esc(c.title)}</div></td>
      <td class="tiny">${esc(c.company)}</td>
      <td class="tiny dim">${esc(c.encounters[0].confName)}</td>
      <td><span class="sig ${c.encounters[0].intent}">${c.encounters[0].intent}</span></td>
      <td onclick="event.stopPropagation();pushOne('${c.id}')">
        ${S.pushed.has(c.id) ? `<span class="tiny" style="color:var(--accent)">✓ synced</span>`
          : `<button class="btn ghost sm">Push</button>`}</td></tr>`).join("")}
    </tbody></table></div></div>`;
};

async function adjudicate(key) {
  const { review } = identities();
  const r = review.find(x => x.key === key); if (!r) return;
  const slot = document.getElementById("aj_" + key.replace(/\|/g, "_"));
  slot.innerHTML = `<div class="ai"><h4>Adjudicating <span class="spin"></span></h4></div>`;
  const res = await ask(`adj:${key}`, () => AI.adjudicateMatch(r.a, r.b, r.score, r.reasons),
    () => DEMO.adjudicate[r.a.name] || { verdict: "unsure", confidence: 50,
      reasoning: "Not enough in the notes to separate these.", tell: "—" });
  if (res.__error) { slot.innerHTML = `<div class="alert bad">${esc(res.__error)}</div>`; return; }
  const same = res.verdict === "same";
  slot.innerHTML = `<div class="ai">
    <h4>Verdict ${badge(res)}</h4>
    <div class="row" style="margin-bottom:7px">
      <span class="pill" style="background:${same ? "var(--accent-soft)" : "#fdf0ee"};color:${same ? "var(--accent-ink)" : "var(--bad)"};font-size:12px">
        ${same ? "Same person" : res.verdict === "different" ? "Two different people" : "Unsure"}</span>
      <span class="tiny dim">${res.confidence}% confident</span></div>
    <p style="margin:0 0 7px;font-size:13px">${esc(res.reasoning)}</p>
    <div class="tiny muted"><b>What settled it:</b> ${esc(res.tell)}</div>
    ${res.verdict !== "unsure" ? `<button class="btn sm" style="margin-top:9px" onclick="decide('${key}','${res.verdict}')">Accept and apply</button>` : ""}
  </div>`;
}
function decide(key, v) { S.decisions[key] = v; save(); render(); }

async function openContact(id) {
  const { contacts } = identities();
  const c = contacts.find(x => x.id === id); if (!c) return;
  S.sel = id; drawContact(c);
  if (c.touches > 1) {
    const r = await ask(`arc:${id}:${c.touches}`, () => AI.relationshipArc(c),
      () => DEMO.arcs[c.name] || { arc: "Met more than once with no change in signal.", verdict: "needs a new angle",
        why: "Repeated contact without movement usually means we haven't found the real problem yet.",
        nudge: "Ask what changed in their business since you last spoke, before pitching anything.",
        avoid: "Don't repeat the same pitch a third time." });
    if (S.sel === id) drawContact(c, r);
  }
}
function drawContact(c, ai) {
  const VERDICT_TONE = { "closing": "good", "worth pushing": "good", "needs a new angle": "neutral", "politely disengage": "bad" };
  drawer(`
    <div class="spread"><div>
      <h3 style="margin:0">${esc(c.name)}</h3>
      <div class="tiny dim" style="margin-top:3px">${esc(c.title)} · ${esc(c.company)}${c.email ? " · " + esc(c.email) : ""}</div>
      <div class="row tiny" style="margin-top:7px;gap:6px">
        <span class="pill">${c.touches} encounter${c.touches > 1 ? "s" : ""}</span>
        <span class="pill" style="background:${c.tone === "good" ? "var(--accent-soft)" : c.tone === "bad" ? "#fdf0ee" : "var(--line2)"};
          color:${c.tone === "good" ? "var(--accent-ink)" : c.tone === "bad" ? "var(--bad)" : "var(--ink2)"}">${c.pattern}</span>
        <span class="pill">priority ${c.priority}</span>
      </div>
    </div><button class="x" onclick="closeDrawer()">×</button></div>`, `
    ${c.touches > 1 ? (!ai
      ? `<div class="ai"><h4>Relationship read <span class="spin"></span></h4><div class="tiny muted">Reading ${c.touches} sets of field notes…</div></div>`
      : ai.__error ? `<div class="alert bad">${esc(ai.__error)}</div>`
      : `<div class="ai">
        <h4>Relationship read ${badge(ai)}</h4>
        <p style="margin:0 0 10px;font-size:13.5px">${esc(ai.arc)}</p>
        <div class="row" style="margin-bottom:9px">
          <span class="pill" style="font-size:12px;background:${VERDICT_TONE[ai.verdict] === "good" ? "var(--accent-soft)" : VERDICT_TONE[ai.verdict] === "bad" ? "#fdf0ee" : "#fff"};
            color:${VERDICT_TONE[ai.verdict] === "good" ? "var(--accent-ink)" : VERDICT_TONE[ai.verdict] === "bad" ? "var(--bad)" : "var(--ink2)"};
            border:1px solid var(--line)">${esc(ai.verdict)}</span>
          <span class="tiny muted">${esc(ai.why)}</span></div>
        <div style="background:#fff;border:1px solid #cfe4dc;border-radius:8px;padding:11px">
          <h4 style="margin-bottom:4px">The nudge</h4>
          <div style="font-size:13px">${esc(ai.nudge)}</div></div>
        <div class="tiny muted" style="margin-top:9px"><b>Don't:</b> ${esc(ai.avoid)}</div>
      </div>`) : `<div class="alert"><b>One encounter so far.</b> There's no arc to read until you meet them again —
        the tool deliberately doesn't invent a pattern from a single data point.</div>`}

    <div><h4>Every encounter</h4>
      ${c.encounters.map((e, i) => `
        <div style="border-left:2px solid var(--line);padding:0 0 14px 14px;position:relative">
          <span style="position:absolute;left:-5px;top:3px;width:8px;height:8px;border-radius:50%;
            background:${e.intent === "hot" ? "var(--hot)" : e.intent === "warm" ? "var(--warm)" : "var(--cold)"}"></span>
          <div class="spread"><b style="font-size:13px">${esc(e.confName)}</b>
            <span class="sig ${e.intent}">${e.intent}</span></div>
          <div class="tiny dim">${e.at.slice(0, 10)} · ${esc(e.city || confById(e.confId)?.city || "")} · logged by ${esc(e.rep)}</div>
          <div class="tiny dim">as ${esc(e.name)}, ${esc(e.title)} at ${esc(e.company)}</div>
          <div style="font-size:12.5px;margin-top:5px;color:var(--ink2)">"${esc(e.note)}"</div>
        </div>`).join("")}
    </div>

    <div class="card pad">
      <h4>Push to HubSpot</h4>
      <p class="tiny muted" style="margin:0 0 9px">Sends the contact plus every encounter as timeline notes, so the
        arc survives outside this tool. Without a key configured it shows you the exact payload instead of pretending.</p>
      <button class="btn" onclick="pushOne('${c.id}')">${S.pushed.has(c.id) ? "Re-sync" : "Push to HubSpot"}</button>
      <pre id="hs_out" class="mono" style="margin:10px 0 0;white-space:pre-wrap;color:var(--ink2)"></pre>
    </div>`);
}

/* ── HubSpot ─────────────────────────────────────────────────────────
   A browser cannot call HubSpot's API directly (they don't allow CORS, and
   putting a private-app token in client JS would be wrong anyway). So the
   honest implementation is: build the exact payload, and either POST it to
   a relay URL the user configures, or show it for copy/paste. */
async function pushOne(id) {
  const { contacts } = identities();
  const c = contacts.find(x => x.id === id); if (!c) return;
  const payload = {
    properties: {
      firstname: c.name.split(" ")[0], lastname: c.name.split(" ").slice(1).join(" "),
      email: c.email, company: c.company, jobtitle: c.title,
      grain_conference_touches: c.touches,
      grain_relationship_pattern: c.pattern,
      grain_first_met_at: c.encounters[0].confName,
      grain_last_met_at: c.encounters[c.encounters.length - 1].confName,
      grain_priority: c.priority,
      hs_lead_status: c.encounters[c.encounters.length - 1].intent === "hot" ? "OPEN_DEAL" : "IN_PROGRESS",
    },
    notes: c.encounters.map(e => ({ timestamp: e.at, body: `[${e.confName}] ${e.note} — logged by ${e.rep}` })),
  };
  const relay = localStorage.getItem("hubspot_relay");
  const out = document.getElementById("hs_out");
  if (relay) {
    try {
      const res = await fetch(relay, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (out) out.textContent = res.ok ? "✓ Synced to HubSpot." : `Relay returned ${res.status}.`;
    } catch (e) { if (out) out.textContent = "Couldn't reach the relay URL: " + e.message; }
  } else if (out) {
    out.textContent = "No relay URL set (Settings). This is the payload that would be sent:\n\n"
      + JSON.stringify(payload, null, 2);
  }
  S.pushed.add(id); save();
  if (S.view === "contacts" && !out) render();
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW 5 — SIGNAL MINER.  The feature that doesn't exist in the brief.

   Conference decisions at most companies are already being made, badly, in
   Slack threads and meeting summaries nobody re-reads. The list of events
   we should consider is sitting in text we already own. This reads it.
   The output loops back into the Conferences tab as a ★ on the row.
   ══════════════════════════════════════════════════════════════════════ */
VIEWS_SIGNALS = () => {
  const known = CONFERENCES.map(c => c.name);
  const untracked = S.mined.filter(m => !m.alreadyTracked);
  const concerns = S.mined.filter(m => m.sentiment === "concern");
  const custRaised = S.mined.filter(m => m.evidence === "customer");
  return `
  <div class="head"><h1>Signal miner</h1>
    <p>Conference decisions are already being made in Slack threads and meeting notes that nobody re-reads.
       This pulls the events out of that text, marks who raised them, and flags the ones a
       <b>customer</b> mentioned — which is a different quality of signal from one of us having an idea.</p></div>

  <div class="grid" style="grid-template-columns:1fr 320px;align-items:start">
    <div>
      <div class="card pad" style="margin-bottom:14px">
        <div class="spread" style="margin-bottom:9px"><h3 style="margin:0">Paste anything</h3>
          <span class="tiny dim">Slack export, meeting summary, an email thread</span></div>
        <textarea class="inp" id="sigtext" style="min-height:132px;font-family:var(--mono);font-size:12px"
          placeholder="Paste a Slack thread or a meeting summary…">${esc(S.sigText || "")}</textarea>
        <div class="chips">
          <span class="tiny dim" style="align-self:center">Load a sample:</span>
          ${SAMPLE_SIGNALS.map((s, i) => `<button class="chip" onclick="loadSig(${i})">${esc(s.source)}</button>`).join("")}
          <button class="chip" onclick="loadSig('all')" style="border-color:var(--accent);color:var(--accent)">All four</button>
        </div>
        <div class="row" style="margin-top:11px">
          <button class="btn" id="minebtn" onclick="mine()">Find the conferences</button>
          <button class="btn ghost" onclick="discoverNew()">Suggest events we're missing</button>
          ${S.mined.length ? `<button class="btn ghost" onclick="S.mined=[];save();render()">Clear</button>` : ""}
        </div>
      </div>

      <div id="mineout">
      ${S.mined.length ? `
        <div class="card pad">
          <div class="spread" style="margin-bottom:10px"><h3 style="margin:0">${S.mined.length} events found</h3>
            <span class="tiny dim">${custRaised.length} raised by customers · ${concerns.length} flagged as a miss</span></div>
          ${S.mined.map(m => {
            const match = CONFERENCES.find(c => normName(c.name) === normName(m.name)) ||
              CONFERENCES.find(c => normName(c.name).includes(normName(m.name).slice(0, 10)));
            const s = match ? scoreConference(match, S.weights) : null;
            return `<div style="border-top:1px solid var(--line2);padding:11px 0">
              <div class="spread">
                <div class="row" style="gap:8px">
                  ${s ? `<span class="tier ${s.tier}">${s.tier}</span>` : `<span class="tier D" style="background:var(--ink3)">?</span>`}
                  <div><b>${esc(m.name)}</b>
                    <div class="tiny dim">raised by ${esc(m.mentionedBy || "the team")}
                      ${m.evidence === "customer" ? `· <b style="color:var(--accent)">customer signal</b>` : "· internal"}</div></div>
                </div>
                <div class="row">
                  ${m.sentiment === "concern" ? `<span class="pill" style="background:#fdf0ee;color:var(--bad)">we're missing this</span>` : ""}
                  ${match ? (S.attending.has(match.id) ? `<span class="tiny" style="color:var(--accent)">✓ booked</span>`
                      : `<button class="btn ghost sm" onclick="toggleGoing('${match.id}')">Add to plan</button>`)
                    : `<span class="pill">not in our database</span>`}
                </div>
              </div>
              <div class="tiny muted" style="margin-top:5px">"${esc(m.context)}"</div>
            </div>`; }).join("")}
          ${concerns.length ? `<div class="alert bad" style="margin-top:13px"><b>The headline.</b>
            ${concerns.length} event${concerns.length > 1 ? "s were" : " was"} raised as something we missed or
            didn't know about — ${custRaised.length ? `${custRaised.length} of them by customers or prospects rather than by us.` : ""}
            That's the gap between what the team already knows and what the plan reflects.</div>` : ""}
        </div>` : `<div class="empty">Load a sample and press <b>Find the conferences</b>.</div>`}
      </div>
    </div>

    <div class="card pad">
      <h4>Why this is the AI feature</h4>
      <p class="tiny muted" style="line-height:1.65">A conference name inside a Slack message is misspelled,
        abbreviated, mixed into unrelated chat, and carries the thing that actually matters —
        <i>whether a customer raised it</i> — only in the surrounding sentence.
        No regex survives that. Reading unstructured language and judging what it implies is the one job
        where a model is unambiguously the right tool.</p>
      <p class="tiny muted" style="line-height:1.65">Today it reads a paste box. The same function takes its input
        from a Slack MCP connector and a meeting-notes API without changing — the parsing is the hard part,
        and it's done.</p>
      <div class="alert good tiny" style="margin-top:10px">Anything found here shows as a <b>★</b> on the
        Conferences tab, so the signal lands where the decision is made rather than in a thread.</div>
    </div>
  </div>`;
};
function loadSig(i) {
  S.sigText = i === "all" ? SAMPLE_SIGNALS.map(s => `--- ${s.source} (${s.date}) ---\n${s.text}`).join("\n\n")
    : `--- ${SAMPLE_SIGNALS[i].source} (${SAMPLE_SIGNALS[i].date}) ---\n${SAMPLE_SIGNALS[i].text}`;
  render();
}
async function mine() {
  const t = document.getElementById("sigtext").value.trim();
  if (!t) return alert("Paste some text, or load one of the samples.");
  S.sigText = t;
  const b = document.getElementById("minebtn");
  b.disabled = true; b.innerHTML = `<span class="spin"></span> Reading…`;
  const r = await ask(`mine:${t.length}:${t.slice(0, 40)}`,
    () => AI.mineSignals(t, CONFERENCES.map(c => c.name)), () => DEMO.mineSignals);
  b.disabled = false; b.textContent = "Find the conferences";
  if (r.__error) { document.getElementById("mineout").innerHTML = `<div class="alert bad">${esc(r.__error)}</div>`; return; }
  S.mined = (r.mentions || []).map(m => ({ ...m, source: "internal signal" }));
  save(); render();
}
async function discoverNew() {
  const out = document.getElementById("mineout");
  out.innerHTML = `<div class="card pad"><h3>Looking for gaps <span class="spin"></span></h3></div>`;
  const byRegion = {};
  upcoming().forEach(c => { if (S.attending.has(c.id)) byRegion[c.region] = (byRegion[c.region] || 0) + 1; });
  const gaps = `Booked by region: ${JSON.stringify(byRegion)}. Verticals we currently under-cover: travel wholesale, marketplaces, LATAM.`;
  const r = await ask(`disc:${gaps}`, () => AI.discover(CONFERENCES.map(c => c.name), gaps), () => DEMO.discover);
  if (r.__error) { out.innerHTML = `<div class="alert bad">${esc(r.__error)}</div>`; return; }
  out.innerHTML = `<div class="card pad">
    <div class="spread" style="margin-bottom:4px"><h3 style="margin:0">Events we don't track</h3>${badge(r)}</div>
    <p class="tiny muted" style="margin:0 0 10px">Each one comes with the honest reason it might not be worth it —
      a suggestion without a risk attached isn't advice.</p>
    ${(r.suggestions || []).map(s => `<div style="border-top:1px solid var(--line2);padding:11px 0">
      <div class="spread"><b>${esc(s.name)}</b>
        <span class="tiny dim">${esc(s.typicalMonth)} · ${esc(s.typicalCity)} · ${esc(s.vertical)}</span></div>
      <div style="font-size:12.5px;margin-top:4px">${esc(s.whyUs)}</div>
      <div class="tiny" style="margin-top:4px;color:var(--c)"><b>Risk:</b> ${esc(s.risk)}</div>
    </div>`).join("")}</div>`;
}

/* ══════════════════════════════════════════════════════════════════════
   VIEW 6 — SETTINGS.  Keys live in the browser, never in the source.
   ══════════════════════════════════════════════════════════════════════ */
VIEWS_SETTINGS = () => {
  const c = AI.cfg();
  return `
  <div class="head"><h1>Settings</h1>
    <p>Keys are stored in this browser only. Nothing is committed to the repository and nothing is sent anywhere
       except the provider you choose.</p></div>

  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card pad">
      <h3>AI provider</h3>
      <div class="kv" style="margin-bottom:12px">
        <label>Provider</label>
        <select class="inp" onchange="localStorage.setItem('ai_provider',this.value);localStorage.removeItem('ai_model');render()">
          <option value="anthropic"${c.provider === "anthropic" ? " selected" : ""}>Anthropic (Claude)</option>
          <option value="openai"${c.provider === "openai" ? " selected" : ""}>OpenAI</option>
        </select>
        <label>API key</label>
        <input class="inp" type="password" value="${esc(c.key)}" placeholder="${c.provider === "openai" ? "sk-…" : "sk-ant-…"}"
          oninput="localStorage.setItem('ai_key',this.value)">
        <label>Model</label>
        <input class="inp" value="${esc(c.model)}" oninput="localStorage.setItem('ai_model',this.value)">
      </div>
      <div class="row">
        <button class="btn" onclick="testKey()">Test the key</button>
        <button class="btn ghost" onclick="localStorage.removeItem('ai_key');S.aiCache={};save();render()">Clear key</button>
        <button class="btn ghost" onclick="S.aiCache={};save();alert('AI response cache cleared.')">Clear cache</button>
      </div>
      <div id="keytest" class="tiny" style="margin-top:9px"></div>
      <div class="alert ${AI.hasKey() ? "good" : ""}" style="margin-top:12px">
        ${AI.hasKey() ? `<b>Live mode.</b> Every AI feature calls the provider.`
          : `<b>Demo mode.</b> No key set, so AI features return pre-written responses of the same shape,
             badged <i>demo response</i>. Everything stays clickable — the tool doesn't dead-end on a missing key.`}
      </div>
    </div>

    <div class="card pad">
      <h3>HubSpot</h3>
      <p class="tiny muted" style="margin:-4px 0 10px;line-height:1.6">HubSpot's API can't be called from a browser —
        no CORS, and a private-app token in client-side JavaScript would be readable by anyone who opens the page.
        So the tool builds the exact payload and POSTs it to a relay you control (a Make/Zapier webhook or a small
        serverless function). No relay set means it shows the payload rather than pretending to sync.</p>
      <div class="kv">
        <label>Relay URL</label>
        <input class="inp" placeholder="https://hook.eu2.make.com/…" value="${esc(localStorage.getItem("hubspot_relay") || "")}"
          oninput="localStorage.setItem('hubspot_relay',this.value)">
      </div>
      <div class="alert" style="margin-top:11px"><b>Custom properties the payload expects:</b>
        <span class="mono">grain_conference_touches</span>, <span class="mono">grain_relationship_pattern</span>,
        <span class="mono">grain_first_met_at</span>, <span class="mono">grain_last_met_at</span>,
        <span class="mono">grain_priority</span></div>

      <h3 style="margin-top:20px">Data</h3>
      <div class="row">
        <button class="btn ghost sm" onclick="exportAll()">Export everything as JSON</button>
        <button class="btn ghost sm" onclick="if(confirm('Reset all captured leads, decisions and weights?')){localStorage.clear();location.reload()}">Reset the demo</button>
      </div>
      <div class="tiny dim" style="margin-top:8px">${S.extra.length} leads captured in this browser ·
        ${Object.keys(S.decisions).length} match decisions · ${Object.keys(S.aiCache).length} cached AI responses</div>
    </div>
  </div>`;
};
async function testKey() {
  const el = document.getElementById("keytest");
  el.innerHTML = `<span class="spin"></span> Testing…`;
  try {
    const r = await AI.call("Reply with JSON only.", 'Return {"ok":true}', { maxTokens: 32 });
    el.innerHTML = r?.ok ? `<b style="color:var(--accent)">✓ Working.</b> Live AI is on.`
      : `<b style="color:var(--accent)">✓ Responded.</b>`;
  } catch (e) { el.innerHTML = `<b style="color:var(--bad)">✕</b> ${esc(humanError(e.message))}`; }
}
function exportAll() {
  const { contacts } = identities();
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), weights: S.weights,
    attending: [...S.attending], contacts, mined: S.mined }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "grain-conference-intelligence.json"; a.click();
}

/* ── drawer ──────────────────────────────────────────────────────────── */
function drawer(head, body) {
  let d = document.getElementById("drawer");
  if (!d) {
    document.body.insertAdjacentHTML("beforeend",
      `<div class="scrim" id="scrim" onclick="closeDrawer()"></div><div class="drawer" id="drawer"></div>`);
    d = document.getElementById("drawer");
  }
  document.body.style.overflow = "hidden";
  d.innerHTML = `<div class="dh">${head}</div><div class="db">${body}</div>`;
}
function closeDrawer() {
  S.sel = null;
  document.getElementById("drawer")?.remove();
  document.getElementById("scrim")?.remove();
  document.body.style.overflow = "";
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

const VIEWS = { conferences: VIEWS_CONF, plan: VIEWS_PLAN, field: VIEWS_FIELD,
  contacts: VIEWS_CONTACTS, signals: VIEWS_SIGNALS, settings: VIEWS_SETTINGS };

/* ══════════════════════════════════════════════════════════════════════
   BOOT

   Load from Postgres, then render. Realtime keeps two reps on the same
   show floor looking at the same thing without either of them refreshing.
   ══════════════════════════════════════════════════════════════════════ */
async function reload() {
  const d = await DB.loadAll();
  CONFERENCES = d.conferences; ENCOUNTERS = d.encounters; LEADS = d.leads;
  S.attending = new Set(CONFERENCES.filter(c => c.status === "Attending").map(c => c.id));
  render();
}

function fatal(msg) {
  document.getElementById("main").innerHTML = `
    <div class="head"><h1>Can't reach the database</h1>
      <p>${esc(msg)}</p></div>
    <div class="card pad">
      <h3>What to check</h3>
      <ul style="font-size:13px;line-height:1.8;color:var(--ink2)">
        <li>The Supabase project is awake — free projects pause after a week idle.</li>
        <li><span class="mono">SUPABASE_URL</span> and the anon key in <span class="mono">config.js</span> match the project.</li>
        <li>Row Level Security has a policy allowing this role to read.</li>
      </ul>
      <button class="btn" onclick="location.reload()">Try again</button>
    </div>`;
}

(async function boot() {
  document.getElementById("nav").innerHTML = "";
  document.getElementById("main").innerHTML =
    `<div class="empty"><span class="spin"></span> Loading from Postgres…</div>`;
  try {
    await reload();
    // Debounced: a burst of inserts from an n8n flow should repaint once.
    let t;
    DB.onChange(() => { clearTimeout(t); t = setTimeout(() => reload().catch(() => {}), 400); });
  } catch (e) { fatal(e.message); }
})();
