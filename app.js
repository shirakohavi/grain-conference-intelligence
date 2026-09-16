/* ══════════════════════════════════════════════════════════════════════════
   Conference Intelligence, UI + state.
   No framework, no build step. Open index.html and it runs.
   REDESIGNED: Notion-style views, quiet inline filters, improved contacts grid.
   ══════════════════════════════════════════════════════════════════════════ */

// Loaded from Postgres at boot. Declared here so every view can reach them.
let CONFERENCES = [], ENCOUNTERS = [], LEADS = [], TEAM = [];

const TODAY = "2026-09-14";           // demo clock, so the seeded year reads correctly
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  view: "conferences",
  // Conferences, leads and encounters all live in Postgres now. `attending`
  // is derived from conferences.status rather than kept separately, one
  // source of truth, so n8n and the app can never disagree.
  attending: new Set(),
  extra: [],                                     // unused: captures go straight to the DB
  decisions: LS.get("matchDecisions", {}),       // resolved review-queue items
  // The model changed from five criteria to four. A browser holding the old
  // saved weights would score every event wrong, silently, so anything whose
  // shape does not match the current model is dropped.
  weights: (() => {
    const w = LS.get("weights", null);
    const ok = w && Object.keys(w).length === Object.keys(DEFAULT_WEIGHTS).length
      && Object.keys(DEFAULT_WEIGHTS).every(k => typeof w[k] === "number");
    return ok ? w : { ...DEFAULT_WEIGHTS };
  })(),
  aiCache: LS.get("aiCache", {}),
  pushed: new Set(LS.get("pushed", [])),         // contacts actually sent to HubSpot
  queued: new Set(LS.get("queued", [])),         // hot/warm, waiting on a relay URL
  sel: null, busy: {}, backTo: null,
  wOpen: null,                                   // which weight's explainer is open
};
// Only genuinely local preferences are persisted in the browser. Anything
// the team shares lives in the database.
const save = () => {
  LS.set("matchDecisions", S.decisions); LS.set("weights", S.weights);
  LS.set("aiCache", S.aiCache);
  // This was being read at startup and never written, so every push was
  // forgotten on reload. A sync state you cannot trust is worse than none.
  LS.set("pushed", [...S.pushed]); LS.set("queued", [...S.queued]);
};

/* ── derived ─────────────────────────────────────────────────────────── */
const confById = id => CONFERENCES.find(c => c.id === id);
const allEncounters = () => ENCOUNTERS
  .map(e => ({ ...e, confName: confById(e.confId)?.name || e.confId }));
const scored = () => CONFERENCES.map(c => ({ c, s: scoreConference(c, S.weights) }));
const upcoming = () => CONFERENCES.filter(c => c.start >= TODAY);
const identities = () => resolveIdentities(allEncounters(), S.decisions);

/* Three tag colours, not twenty-six. Blue marks payments and fintech, sand
   marks travel, Grain's two core verticals, everything else stays grey. */
const TAG_TONE = v =>
  /payment|psp|acquir|open banking|fintech|banking|treasury|inclusion|stablecoin|digital assets/i.test(v) ? "blue"
  : /travel|luxury/i.test(v) ? "sand" : "";
const tag = v => `<span class="pill ${TAG_TONE(v)}">${esc(v)}</span>`;

/* Who is logging. Set in Settings, and field mode keeps its own copy because
   it runs on a different device. */
/* Who is logged in, as a roster id rather than a typed string. The old free
   text is still read once so an existing browser does not lose its setting. */
const REP_ID = () => localStorage.getItem("rep_id") || "";
const REP_NAME = () => {
  const t = teamById(REP_ID());
  return t ? t.name : (localStorage.getItem("rep_name") || "Unassigned");
};
/* A dropdown over the roster. Used anywhere a rep has to say who they are,
   so the name always joins back to a person instead of being spelled three
   different ways by the same human. */
const repSelect = (value, onchange, { placeholder = "Choose your name" } = {}) =>
  `<select class="inp" onchange="${onchange}">
     <option value=""${!value ? " selected" : ""}>${placeholder}</option>
     ${TEAM.map(t => `<option value="${t.id}"${value === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}
   </select>`;

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtRange = c => c.start === c.end ? `${fmtDate(c.start)} ${c.start.slice(0, 4)}`
  : `${fmtDate(c.start)}–${fmtDate(c.end)} ${c.end.slice(0, 4)}`;
/* Dates the way the team writes them. */
const fmtDMY = iso => {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};
const monthLong = k => new Date(k + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
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
  if (/429|rate/i.test(m)) return "Rate limited by the provider, wait a moment and retry.";
  if (/fetch|network/i.test(m)) return "Couldn't reach the provider from the browser.";
  return m;
}
const badge = r => r?.__demo
  ? `<span class="badge">demo response</span>`
  : `<span class="badge">live${AI.viaProxy() ? " · via n8n" : ""}</span>`;

/* ── shell ───────────────────────────────────────────────────────────── */
const IC = {
  conferences: '<path d="M2 4h12M2 8h12M2 12h12"/>',
  plan:        '<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
  contacts:    '<circle cx="6" cy="6" r="2.5"/><path d="M1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/><path d="M11 4.2a2.4 2.4 0 010 4.6M12.4 13.8c0-1.6-.5-2.7-1.4-3.4"/>',
  settings:    '<path d="M2 5h12M2 11h12"/><circle cx="6" cy="5" r="1.8"/><circle cx="10.5" cy="11" r="1.8"/>',
};
const icon = k => `<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;

const NAVS = [
  ["conferences", "Conferences"],
  ["plan",        "Plan the year"],
  ["contacts",    "Contacts"],
  ["settings",    "Settings"],
];

function render() {
  const { review } = identities();
  // Settings sits at the bottom, away from the pages a rep uses daily.
  document.getElementById("nav").innerHTML = NAVS.map(([k, label]) => {
    let cnt = "";
    if (k === "contacts") { const n = identities().contacts.length; if (n) cnt = `<span class="cnt">${n}</span>`; }
    if (k === "plan" && S.attending.size) cnt = `<span class="cnt">${S.attending.size}</span>`;
    return `<button class="nav ${S.view === k ? "on" : ""} ${k === "settings" ? "last" : ""}" onclick="go('${k}')">
      ${icon(k)}${label}${cnt}</button>`;
  }).join("");
  if (!VIEWS[S.view]) S.view = "conferences";     // the signals page is gone
  document.getElementById("main").innerHTML = VIEWS[S.view]();
  if (VIEWS[S.view].after) VIEWS[S.view].after();
}
function go(v) { S.view = v; S.sel = null; render(); window.scrollTo(0, 0); }

/* ══════════════════════════════════════════════════════════════════════
   VIEW 1, CONFERENCES.  Decide what's worth attending.
   REDESIGNED: Quiet inline filter bar instead of boxed inputs.
   ══════════════════════════════════════════════════════════════════════ */
const F = { q: "", region: "", tier: "", when: "upcoming", vertical: "", size: "", status: "" };

/* One dropdown builder for the whole filter bar. Every filter is a select, so
   nothing on this page is a row of buttons pretending to be a control. */
const FSEL = (key, allLabel, opts) => `
  <select class="filter-control" onchange="F.${key}=this.value;render()">
    <option value="">${allLabel}</option>
    ${opts.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}"${F[key] === v ? " selected" : ""}>${esc(l)}</option>`;
    }).join("")}
  </select>`;

/* The four weights, with what each one means. Definitions live in engine.js so
   the number and its meaning cannot drift apart. */
function weightsPanel() {
  const total = Object.values(S.weights).reduce((a, b) => a + b, 0);
  return `
  <div class="card pad wstrip">
    <div class="spread wstrip-head">
      <h4 style="margin:0">Scoring weights</h4>
      <div class="row" style="gap:10px">
        <span class="tiny ${total === 100 ? "dim" : "bad"}" id="wtotal">${total} / 100</span>
        <button class="btn ghost sm" onclick="S.weights={...DEFAULT_WEIGHTS};S.aiCache={};save();render()">Reset</button>
      </div>
    </div>
    <div class="wgrid">
      ${Object.keys(DEFAULT_WEIGHTS).map(k => {
        const w = WEIGHT_INFO[k];
        const open = S.wOpen === k;
        return `
        <div class="wrow ${open ? "open" : ""}">
          <div class="spread" style="align-items:baseline">
            <button class="wname" onclick="S.wOpen = S.wOpen === '${k}' ? null : '${k}'; render()">
              ${esc(w.label)}<span class="winfo">?</span></button>
            <b class="mono" id="wv_${k}">${S.weights[k]}</b>
          </div>
          <div class="tiny dim">${esc(w.short)}</div>
          <input type="range" min="0" max="60" value="${S.weights[k]}"
            oninput="reweight('${k}', +this.value)" onchange="save();render()">
        </div>`;
      }).join("")}
    </div>
    ${S.wOpen ? `<div class="wexp">
      <b>${esc(WEIGHT_INFO[S.wOpen].label)}</b>
      <p>${esc(WEIGHT_INFO[S.wOpen].long)}</p>
      <div class="tiny dim">${esc(WEIGHT_INFO[S.wOpen].source)}</div></div>` : ""}
  </div>`;
}

VIEWS_CONF = () => {
  let list = scored();
  if (F.when === "upcoming") list = list.filter(x => x.c.start >= TODAY);
  if (F.when === "past") list = list.filter(x => x.c.start < TODAY);
  if (F.region) list = list.filter(x => x.c.region === F.region);
  if (F.tier) list = list.filter(x => F.tier === "?" ? x.s.unscored : x.s.tier === F.tier);
  if (F.vertical) list = list.filter(x => x.c.verticals.includes(F.vertical));
  if (F.size) list = list.filter(x => (sizeBand(x.c.audienceSize) || {}).key === F.size);
  if (F.status) list = list.filter(x => x.c.status === F.status);
  if (F.q) { const q = F.q.toLowerCase();
    list = list.filter(x => (x.c.name + x.c.city + x.c.country + x.c.verticals.join()).toLowerCase().includes(q)); }
  // Unscored events sort to the top: they are the ones that need a person.
  list.sort((a, b) => (b.s.unscored ? 1e6 : b.s.total) - (a.s.unscored ? 1e6 : a.s.total));

  const regions = [...new Set(CONFERENCES.map(c => c.region))].sort();
  const verts = [...new Set(CONFERENCES.flatMap(c => c.verticals))].sort();
  const needScore = scored().filter(x => x.s.unscored).length;

  return `
  <div class="head">
    <div class="spread">
      <h1>Conferences</h1>
      <button class="btn" onclick="openAddConference()">Add conference</button>
    </div>
  </div>

  <div class="filter-bar">
    <input class="filter-input" id="convq" placeholder="Search" value="${esc(F.q)}"
      oninput="F.q=this.value;render()">
    ${FSEL("when", "All dates", [["upcoming", "Upcoming"], ["past", "Already happened"]])}
    ${FSEL("region", "All regions", regions.map(r => [r, rshort(r)]))}
    ${FSEL("vertical", "All verticals", verts)}
    ${FSEL("status", "All statuses", STATUSES)}
    ${FSEL("size", "Any size", SIZE_BANDS.map(b => [b.key, b.label]))}
    ${FSEL("tier", "All tiers", [["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"], ["?", "Not scored"]])}
    <div class="filter-stat">${list.length} of ${CONFERENCES.length}</div>
  </div>

  ${needScore ? `<button class="needbar" onclick="F.tier='?';F.when='';render()">
    <span class="needdot"></span>${needScore} event${needScore > 1 ? "s" : ""} need${needScore > 1 ? "" : "s"} scoring</button>` : ""}

  ${weightsPanel()}

  <div class="card" style="margin-top:16px">
      <div class="pad tablewrap" style="padding-bottom:6px" id="conftable">${confTableHTML(list)}</div>
  </div>`;
};

/* The table is its own function so moving a scoring slider can refresh it
   without rebuilding the slider the mouse is holding. */
function confTableHTML(list) {
  return `<table>
        <thead><tr>
          <th style="min-width:180px">Event</th>
          <th style="width:104px">Vertical</th>
          <th style="width:96px">Size</th>
          <th style="width:112px">Covered by</th>
          <th style="width:104px">Status</th>
          <th style="width:118px">How we show up</th>
          <th style="width:62px">Fit</th>
          <th style="width:128px">When and where</th>
        </tr></thead>
        <tbody>${list.map(({ c, s }) => {
          return `<tr class="${s.unscored ? "needs" : ""}" onclick="openConf('${c.id}')">
            <td>
              <div class="cell-name">${esc(c.name)}</div>
              ${!c.datesConfirmed || c.attendedBefore ? `<div class="row" style="gap:5px;margin-top:3px">
                ${!c.datesConfirmed ? `<span class="pill warn">dates estimated</span>` : ""}
                ${c.attendedBefore ? `<span class="pill outline">attended before</span>` : ""}
              </div>` : ""}
            </td>
            <td><div class="tags">${c.verticals.slice(0, 2).map(tag).join("")}${
                 c.verticals.length > 2 ? `<span class="pill outline">+${c.verticals.length - 2}</span>` : ""}</div></td>
            <td>${sizePill(c.audienceSize)}</td>
            <td onclick="event.stopPropagation()">
              <button class="peoplebtn" onclick="openCovering('${c.id}', event)">${peopleCell(c.covering)}</button></td>
            <td onclick="event.stopPropagation()">
              <select class="status st-${c.status.replace(/\s/g, "")}" onchange="setStatus('${c.id}', this.value)">
                ${STATUSES.map(o => `<option${c.status === o ? " selected" : ""}>${o}</option>`).join("")}
              </select></td>
            <td onclick="event.stopPropagation()">
              <button class="actbtn ${(c.activations || []).length ? "on" : ""}" onclick="openActivations('${c.id}', event)">
                ${(c.activations || []).length
                  ? (c.activations || []).map(a => `<span class="pill act">${esc(a)}</span>`).join("")
                  : `<span class="dim">Not decided</span>`}
              </button></td>
            <td>${s.unscored
              ? `<span class="tier Q" title="No estimates yet">?</span>`
              : `<div class="row" style="gap:7px;flex-wrap:nowrap">
                   <span class="tier ${s.tier}">${s.tier}</span><span class="score">${s.total}</span></div>`}</td>
            <td class="tiny muted">${fmtRange(c)}<div class="dim">${esc(c.city)}, ${esc(c.country)}</div></td>
          </tr>`; }).join("")}
        </tbody></table>
        ${list.length ? "" : `<div class="empty">Nothing matches those filters.</div>`}`;
}

/* Dragging a weight: update the readout, the total and the table. Never the
   slider, because replacing it mid-drag drops the pointer and the value ends
   up wherever the dead element was. */
function reweight(k, v) {
  S.weights[k] = v; S.aiCache = {};
  const r = document.getElementById("wv_" + k); if (r) r.textContent = v;
  const t = document.getElementById("wtotal");
  const total = Object.values(S.weights).reduce((a, b) => a + b, 0);
  if (t) { t.textContent = total + " / 100"; t.className = "tiny " + (total === 100 ? "dim" : "bad"); }
  const box = document.getElementById("conftable");
  if (box) {
    let l = scored();
    if (F.when === "upcoming") l = l.filter(x => x.c.start >= TODAY);
    if (F.when === "past") l = l.filter(x => x.c.start < TODAY);
    if (F.region) l = l.filter(x => x.c.region === F.region);
    if (F.tier) l = l.filter(x => F.tier === "?" ? x.s.unscored : x.s.tier === F.tier);
    if (F.vertical) l = l.filter(x => x.c.verticals.includes(F.vertical));
    if (F.size) l = l.filter(x => (sizeBand(x.c.audienceSize) || {}).key === F.size);
    if (F.status) l = l.filter(x => x.c.status === F.status);
    if (F.q) { const q = F.q.toLowerCase();
      l = l.filter(x => (x.c.name + x.c.city + x.c.country + x.c.verticals.join()).toLowerCase().includes(q)); }
    l.sort((a, b) => (b.s.unscored ? 1e6 : b.s.total) - (a.s.unscored ? 1e6 : a.s.total));
    box.innerHTML = confTableHTML(l);
  }
}
VIEWS_CONF.after = () => {
  const e = document.getElementById("convq");
  if (e && F.q) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
};

async function openConf(id) {
  S.sel = id; drawConf();
  const c = confById(id), s = scoreConference(c, S.weights);
  if (s.unscored) return;     // nothing to interpret until somebody scores it
  const r = await ask(`interp:${id}:${JSON.stringify(S.weights)}`,
    () => AI.interpretScore(c, s), () => DEMO.interpret(c, s));
  if (S.sel === id) drawConf(r);
}
function drawConf(ai) {
  const c = confById(S.sel); if (!c) return;
  const s = scoreConference(c, S.weights);
  const met = allEncounters().filter(e => e.confId === c.id);
  const wsum = Object.values(S.weights).reduce((a, b) => a + b, 0) || 1;

  const head = `
    ${S.backTo ? `<button class="linkbtn" style="margin-bottom:8px" onclick="backToContact()">Back to the contact</button>` : ""}
    <div class="spread"><div>
      <div class="row" style="gap:8px">
        <span class="tier ${s.unscored ? "Q" : s.tier}">${s.unscored ? "?" : s.tier}</span>
        <h3 style="margin:0">${esc(c.name)}</h3></div>
      <div class="tiny dim" style="margin-top:4px">${fmtRange(c)} · ${esc(c.city)}, ${esc(c.country)}${
        c.audienceSize != null ? ` · ~${c.audienceSize.toLocaleString()} attending` : ""} · ticket ${eur(c.ticketEur)}</div>
    </div><button class="x" onclick="closeDrawer()">×</button></div>`;

  /* ── an event nobody has assessed yet ─────────────────────────────── */
  if (s.unscored) {
    const miss = [["audienceSize", "How many people attend"], ["icpDensity", WEIGHT_INFO.icpDensity.label],
                  ["seniority", WEIGHT_INFO.seniority.label], ["strategic", WEIGHT_INFO.strategic.label]]
                 .filter(([k]) => c[k] == null || c[k] === "");
    return drawer(head, `
      <div class="alert warn">
        <b>Not scored yet.</b> Nobody has filled in the estimates.
      </div>
      ${c.note ? `<div class="tiny muted">${esc(c.note)}</div>` : ""}
      <div>
        <h4>Fill these in and it ranks with the rest</h4>
        ${miss.map(([k, label]) => `
          <div style="padding:9px 0;border-top:1px solid var(--line)">
            <div class="spread" style="margin-bottom:5px">
              <span style="font-size:12.5px;font-weight:600">${esc(label)}</span></div>
            ${k === "audienceSize"
              ? `<input class="inp" type="number" placeholder="e.g. 2000"
                   onchange="editEstimate('${c.id}','audienceSize',+this.value)">`
              : `<div class="row" style="gap:9px;flex-wrap:nowrap">
                   <input type="range" min="0" max="100" value="50"
                     onchange="editEstimate('${c.id}','${k}',+this.value)">
                   <b class="mono" style="width:28px;text-align:right">50</b></div>
                 <div class="tiny dim" style="margin-top:3px">${esc(WEIGHT_INFO[k].short)}</div>`}
          </div>`).join("")}
      </div>`);
  }

  /* ── a scored event ────────────────────────────────────────────────── */
  drawer(head, `
    <div class="scorebar">
      <span class="tier ${s.tier}">${s.tier}</span>
      <span class="scorebig">${s.total}</span>
      <span class="tiny dim">of 100</span>
    </div>


    <div>
      <h4>How this score is built</h4>

      ${Object.keys(DEFAULT_WEIGHTS).map(k => `
        <div style="padding:9px 0;border-top:1px solid var(--line)">
          <div class="spread" style="margin-bottom:5px">
            <span style="font-size:12.5px;font-weight:600">${esc(WEIGHT_INFO[k].label)}</span>
            <span class="tiny dim">${s.parts[k]} of 100 · ${Math.round(S.weights[k] / wsum * 100)}% of the score</span>
          </div>
          <div class="row" style="gap:9px;flex-wrap:nowrap">
            <input type="range" min="0" max="100" value="${s.parts[k]}"
              ${k === "efficiency" ? "disabled title='Calculated, not editable'" :
                `oninput="editEstimate('${c.id}','${k}',+this.value)"`}>
            <b class="mono" style="width:28px;text-align:right">${s.parts[k]}</b>
          </div>
          <div class="tiny dim" style="margin-top:3px">${esc(WEIGHT_INFO[k].short)}</div>
        </div>`).join("")}

      <div style="border-top:2px solid var(--line);margin-top:12px;padding-top:12px">
        <h4>The arithmetic</h4>
        <div class="mono" style="font-size:11.5px;line-height:1.9;color:var(--ink2)">
          ${Object.keys(DEFAULT_WEIGHTS).map(k =>
            `${String(s.parts[k]).padStart(3)} × ${String(S.weights[k]).padStart(2)}`).join("<br>")}
          <br>─────────
          <br>÷ ${wsum} = <b>${s.raw}</b> raw
          <br>scaled to <b style="font-size:14px">${s.total}</b> out of 100
        </div>
        <p class="tiny dim" style="margin-top:8px">Raw scores land between 12 and 80. Stretched to 0 to 100 so the tiers separate. Ranking is unchanged.</p>
      </div>
    </div>

    <div>
      <h4>Where ${eur(s.eff.costPerContact)} per contact comes from</h4>
      <div style="background:var(--bg);border-radius:var(--r);padding:13px;font-size:12.5px;line-height:2">
        <div class="spread"><span>Ticket</span><b class="mono">${eur(c.ticketEur)}</b></div>
        <div class="spread"><span>Flights and hotel from Tel Aviv</span><b class="mono">${eur(s.eff.travel)}</b></div>
        <div class="spread" style="border-top:1px solid var(--line);padding-top:5px">
          <span><b>Total to send one rep</b></span><b class="mono">${eur(c.ticketEur + s.eff.travel)}</b></div>
        <div class="spread" style="margin-top:7px"><span>Days on the floor</span><b class="mono">${s.eff.days}</b></div>
        <div class="spread"><span>Conversations per rep per day</span><b class="mono">${MEETINGS_PER_DAY}</b></div>
        <div class="spread"><span>People here who fit our ICP</span>
          <b class="mono">${Math.round(c.audienceSize * c.icpDensity / 100).toLocaleString()}</b></div>
        <div class="spread" style="border-top:1px solid var(--line);padding-top:5px">
          <span><b>Conversations you can actually have</b></span><b class="mono">${s.eff.reachable}</b></div>
        <div class="spread" style="border-top:2px solid var(--line);padding-top:7px;margin-top:5px">
          <span><b>Cost per useful conversation</b></span>
          <b class="mono" style="font-size:14px">${eur(s.eff.costPerContact)}</b></div>
      </div>
    </div>

    ${c.note ? `<div><h4>Note</h4><div style="font-size:13px">${esc(c.note)}</div></div>` : ""}

    ${!ai ? `<div class="ai"><h4>AI read <span class="spin"></span></h4></div>`
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

    </div>`);
}
/* Estimates are opinions, so they are editable in place. Changing one
   re-scores the event and saves, which is the point: a sales lead who thinks
   the room is more junior than we assumed can say so. */
let _estTimer;
async function editEstimate(id, key, value) {
  const c = confById(id); if (!c) return;
  c[key] = value;
  drawConf(S.aiCache[`interp:${id}:${JSON.stringify(S.weights)}`]);
  const col = { icpDensity: "icp_density", seniority: "seniority",
                strategic: "strategic", audienceSize: "audience_size" }[key];
  if (!col) return;
  clearTimeout(_estTimer);
  _estTimer = setTimeout(async () => {
    try { await DB.sb.from("conferences").update({ [col]: value }).eq("id", id); render(); }
    catch (e) { toast("Couldn't save that estimate: " + e.message, true); }
  }, 700);
}

/* A small checkbox popover rather than a multi-select, because a native
   <select multiple> needs cmd-click to deselect and nobody discovers that. */
function openActivations(id, ev) {
  ev.stopPropagation();
  closeActivations();
  const c = confById(id); if (!c) return;
  const r = ev.currentTarget.getBoundingClientRect();
  const html = `<div class="actpop" id="actpop" style="top:${Math.min(r.bottom + 6, innerHeight - 340)}px;left:${r.left}px">
    <div class="actpop-h">How we show up at ${esc(c.name)}</div>
    ${ACTIVATIONS.map(a => `
      <label class="actopt">
        <input type="checkbox" ${(c.activations || []).includes(a) ? "checked" : ""}
          onchange="toggleActivation('${id}', ${JSON.stringify(a).replace(/"/g, "&quot;")}, this.checked)">
        <span>${esc(a)}</span>
      </label>`).join("")}
    <div class="actpop-f">Pick as many as apply.</div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", `<div class="actscrim" onclick="closeActivations()"></div>` + html);
}
function closeActivations() {
  document.getElementById("actpop")?.remove();
  document.querySelector(".actscrim")?.remove();
}

let _actTimer;
async function toggleActivation(id, value, on) {
  const c = confById(id); if (!c) return;
  const cur = c.activations || [];
  c.activations = on ? [...cur, value] : cur.filter(a => a !== value);
  // Keep the listed order so the pills read consistently rather than by click order.
  c.activations.sort((a, b) => ACTIVATIONS.indexOf(a) - ACTIVATIONS.indexOf(b));
  const pop = document.getElementById("actpop");
  render();
  if (pop) document.body.appendChild(pop);           // survive the re-render
  clearTimeout(_actTimer);
  _actTimer = setTimeout(async () => {
    try { await DB.sb.from("conferences").update({ activations: c.activations }).eq("id", id); }
    catch (e) { toast("Couldn't save that: " + e.message, true); }
  }, 500);
}

async function setStatus(id, status) {
  const c = confById(id); if (!c) return;
  c.status = status;
  status === "Going" ? S.attending.add(id) : S.attending.delete(id);
  render();
  try { await DB.setConferenceStatus(id, status); }
  catch (e) { toast("Couldn't save that status: " + e.message, true); }
}

/* ── THE PEOPLE COLUMN ─────────────────────────────────────────────────
   "Who covers what" is the brief's phrase, and it only means something if
   the answer is a person rather than a name someone typed. Reps are rows in
   `team`, so an assignment can be counted, filtered and left empty on
   purpose. An unassigned A-tier event is a fact the planning view needs. */
const teamById = id => TEAM.find(t => t.id === id);
const teamByName = name => TEAM.find(t => t.name === name);

/* A stable colour per person, so the same face is the same colour in every
   view. Hashing the id beats storing a colour nobody would maintain. */
const AV_TONES = 6;
const avTone = id => {
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h % AV_TONES;
};
const avatar = (t, title) => t
  ? `<span class="av av${avTone(t.id)}" title="${esc(title || t.name)}">${esc(t.initials)}</span>`
  : "";

/* Up to three faces, then a count. Monday shows the overflow rather than
   shrinking the faces, because a squashed avatar is unreadable. */
function peopleCell(ids, { empty = "Nobody yet" } = {}) {
  // Roster order, always, so the same two people never swap places between
  // one row and the next just because of the order they were assigned in.
  const people = TEAM.filter(t => (ids || []).includes(t.id));
  if (!people.length) return `<span class="dim tiny">${esc(empty)}</span>`;
  const shown = people.slice(0, 3);
  return `<span class="avrow">${shown.map(t => avatar(t)).join("")}${
    people.length > 3 ? `<span class="av more">+${people.length - 3}</span>` : ""}</span>`;
}

function sizePill(n) {
  const b = sizeBand(n);
  if (!b) return `<span class="dim tiny">unknown</span>`;
  return `<span class="pill size ${b.key}" title="${esc(b.means)}">${b.label}</span>`;
}

function openCovering(id, ev) {
  ev.stopPropagation();
  closeCovering();
  const c = confById(id); if (!c) return;
  const r = ev.currentTarget.getBoundingClientRect();
  document.body.insertAdjacentHTML("beforeend",
    `<div class="actscrim" onclick="closeCovering()"></div>
     <div class="actpop" id="covpop" style="top:${Math.min(r.bottom + 6, innerHeight - 340)}px;left:${r.left}px">
       <div class="actpop-h">Who is covering ${esc(c.name)}</div>
       ${TEAM.map(t => `
         <label class="actopt">
           <input type="checkbox" ${(c.covering || []).includes(t.id) ? "checked" : ""}
             onchange="toggleCovering('${id}', '${t.id}', this.checked)">
           ${avatar(t)}<span>${esc(t.name)}</span>
           <span class="dim tiny" style="margin-left:auto">${esc(rshort(t.region || ""))}</span>
         </label>`).join("")}
       <div class="actpop-f">Leave it empty if nobody is going. That is the gap the planner looks for.</div>
     </div>`);
}
function closeCovering() {
  document.getElementById("covpop")?.remove();
  document.querySelector(".actscrim")?.remove();
}

let _covTimer;
async function toggleCovering(id, repId, on) {
  const c = confById(id); if (!c) return;
  const cur = c.covering || [];
  c.covering = on ? [...cur, repId] : cur.filter(x => x !== repId);
  c.covering.sort((a, b) => TEAM.findIndex(t => t.id === a) - TEAM.findIndex(t => t.id === b));
  const pop = document.getElementById("covpop");
  render();
  if (pop) document.body.appendChild(pop);           // survive the re-render
  clearTimeout(_covTimer);
  _covTimer = setTimeout(async () => {
    try { await DB.updateConference(id, { covering: c.covering }); }
    catch (e) { toast("Couldn't save that: " + e.message, true); }
  }, 500);
}

async function toggleGoing(id) {
  const going = S.attending.has(id);
  const status = going ? "New" : "Going";
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
   VIEW 2, PLAN THE YEAR.  Coverage, gaps, clusters, clashes, budget.
   ══════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════
   VIEW 2, PLAN THE YEAR

   A calendar first, because a clash is a picture, not a sentence. Two bars
   sitting on the same days in different cities is instantly obvious; the
   same fact written as a paragraph has to be read and believed.
   ══════════════════════════════════════════════════════════════════════ */
S.planFilter = "worth";   // worth | booked | all

/* Decide the year's calendar. Every event is a bar on one shared timeline, so
   two bars sitting on the same days in different cities is something you see
   rather than read. Status changes here, because this is where the decision
   is actually made. */
S.planScope = LS.get("planScope", "year");   // "year" or a "YYYY-MM" key
VIEWS_PLAN = () => {
  const fut = upcoming();
  const scoredAll = fut.map(c => ({ c, s: scoreConference(c, S.weights) }))
                       .sort((a, b) => a.c.start.localeCompare(b.c.start));

  const shown = scoredAll.filter(({ c, s }) =>
    S.planFilter === "all" ? true
    : S.planFilter === "booked" ? S.attending.has(c.id)
    : (S.attending.has(c.id) || (!s.unscored && s.total >= 65)));

  const clashes = findConflicts(fut.filter(c => !scoreConference(c, S.weights).unscored), S.weights);
  const clashIds = new Set(clashes.flat().map(x => x.c.id));

  // Every month that has something in it, for the picker.
  const monthKeys = [...new Set(scoredAll.map(x => x.c.start.slice(0, 7)))].sort();
  const oneMonth = S.planScope !== "year" && monthKeys.includes(S.planScope);
  const inScope = oneMonth
    ? shown.filter(x => x.c.start.slice(0, 7) === S.planScope || x.c.end.slice(0, 7) === S.planScope)
    : shown;

  const all = inScope.length ? inScope : (shown.length ? shown : scoredAll);
  const t0 = oneMonth
    ? new Date(S.planScope + "-01")
    : new Date((all[0]?.c.start || TODAY).slice(0, 7) + "-01");
  const lastEnd = all.reduce((m, x) => x.c.end > m ? x.c.end : m, TODAY);
  const t1 = oneMonth
    ? new Date(new Date(S.planScope + "-01").setMonth(new Date(S.planScope + "-01").getMonth() + 1))
    : new Date(new Date(lastEnd.slice(0, 7) + "-01").setMonth(new Date(lastEnd.slice(0, 7) + "-01").getMonth() + 1));
  const span = t1 - t0;
  const pct = d => ((new Date(d) - t0) / span) * 100;
  // In a single month the axis is days, not months.
  const dayCount = Math.round(span / 86400000);
  const days = oneMonth ? Array.from({ length: dayCount }, (_, i) => ({
    n: i + 1, left: (i / dayCount) * 100, width: (1 / dayCount) * 100 })) : [];

  const months = [];
  for (let d = new Date(t0); d < t1; d.setMonth(d.getMonth() + 1)) {
    const next = new Date(new Date(d).setMonth(d.getMonth() + 1));
    months.push({ label: d.toLocaleDateString("en-GB", { month: "short" }),
      year: d.getFullYear(),
      left: pct(d.toISOString().slice(0, 10)), width: ((next - d) / span) * 100 });
  }
  // Years get their own band above the months, so a 15-month plan reads as
  // two years rather than a strip of month names that wraps round.
  const years = [];
  months.forEach(m => {
    const y = years[years.length - 1];
    if (y && y.year === m.year) y.width += m.width;
    else years.push({ year: m.year, left: m.left, width: m.width });
  });

  const cover = coverageByPerson(fut, TEAM, S.weights);
  const clusters = findClusters(fut, {}, S.weights);
  const clusterIds = new Set(clusters.flatMap(cl => cl.items.map(i => i.id)));
  const gaps = findGaps(fut, S.attending, S.weights);

  return `
  <div class="head">
    <div class="spread">
      <h1>Plan the year</h1>
      <div class="row" style="gap:8px">
        <select class="filter-control" onchange="S.planScope=this.value;LS.set('planScope',this.value);render()">
          <option value="year"${S.planScope === "year" ? " selected" : ""}>Whole year</option>
          ${monthKeys.map(k => `<option value="${k}"${S.planScope === k ? " selected" : ""}>${monthLong(k)}</option>`).join("")}
        </select>
        <select class="filter-control" onchange="S.planFilter=this.value;render()">
          <option value="worth"${S.planFilter === "worth" ? " selected" : ""}>Worth attending</option>
          <option value="booked"${S.planFilter === "booked" ? " selected" : ""}>Booked only</option>
          <option value="all"${S.planFilter === "all" ? " selected" : ""}>Everything</option>
        </select>
      </div>
    </div>
  </div>

  <div class="card pad">
    <div class="cal">
      ${oneMonth ? `
      <div class="cal-head">
        <div class="cal-label"></div>
        <div class="cal-track">
          <div class="cal-year" style="left:0;width:100%">${monthLong(S.planScope)}</div>
        </div>
      </div>
      <div class="cal-head">
        <div class="cal-label"></div>
        <div class="cal-track">
          ${days.map(d => `<div class="cal-day" style="left:${d.left}%;width:${d.width}%">${
            d.n % 2 ? d.n : ""}</div>`).join("")}
          ${pct(TODAY) >= 0 && pct(TODAY) <= 100 ? `<div class="cal-today" style="left:${pct(TODAY)}%" title="today"></div>` : ""}
        </div>
      </div>` : `
      <div class="cal-head">
        <div class="cal-label"></div>
        <div class="cal-track">
          ${years.map(y => `<div class="cal-year" style="left:${y.left}%;width:${y.width}%">${y.year}</div>`).join("")}
        </div>
      </div>
      <div class="cal-head">
        <div class="cal-label"></div>
        <div class="cal-track">
          ${months.map(m => `<div class="cal-month" style="left:${m.left}%;width:${m.width}%">
            <span>${m.label}</span></div>`).join("")}
          <div class="cal-today" style="left:${pct(TODAY)}%" title="today"></div>
        </div>
      </div>`}

      <div class="cal-body">
        ${inScope.map(({ c, s }) => {
          const l = Math.max(0, pct(c.start)), w = Math.max(0.7, Math.min(100 - l, pct(c.end) - pct(c.start) + (oneMonth ? 100 / dayCount : 0.35)));
          const going = S.attending.has(c.id);
          return `<div class="cal-row">
            <div class="cal-label" title="${esc(c.name)}">
              <span class="tier ${s.unscored ? "Q" : s.tier}">${s.unscored ? "?" : s.tier}</span>
              <span class="cal-name" onclick="openConf('${c.id}')">${esc(c.name)}</span>
              <span class="cal-ppl">${peopleCell(c.covering, { empty: "" })}</span>
              <select class="status st-${c.status.replace(/\s/g, "")} calstatus" onchange="setStatus('${c.id}', this.value)">
                ${STATUSES.map(o => `<option${c.status === o ? " selected" : ""}>${o}</option>`).join("")}
              </select>
            </div>
            <div class="cal-track" onclick="openConf('${c.id}')">
              ${(oneMonth ? days : months).map(m => `<div class="cal-grid" style="left:${m.left}%;width:${m.width}%"></div>`).join("")}
              <div class="cal-bar t${s.unscored ? "Q" : s.tier} ${going ? "on" : ""} ${clashIds.has(c.id) ? "clash" : ""} ${clusterIds.has(c.id) ? "clust" : ""}"
                   style="left:${l}%;width:${w}%"><span>${esc(c.city)}</span></div>
              <div class="cal-today" style="left:${pct(TODAY)}%"></div>
            </div>
          </div>`; }).join("")}
        ${inScope.length ? "" : `<div class="empty">Nothing in this month.</div>`}
      </div>
    </div>

    <div class="row cal-key">
      <span><i class="k tA"></i> A</span>
      <span><i class="k tB"></i> B</span>
      <span><i class="k tC"></i> C</span>
      <span><i class="k tD"></i> D</span>
      <span><i class="k on"></i> solid, booked</span>
      <span><i class="k clash"></i> red edge, clashes</span>
      <span><i class="k clust"></i> dotted, combinable</span>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="pad">
      <div class="spread">
        <h3 style="margin:0">Who covers what</h3>
        <span class="tiny dim">${cover.worthCount} events worth attending, ${cover.avg} each on average</span>
      </div>
      ${cover.unassigned.length ? `<button class="needbar" style="margin-top:10px"
        onclick="S.planFilter='worth';render()">
        <span class="needdot"></span>${cover.unassigned.length} worth attending with nobody assigned:
        ${cover.unassigned.slice(0, 3).map(x => esc(x.c.name)).join(", ")}${
          cover.unassigned.length > 3 ? ` and ${cover.unassigned.length - 3} more` : ""}</button>` : ""}
      <div class="covgrid">
        ${cover.rows.map(r => `
          <div class="covrow">
            <div class="covwho">${avatar(r.rep)}<div>
              <b>${esc(r.rep.name)}</b>
              <div class="tiny dim">${esc(rshort(r.rep.region || ""))}</div></div></div>
            <div class="covev">
              ${r.events.length
                ? r.events.slice(0, 4).map(x =>
                    `<button class="pill conftag" title="${esc(x.c.name)}" onclick="openConf('${x.c.id}')">${esc(x.c.name)}</button>`).join("")
                  + (r.events.length > 4 ? `<span class="pill outline">+${r.events.length - 4}</span>` : "")
                : `<span class="dim tiny">Nothing booked</span>`}
            </div>
            <div class="covflag">
              ${r.overloaded ? `<span class="pill warn" title="More than half again the team average">carrying ${r.count}</span>` : ""}
              ${r.quiet ? `<span class="pill outline" title="Longest stretch from today with nothing booked">${r.quietDays}d clear</span>` : ""}
            </div>
          </div>`).join("")}
      </div>
    </div>
  </div>

  ${clusters.length ? `
  <div class="spread" style="margin-top:22px;align-items:baseline">
    <h3 style="margin:0">Trips you could combine</h3>
    <span class="rule">same region · 10 days or less apart · trip under 18 days · every event 45+</span>
  </div>
  <div class="boxes">
    ${clusters.slice(0, 6).map(cl => `
      <div class="card pad box">
        <div class="boxtitle">${esc(cl.title)}</div>
        <div class="spread boxmeta">
          <span class="tiny dim">${fmtDate(cl.start)} to ${fmtDate(cl.end)} · ${cl.span} days · ${esc(rshort(cl.region))}</span>
          <span class="pill blue">saves ${eur(cl.savedTravel)}</span></div>
        ${cl.items.map((c, i) => `
          <button class="boxrow" onclick="openConf('${c.id}')">
            <span class="tier ${cl.scores[i].tier}">${cl.scores[i].tier}</span>
            <span class="boxname">${esc(c.name)}</span>
            <span class="tiny dim">${fmtDate(c.start)}</span>
          </button>`).join("")}
        <div class="tiny dim" style="margin-top:8px">One return flight instead of ${cl.items.length}.</div>
      </div>`).join("")}
  </div>` : ""}

  ${gaps.coverage.length || gaps.calendar.length ? `
  <div class="spread" style="margin-top:22px;align-items:baseline">
    <h3 style="margin:0">Gaps</h3>
    <span class="rule">a region with 2+ events scoring 65+ and none booked · or 2+ months with nothing booked when something was worth booking</span>
  </div>
  <div class="boxes">
    ${gaps.coverage.map(g => `
      <div class="card pad box gap">
        <div class="boxtitle">${esc(rshort(g.region))}</div>
        <div class="spread boxmeta">
          <span class="tiny dim">${g.events.length} event${g.events.length > 1 ? "s" : ""} worth attending</span>
          <span class="pill warn">nothing booked</span></div>
        ${g.events.slice(0, 3).map(({ c, s: sc }) => `
          <button class="boxrow" onclick="openConf('${c.id}')">
            <span class="tier ${sc.tier}">${sc.tier}</span>
            <span class="boxname">${esc(c.name)}</span>
            <span class="tiny dim">${fmtDate(c.start)}</span>
          </button>`).join("")}
      </div>`).join("")}
    ${gaps.calendar.map(g => `
      <div class="card pad box gap">
        <div class="boxtitle">${monthName(g.from)} to ${monthName(g.to)}</div>
        <div class="spread boxmeta">
          <span class="tiny dim">Nothing booked, options existed</span>
          <span class="pill warn">${g.months} quiet month${g.months > 1 ? "s" : ""}</span></div>
        ${g.missed.map(({ c, s: sc }) => `
          <button class="boxrow" onclick="openConf('${c.id}')">
            <span class="tier ${sc.tier}">${sc.tier}</span>
            <span class="boxname">${esc(c.name)}</span>
            <span class="tiny dim">${fmtDate(c.start)}</span>
          </button>`).join("")}
      </div>`).join("")}
  </div>` : ""}`;
};


/* Field mode is its own page now (join.html), opened from Contacts. The
   duplicate check, the note box and the meeting all live there, because the
   rep is holding a tablet rather than sitting at this table. What used to be
   here, a free-text box that a model parsed into fields, was doing the same
   job twice.                                                              */

/* ══════════════════════════════════════════════════════════════════════
   VIEW 4, CONTACTS.  Cross-conference intelligence.
   REDESIGNED: Repeat contacts use Notion-style grid cards with better visual hierarchy.
   Rules find the candidates, AI settles the ambiguous ones and reads the
   arc. A repeat contact is only interesting if the temperature moved.
   ══════════════════════════════════════════════════════════════════════ */
/* One table. Every person the team has ever met, whatever event it was at.
   Three jobs, in one place:
     - the cross-conference history (how many times, where, what changed)
     - a directory you can search and filter
     - the HubSpot handoff state
   Sortable columns, dropdown filters, click a row for the full history. */
const CF = { q: "", conf: "", segment: "", signal: "", lead: "", hubspot: "", nudge: "" };
const CSORT = { key: "priority", dir: -1 };


/* Where a lead is in OUR pipeline. It stops at the handoff on purpose: once
   they are in HubSpot, HubSpot's stages are the truth, and two systems holding
   a different answer is worse than one system holding none. */
const LEAD_STATUS = ["New", "Contacted", "Qualified", "Not a fit"];

/* The same three tests field mode puts on its chips. A signal a rep has to
   feel is a signal two reps will disagree about, and this field decides
   whether HubSpot gets the lead on its own. */
const INTENT_HELP = "hot = named a budget or a date · warm = told us their FX problem · cold = no problem named";

function contactRows() {
  const { contacts, review } = identities();
  // A person is "needs review" if they appear in an unresolved ambiguous pair.
  const flagged = new Set(review.flatMap(r => [r.a.leadId, r.b.leadId]));
  const NOW = new Date().toISOString();
  return contacts.map(c => {
    // "Last seen" means the last time we actually met them. An encounter
    // logged against a conference that has not happened yet is a plan, not a
    // meeting, and showing it as "-35d ago" is just wrong.
    const past = c.encounters.filter(e => e.at <= NOW);
    const last = past[past.length - 1] || null;
    return {
      ...c, last,
      // Count meetings that have happened, so the number, the date and the
      // summary all agree.
      met: past.length,
      daysAgo: last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null,
      signal: c.encounters[c.encounters.length - 1].intent,
      confs: [...new Set(c.encounters.map(e => ({ id: e.confId, name: e.confName })).map(x => JSON.stringify(x)))]
        .map(x => JSON.parse(x)),
      /* Who spoke to them. Derived, never typed: it is a fact the encounters
         already hold, so it cannot drift out of step with the history. */
      repIds: [...new Set(c.encounters.map(e => (teamByName(e.rep) || {}).id).filter(Boolean))],
      leadId: c.encounters[c.encounters.length - 1].leadId,
      leadStatus: c.encounters[c.encounters.length - 1].leadStatus || "New",
      push: pushState(c),
      needsReview: c.encounters.some(e => flagged.has(e.leadId)),
    };
  });
}

VIEWS_CONTACTS = () => {
  let rows = contactRows();
  const allConfs = [...new Set(rows.flatMap(r => r.confs))].sort();
  const allSegs = [...new Set(rows.map(r => r.segment).filter(Boolean))].sort();

  if (CF.conf) rows = rows.filter(r => r.confs.includes(CF.conf));
  if (CF.segment) rows = rows.filter(r => r.segment === CF.segment);
  if (CF.signal) rows = rows.filter(r => r.signal === CF.signal);
  if (CF.nudge) rows = rows.filter(r => r.needsNudge);
  if (CF.lead) rows = rows.filter(r => r.leadStatus === CF.lead);
  /* The table shows two states now, pushed or needs a push, so the filter
     offers the same two. "pushed" covers every row that goes on its own. */
  if (CF.hubspot) rows = rows.filter(r => CF.hubspot === "review" ? r.needsReview
    : CF.hubspot === "manual" ? r.push === "manual" : r.push !== "manual");
  if (CF.q) { const q = CF.q.toLowerCase();
    rows = rows.filter(r => (r.name + r.company + r.title + (r.email || "") + r.confs.join()).toLowerCase().includes(q)); }

  const val = (r, k) => k === "name" ? r.name.toLowerCase()
    : k === "company" ? (r.company || "").toLowerCase()
    : k === "touches" ? r.met
    : k === "last" ? (r.last ? r.last.at : "")
    : k === "signal" ? ({ hot: 3, warm: 2, cold: 1 }[r.signal] || 0)
    : k === "priority" ? r.priority
    : r.priority;
  rows.sort((a, b) => { const x = val(a, CSORT.key), y = val(b, CSORT.key);
    return (x < y ? -1 : x > y ? 1 : 0) * CSORT.dir; });

  const TH = (k, label, w) => `<th ${w ? `style="width:${w}"` : ""} class="sortable ${CSORT.key === k ? "sorted" : ""}"
    onclick="sortContacts('${k}')">${label}${CSORT.key === k ? (CSORT.dir < 0 ? " ↓" : " ↑") : ""}</th>`;

  const reviewCount = rows.filter(r => r.needsReview).length;

  return `
  <div class="head">
    <div class="spread">
      <h1>Contacts</h1>
      <div class="row" style="gap:8px">
        <a class="btn ghost" href="join.html" target="_blank" rel="noopener">Field mode</a>
        <button class="btn" onclick="openAddPerson()">Add a person</button>
      </div>
    </div>
  </div>

  <div class="filter-bar">
    <input class="filter-input" id="ctq" placeholder="Search" value="${esc(CF.q)}" oninput="CF.q=this.value;render()">
    <select class="filter-control" onchange="CF.conf=this.value;render()">
      <option value="">All events</option>
      ${allConfs.map(c => `<option${CF.conf === c ? " selected" : ""}>${esc(c)}</option>`).join("")}
    </select>
    <select class="filter-control" onchange="CF.segment=this.value;render()">
      <option value="">All segments</option>
      ${allSegs.map(c => `<option${CF.segment === c ? " selected" : ""}>${esc(c)}</option>`).join("")}
    </select>
    <select class="filter-control" onchange="CF.signal=this.value;render()">
      <option value="">All signals</option>
      ${["hot", "warm", "cold"].map(c => `<option${CF.signal === c ? " selected" : ""}>${c}</option>`).join("")}
    </select>
    <select class="filter-control" onchange="CF.lead=this.value;render()">
      <option value="">All lead statuses</option>
      ${LEAD_STATUS.map(c => `<option${CF.lead === c ? " selected" : ""}>${c}</option>`).join("")}
    </select>
    <select class="filter-control" onchange="CF.nudge=this.value;render()">
      <option value="">Everyone</option>
      <option value="1"${CF.nudge ? " selected" : ""}>Needs a nudge (${rows.filter(r => r.needsNudge).length})</option>
    </select>
    <select class="filter-control" onchange="CF.hubspot=this.value;render()">
      <option value="">All HubSpot states</option>
      <option value="pushed"${CF.hubspot === "pushed" ? " selected" : ""}>Pushed</option>
      <option value="manual"${CF.hubspot === "manual" ? " selected" : ""}>Needs a push</option>
      ${reviewCount ? `<option value="review"${CF.hubspot === "review" ? " selected" : ""}>Identity unclear (${reviewCount})</option>` : ""}
    </select>
    <div class="filter-stat">${rows.length} people</div>
  </div>

  <div class="card"><div class="pad tablewrap" style="padding-bottom:6px"><table class="fixed">
    <thead><tr>
      ${TH("name", "Name", "152px")}
      <th style="width:108px">Lead status</th>
      ${TH("company", "Company", "100px")}
      ${TH("priority", "Relationship", "132px")}
      <th style="width:120px">Work email</th>
      <th style="width:92px">Spoke to them</th>
      ${TH("touches", "Met", "42px")}
      <th style="width:140px">Where</th>
      ${TH("last", "Last seen", "114px")}
      ${TH("signal", "Signal", "64px")}
      <th style="width:106px">HubSpot</th>
    </tr></thead>
    <tbody>${rows.map(r => `
      <tr onclick="openContact('${r.id}')">
        <td>
          <div class="cell-name">${esc(r.name)}${r.needsNudge
            ? `<span class="nudgedot" title="${esc(r.nudgeReason)}"></span>` : ""}</div>
          <div class="tiny dim">${esc(r.title || "")}</div>
        </td>
        <td onclick="event.stopPropagation()">
          <select class="status ls-${r.leadStatus.replace(/\s/g, "")}" onchange="setLeadStatus('${r.leadId}', this.value)">
            ${LEAD_STATUS.map(o => `<option${r.leadStatus === o ? " selected" : ""}>${o}</option>`).join("")}
          </select>
        </td>
        <td class="tiny">${esc(r.company || "")}
          ${r.changedCompany ? `<div class="pill warn">changed employer</div>` : ""}</td>
        <td><div class="relcell">
          <span class="verdict v-${r.verdict.replace(/\s/g, "")}" title="${esc(r.test)}">${esc(r.verdict)}</span>
          <b class="mono prio" title="Call order out of 100: ${esc(priorityBand(r.priority).label)}">${r.priority}</b>
        </div></td>
        <td class="email">${r.email ? esc(r.email) : "no email on file"}</td>
        <td>${peopleCell(r.repIds, { empty: "-" })}</td>
        <td><b class="mono">${r.met}</b></td>
        <td onclick="event.stopPropagation()"><div class="tags">
          ${r.confs.slice(0, 2).map(c => `<button class="pill conftag" title="${esc(c.name)}" onclick="openConfFrom('${c.id}')">${esc(c.name)}</button>`).join("")}
          ${r.confs.length > 2 ? `<span class="pill outline">+${r.confs.length - 2}</span>` : ""}
        </div></td>
        <td class="tiny muted nowrap">${r.last
          ? `${fmtDMY(r.last.at)} <span class="dim">· ${r.daysAgo}d</span>`
          : `<span class="dim">not met yet</span>`}</td>
        <td><span class="sig ${r.signal}">${r.signal}</span></td>
        <td onclick="${r.push === "manual" ? `event.stopPropagation();pushOne('${r.id}')` : "event.stopPropagation()"}">
          ${PUSH_LABEL[r.push]}</td>
      </tr>`).join("")}
    </tbody></table>
    ${rows.length ? "" : `<div class="empty">Nothing matches those filters.</div>`}
  </div></div>`;
};
VIEWS_CONTACTS.after = () => {
  const e = document.getElementById("ctq");
  if (e && CF.q) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
};
async function setLeadStatus(leadId, status) {
  const l = LEADS.find(x => x.id === leadId); if (l) l.status = status;
  ENCOUNTERS.forEach(e => { if (e.leadId === leadId) e.leadStatus = status; });
  render();
  try { await DB.updateLead(leadId, { status }); }
  catch (e) { toast("Couldn't save that status: " + e.message, true); }
}

function sortContacts(k) {
  if (CSORT.key === k) CSORT.dir *= -1; else { CSORT.key = k; CSORT.dir = -1; }
  render();
}

async function adjudicate(key) {
  const { review } = identities();
  const r = review.find(x => x.key === key); if (!r) return;
  const slot = document.getElementById("aj_" + key.replace(/\|/g, "_"));
  slot.innerHTML = `<div class="ai"><h4>Adjudicating <span class="spin"></span></h4></div>`;
  const res = await ask(`adj:${key}`, () => AI.adjudicateMatch(r.a, r.b, r.score, r.reasons),
    () => DEMO.adjudicate[r.a.name] || { verdict: "unsure", confidence: 50,
      reasoning: "Not enough in the notes to separate these.", tell: "-" });
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
function decide(key, v) {
  /* Read the pair BEFORE recording the decision. Once it is decided it
     leaves the review queue, and the reconcile screen needs both sides. */
  const pair = identities().review.find(x => x.key === key);
  S.decisions[key] = v; save();
  /* Merging two records leaves two versions of the truth: Head of Payments
     at Nuvei in May, VP Payments at Nuvei in October. Taking the most recent
     silently is what loses a job change nobody noticed, so after a merge the
     tool asks which version is right and lets it be typed over. */
  if (v === "same" && pair) { render(); openReconcile(pair); return; }
  render();
}

/* Everything we hold on this person, both versions side by side, editable.
   The lead row is the record that survives the merge, so that is what saves. */
function openReconcile(r) {
  if (!r) return;
  const key = r.key;
  const target = r.b.at >= r.a.at ? r.b : r.a;        // the more recent record
  const other  = target === r.b ? r.a : r.b;
  S.rec = {
    key, leadId: target.leadId, otherLeadId: other.leadId,
    name: target.name || other.name || "",
    email: target.email || other.email || "",
    title: target.title || other.title || "",
    company: target.company || other.company || "",
    a: other, b: target,
  };
  drawReconcile();
}

function drawReconcile() {
  const d = S.rec; if (!d) return;
  const alt = (label, field) => {
    const av = d.a[field] || "", bv = d.b[field] || "";
    const opts = [...new Set([bv, av].filter(Boolean))];
    return `<label>${label}</label>
      <input class="inp" value="${esc(d[field])}" oninput="S.rec.${field}=this.value">
      ${opts.length > 1 ? `<div class="chips" style="margin:4px 0 2px">
        ${opts.map(o => `<button class="chip ${d[field] === o ? "on" : ""}"
          onclick="S.rec.${field}=${JSON.stringify(o).replace(/"/g, "&quot;")};drawReconcile()">${esc(o)}</button>`).join("")}
      </div><div class="tiny dim">Two versions on record. The newer one is ${esc(bv || "blank")}.</div>` : ""}`;
  };
  drawer(`<div class="spread"><div>
      <h3 style="margin:0">Merged into one person</h3>
      <div class="tiny dim" style="margin-top:3px">Check what we hold on them before it goes to HubSpot.</div>
    </div><button class="x" onclick="closeReconcile()">×</button></div>`, `
    <div class="tiny muted">
      ${esc(d.a.confName)} on ${fmtDMY(d.a.at)} and ${esc(d.b.confName)} on ${fmtDMY(d.b.at)}
      are now the same record. Both meetings are kept either way, this is only
      about the details we carry forward.
    </div>
    <div class="form">
      ${alt("Full name", "name")}
      ${alt("Work email", "email")}
      ${alt("Role", "title")}
      ${alt("Company", "company")}
    </div>
    <div class="row">
      <button class="btn" onclick="saveReconcile()">Save</button>
      <button class="btn ghost" onclick="closeReconcile()">Leave it as it is</button>
    </div>`);
}

function closeReconcile() { S.rec = null; S.reconcile = null; closeDrawer(); render(); }

async function saveReconcile() {
  const d = S.rec; if (!d) return;
  try {
    await DB.updateLead(d.leadId, {
      full_name: d.name.trim() || null, work_email: d.email.trim() || null,
      title: d.title.trim() || null, company: d.company.trim() || null,
    });
    S.rec = null; S.reconcile = null; closeDrawer();
    await reload();
    toast(`${d.name} updated.`);
  } catch (e) { toast("Couldn't save: " + e.message, true); }
}

function openContact(id) {
  const { contacts } = identities();
  const c = contacts.find(x => x.id === id); if (!c) return;
  S.sel = id; drawContact(c);
}

/* A plain summary of the relationship, written from the encounters. No model:
   every sentence here is a fact the database already holds, so it cannot be
   wrong in a way the rep cannot check. */
function contactSummary(c) {
  const NOW = new Date().toISOString();
  const past = c.encounters.filter(e => e.at <= NOW);
  const first = past[0], last = past[past.length - 1];
  const bits = [];

  if (!past.length) return "On file, but we have not met them yet.";

  bits.push(`${c.name}${c.title ? `, ${c.title}` : ""}${c.company ? ` at ${c.company}` : ""}.`);

  if (past.length === 1) {
    bits.push(`Met once, at ${first.confName} on ${fmtDMY(first.at)}, by ${first.rep}.`);
  } else {
    const months = Math.max(1, Math.round((new Date(last.at) - new Date(first.at)) / 2592000000));
    const reps = [...new Set(past.map(e => e.rep))];
    bits.push(`Met ${past.length} times over ${months} month${months > 1 ? "s" : ""}, first at ${first.confName}, most recently at ${last.confName} on ${fmtDMY(last.at)}.`);
    if (reps.length > 1) bits.push(`Logged by ${reps.join(" and ")}.`);
  }

  // What changed, stated as the change itself rather than a label.
  if (past.length > 1 && first.intent !== last.intent)
    bits.push(`They were ${first.intent} the first time and ${last.intent} the last time.`);
  else if (past.length > 1)
    bits.push(`${cap(last.intent)} every time so far.`);

  const companies = [...new Set(past.map(e => e.company).filter(Boolean))];
  if (companies.length > 1) bits.push(`Changed employer along the way: ${companies.join(" then ")}.`);

  const names = [...new Set(past.map(e => e.name).filter(Boolean))];
  if (names.length > 1) bits.push(`Logged under ${names.join(" and ")}, treated as one person.`);

  if (last.note) bits.push(`Last time: "${last.note}"`);

  const days = Math.floor((Date.now() - new Date(last.at)) / 86400000);
  bits.push(`${days} days since anyone spoke to them.`);

  return bits.join(" ");
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* Jump from a meeting note to the event it happened at, and back. The rep
   reading "asked about THB" usually wants to know what else was at that
   event and who else we met there. */
function openConfFrom(confId) {
  S.backTo = S.sel;
  S.view = "conferences";
  render();
  openConf(confId);
}
function backToContact() {
  const id = S.backTo; S.backTo = null;
  S.view = "contacts"; render();
  if (id) openContact(id);
}

/* Identity review, in the one place it makes sense: the person's own record.
   It used to be a banner on the Contacts page, which put a maintenance queue
   in front of a rep who opened the page to find someone. */
function identityBlock(c) {
  const { review } = identities();
  const mine = review.filter(r => c.encounters.some(e => e.leadId === r.a.leadId || e.leadId === r.b.leadId));
  if (!mine.length) return "";
  return mine.map(r => {
    const k = r.key.replace(/\|/g, "_");
    return `<div class="card pad" style="border-color:var(--line)">
      <div class="spread" style="margin-bottom:6px">
        <h4 style="margin:0">Might be the same person</h4>
        <span class="pill warn">${r.score}/100</span></div>
      <div class="tiny muted" style="margin-bottom:9px">${esc(r.reasons.join(" · "))}</div>
      <div class="row" style="gap:14px;align-items:flex-start">
        <div><b>${esc(r.a.name)}</b><div class="tiny dim">${esc(r.a.title)} · ${esc(r.a.company)}<br>${esc(r.a.confName)} · ${r.a.at.slice(0, 10)}</div></div>
        <div><b>${esc(r.b.name)}</b><div class="tiny dim">${esc(r.b.title)} · ${esc(r.b.company)}<br>${esc(r.b.confName)} · ${r.b.at.slice(0, 10)}</div></div>
      </div>
      <div id="aj_${k}"></div>
      <div class="row" style="margin-top:9px">
        <button class="btn sm" onclick="decide('${r.key}','same')">Same person</button>
        <button class="btn ghost sm" onclick="decide('${r.key}','different')">Two people</button>
        <button class="btn ghost sm" onclick="adjudicate('${r.key}')">Ask the model</button>
      </div>
    </div>`;
  }).join("");
}

/* ── THE ARC ───────────────────────────────────────────────────────────
   The verdict above is a rule and is always on screen. This is the part a
   rule cannot do, so it is the part that costs a model call, and it is only
   offered when engine.js says something actually happened. A Warming contact
   inside their normal rhythm gets the facts and silence, which is most of
   the list and is the whole answer to "too aggressive is noise". */
function arcBlock(c) {
  if (!c.needsNudge) return "";
  const got = S.aiCache[`arc:${c.id}`];
  return `<div class="card pad arccard">
    <div class="spread">
      <div><h4 style="margin:0">What to do about it</h4>
        <div class="tiny dim" style="margin-top:2px">${esc(c.nudgeReason)}</div></div>
      ${got ? "" : `<button class="btn sm" onclick="askArc('${c.id}')" id="arcbtn">${
        S.busy["arc" + c.id] ? "Reading the notes…" : "Read the notes"}</button>`}
    </div>
    <div id="arcout">${got ? arcHTML(got) : ""}</div>
  </div>`;
}

function arcHTML(a) {
  if (!a) return "";
  const em = a.email || {};
  return `
    <div class="arcline"><span>Arc</span><p>${esc(a.arc || "")}</p></div>
    <div class="arcline"><span>Read</span><p>${esc(a.why || "")}</p></div>
    <div class="arcline"><span>Do</span><p><b>${esc(a.nudge || "")}</b></p></div>
    ${a.avoid ? `<div class="arcline"><span>Avoid</span><p>${esc(a.avoid)}</p></div>` : ""}
    ${em.body ? `<div class="draft">
      <div class="spread">
        <div class="tiny dim">Draft, not sent. HubSpot owns sending.</div>
        <button class="btn ghost sm" onclick="copyDraft(this)">Copy</button>
      </div>
      <div class="draftsub">${esc(em.subject || "")}</div>
      <pre class="draftbody">${esc(em.body)}</pre>
    </div>` : ""}`;
}

function copyDraft(btn) {
  const box = btn.closest(".draft");
  const text = box.querySelector(".draftsub").textContent + "\n\n" + box.querySelector(".draftbody").textContent;
  navigator.clipboard?.writeText(text).then(() => {
    btn.textContent = "Copied"; setTimeout(() => btn.textContent = "Copy", 1400);
  }, () => toast("Couldn't copy, select it by hand.", true));
}

async function askArc(id) {
  const { contacts } = identities();
  const c = contacts.find(x => x.id === id); if (!c) return;
  S.busy["arc" + id] = true;
  const btn = document.getElementById("arcbtn");
  if (btn) { btn.textContent = "Reading the notes…"; btn.disabled = true; }
  const a = await ask(`arc:${id}`, () => AI.relationshipArc(c), () => DEMO.arc(c));
  S.busy["arc" + id] = false;
  const out = document.getElementById("arcout");
  if (out) { out.innerHTML = arcHTML(a); btn?.remove(); }
}

function drawContact(c) {
  const st = (c.encounters[c.encounters.length - 1].leadStatus) || "New";
  const leadId = c.encounters[c.encounters.length - 1].leadId;
  const NOW = new Date().toISOString();
  const met = c.encounters.filter(e => e.at <= NOW).length;
  drawer(`
    <div class="spread"><div>
      <h3 style="margin:0">${esc(c.name)}</h3>
      <div class="tiny dim" style="margin-top:3px">${esc(c.title)} · ${esc(c.company)}${c.email ? " · " + esc(c.email) : ""}</div>
      <div class="row tiny" style="margin-top:8px;gap:6px;align-items:center">
        <select class="status ls-${st.replace(/\s/g, "")}" onchange="setLeadStatus('${leadId}', this.value);openContact('${c.id}')">
          ${LEAD_STATUS.map(o => `<option${st === o ? " selected" : ""}>${o}</option>`).join("")}
        </select>
        <span class="sig ${c.encounters[c.encounters.length - 1].intent}">${c.encounters[c.encounters.length - 1].intent}</span>
        <span class="pill">${met} meeting${met === 1 ? "" : "s"}</span>
      </div>
    </div><button class="x" onclick="closeDrawer()">×</button></div>`, `
    <div class="verdictbar">
      <span class="verdict v-${c.verdict.replace(/\s/g, "")}">${esc(c.verdict)}</span>
      <span class="tiny dim">${esc(c.test)}</span>
    </div>

    <div class="summary">${esc(contactSummary(c))}</div>

    ${identityBlock(c)}

    ${arcBlock(c)}

    <div><h4>Every meeting</h4>
      ${c.encounters.map(e => `
        <div style="border-left:2px solid var(--line);padding:0 0 16px 14px;position:relative">
          <span style="position:absolute;left:-5px;top:3px;width:8px;height:8px;border-radius:50%;
            background:${e.intent === "hot" ? "var(--hot)" : e.intent === "warm" ? "var(--warm)" : "var(--cold)"}"></span>
          <div class="spread">
            <button class="linkbtn" onclick="openConfFrom('${e.confId}')">${esc(e.confName)}</button>
            <span class="sig ${e.intent}">${e.intent}</span></div>
          <div class="tiny dim">${fmtDMY(e.at)} · ${esc(e.city || confById(e.confId)?.city || "")} · logged by ${esc(e.rep)}</div>
          <div class="tiny dim">as ${esc(e.name)}, ${esc(e.title)} at ${esc(e.company)}${e.email ? " · " + esc(e.email) : ""}</div>
          ${(e.icpSignals || []).length ? `<div class="chips" style="margin-top:6px">
            ${e.icpSignals.map(sg => `<span class="pill blue">${esc(sg)}</span>`).join("")}</div>` : ""}
          <div class="mnote">${esc(e.note || "No note was written.")}</div>
          ${e.raw && e.raw !== e.note
            ? `<div class="tiny dim" style="margin-top:4px">As typed: "${esc(e.raw)}"</div>` : ""}
        </div>`).join("")}
    </div>

    <div class="card pad">
      <div class="spread">
        <h4 style="margin:0">HubSpot</h4>
        ${pushState(c) === "manual"
          ? `<button class="btn" onclick="pushOne('${c.id}')">Push now</button>`
          : `<button class="btn ghost" title="Hot and warm already went on their own. Press only to send it again." onclick="pushOne('${c.id}')">Push again</button>`}
      </div>
      <pre id="hs_out" class="mono" style="margin:10px 0 0;white-space:pre-wrap;color:var(--ink2)"></pre>
    </div>`);
}

/* ── HubSpot ─────────────────────────────────────────────────────────
   A browser cannot call HubSpot's API directly (they don't allow CORS, and
   putting a private-app token in client JS would be wrong anyway). So the
   honest implementation is: build the exact payload, and either POST it to
   a relay URL the user configures, or show it for copy/paste.

   Shira's rule, and it is the right one: hot and warm go on their own,
   cold does not. A cold contact is someone who took a leaflet while
   walking past. Pushing those automatically is how a CRM fills up with
   three hundred names nobody will ever call, and how the follow-up
   sequences that run in HubSpot start emailing people who never asked.
   Cold stays in this tool until a human decides otherwise.            */
const AUTO_PUSH = ["hot", "warm"];
const lastIntent = c => c.encounters[c.encounters.length - 1].intent;
const hasRelay = () => !!localStorage.getItem("hubspot_relay");

/* Four states, and they mean four different things. "queued" exists
   because saying "pushed" when no relay is configured would be a lie the
   rep only finds out about when the follow-up never arrives. */
function pushState(c) {
  if (S.pushed.has(c.id)) return "pushed";
  if (S.queued.has(c.id)) return "queued";
  return AUTO_PUSH.includes(lastIntent(c)) ? "auto" : "manual";
}

/* One button, and its absence is the whole rule. Hot and warm go on their own,
   so they read as a finished state, not as something waiting to be clicked.
   The navy "Push" needs a human, and it only ever appears on a cold lead. */
const PUSHED_PILL = `<span class="pill" title="Hot and warm go to HubSpot on their own when saved">pushed</span>`;
const PUSH_LABEL = {
  pushed: PUSHED_PILL,
  queued: PUSHED_PILL,
  auto:   PUSHED_PILL,
  manual: `<button class="btn sm">Push</button>`,
};
const pushBadge = c => PUSH_LABEL[pushState(c)];

function buildPayload(c) {
  const arc = S.aiCache[`arc:${c.id}`] || null;
  const last = c.encounters[c.encounters.length - 1];
  return {
    properties: {
      firstname: c.name.split(" ")[0], lastname: c.name.split(" ").slice(1).join(" "),
      email: c.email, company: c.company, jobtitle: c.title,
      grain_conference_touches: c.touches,
      grain_relationship_pattern: c.verdict,
      grain_first_met_at: c.encounters[0].confName,
      grain_last_met_at: last.confName,
      grain_priority: c.priority,
      hs_lead_status: lastIntent(c) === "hot" ? "OPEN_DEAL" : "IN_PROGRESS",
    },
    /* Every meeting note, as a timeline note. This is the point of the whole
       push: the notes are what make a repeat contact worth anything, and
       they are useless if they only exist in here. */
    notes: c.encounters.map(e => ({ timestamp: e.at, body: `[${e.confName}] ${e.note}, logged by ${e.rep}` })),
    /* A task, not a note, and only when a rule says something happened.
       A note sits there; a task turns up in the rep's HubSpot queue with the
       draft already written. Nothing is ever sent from here: HubSpot owns
       sending, and the one action that touches a customer keeps a human on
       it. No trigger, no task, no noise. */
    task: (c.needsNudge && arc && arc.email) ? {
      subject: `Follow up: ${c.name}`,
      dueInDays: 2,
      body: [
        `Why now: ${c.nudgeReason}.`,
        arc.nudge ? `Next step: ${arc.nudge}` : "",
        "",
        "Draft, not sent:",
        `Subject: ${arc.email.subject || ""}`,
        "",
        arc.email.body || "",
      ].filter(x => x !== null).join("\n"),
    } : null,
  };
}

async function pushOne(id, opts = {}) {
  const { contacts } = identities();
  const c = contacts.find(x => x.id === id); if (!c) return;
  const payload = buildPayload(c);
  const relay = localStorage.getItem("hubspot_relay");
  const out = opts.auto ? null : document.getElementById("hs_out");

  if (relay) {
    try {
      const res = await fetch(relay, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { S.pushed.add(id); S.queued.delete(id); }
      else if (!opts.auto && out) out.textContent = `Relay returned ${res.status}.`;
      if (out && res.ok) out.textContent = "Synced to HubSpot. Follow-up sequences run there, not here.";
      if (opts.auto && !opts.quiet) toast(res.ok
        ? `${c.name} pushed to HubSpot, ${lastIntent(c)}.`
        : `${c.name} saved, HubSpot relay returned ${res.status}.`, !res.ok);
    } catch (e) {
      S.queued.add(id);
      if (out) out.textContent = "Couldn't reach the relay URL: " + e.message;
      if (opts.auto && !opts.quiet) toast(`${c.name} saved. HubSpot relay unreachable, queued.`, true);
    }
  } else {
    // No relay. Do not pretend. Hot and warm are recorded as queued so the
    // state is recoverable the moment a URL is set; a manual push shows the
    // payload, which is the useful thing to see when nothing is wired up.
    if (opts.auto) { S.queued.add(id); if (!opts.quiet) toast(`${c.name} saved and queued for HubSpot, no relay URL set yet.`); }
    else {
      S.pushed.add(id);
      if (out) out.textContent = "No relay URL set (Settings). This is the payload that would be sent:\n\n"
        + JSON.stringify(payload, null, 2);
    }
  }
  save();
  if (!out && !opts.quiet) render();
}

/* Called after a save. The contact id is not the lead id, identity
   resolution can fold several leads into one person, so look it up. */
async function autoPush(leadId) {
  const { contacts } = identities();
  const c = contacts.find(x => x.encounters.some(e => e.leadId === leadId));
  if (!c) return false;
  if (!AUTO_PUSH.includes(lastIntent(c))) return false;
  await pushOne(c.id, { auto: true });
  return true;
}

/* ── SIGNAL MINING ────────────────────────────────────────────────────
   There is no page for this, deliberately. Conference decisions are already
   being made, badly, in Slack threads and meeting summaries nobody re-reads.
   A scheduled n8n flow reads the unprocessed rows in the `signals` table,
   pulls out the conference names, and inserts the ones we are not already
   tracking. They arrive here tagged "from Slack" or "from meeting notes",
   with no estimates, which is why the Conferences page marks them as needing
   a score. A rep should never have to open a mining screen and press a
   button, so there isn't one.                                            */

/* ══════════════════════════════════════════════════════════════════════
   VIEW 6, SETTINGS.  Keys live in the browser, never in the source.
   ══════════════════════════════════════════════════════════════════════ */
VIEWS_SETTINGS = () => {
  const c = AI.cfg();
  return `
  <div class="head"><h1>Settings</h1>
    <p>Keys live in this browser only.</p></div>

  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card pad">
      <h3>Automation</h3>
      <p class="tiny muted" style="margin:-4px 0 10px">AI calls go through n8n, so the API key stays in n8n's
        credential store rather than the browser.</p>
      <div class="kv">
        <label>n8n base URL</label>
        <input class="inp" placeholder="https://admin-n8n.optimally-ai.com"
          value="${esc(localStorage.getItem("n8n_base") || "")}"
          oninput="localStorage.setItem('n8n_base',this.value.replace(/\\/+$/,''))">
        <label>Your name</label>
        ${repSelect(REP_ID(), "localStorage.setItem('rep_id',this.value);render()", { placeholder: "Who is logging leads" })}
      </div>
      <div class="row" style="margin-top:11px">
        <button class="btn" onclick="testProxy()">Test the webhook</button>
        <span id="proxytest" class="tiny"></span>
      </div>
      <div class="alert ${AI.viaProxy() ? "good" : ""}" style="margin-top:12px">
        <b>Route: ${AI.mode()}.</b>
        ${AI.mode() === "proxy" ? "Through n8n. Visitors need no key."
          : AI.mode() === "key" ? "Straight from this browser, using the key below."
          : "None set. AI features return pre-written responses badged <i>demo</i>."}
      </div>
    </div>

    <div class="card pad">
      <h3>AI provider</h3>
      <p class="tiny muted" style="margin:-4px 0 10px">Fallback for when n8n is unreachable.</p>
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
        ${AI.hasKey() ? `<b>Live.</b> Every AI feature calls the provider.`
          : `<b>Demo.</b> No key set. AI features return pre-written responses badged <i>demo response</i>, so nothing dead-ends.`}
      </div>
    </div>

    <div class="card pad">
      <h3>HubSpot</h3>
      <p class="tiny muted" style="margin:-4px 0 10px">HubSpot blocks browser calls, and a token in client-side
        JavaScript is readable by anyone. The payload goes to a relay you control instead. With no relay set,
        the tool shows you the payload.</p>
      <div class="kv">
        <label>Relay URL</label>
        <input class="inp" placeholder="https://hook.eu2.make.com/…" value="${esc(localStorage.getItem("hubspot_relay") || "")}"
          oninput="localStorage.setItem('hubspot_relay',this.value)">
      </div>
      <div class="alert" style="margin-top:11px"><b>Custom properties expected:</b>
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
async function testProxy() {
  const el = document.getElementById("proxytest");
  const base = localStorage.getItem("n8n_base");
  if (!base) { el.innerHTML = `<b style="color:var(--bad)">No URL set.</b>`; return; }
  el.innerHTML = `<span class="spin"></span> Calling…`;
  try {
    const r = await fetch(base.replace(/\/+$/, "") + "/webhook/grain-ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "ask", system: "Reply with JSON only.", prompt: 'Return {"ok":true}' }),
    });
    const body = await r.text();
    el.innerHTML = r.ok
      ? `<b style="color:var(--accent)">Working.</b> <span class="dim">${esc(body.slice(0, 70))}</span>`
      : `<b style="color:var(--bad)">HTTP ${r.status}.</b> <span class="dim">${
          r.status === 404 ? "Flow not found or not activated in n8n." : esc(body.slice(0, 70))}</span>`;
  } catch (e) {
    el.innerHTML = `<b style="color:var(--bad)">Unreachable.</b> <span class="dim">${esc(e.message)}</span>`;
  }
}

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
    attending: [...S.attending], contacts }, null, 2)], { type: "application/json" });
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

const VIEWS = { conferences: VIEWS_CONF, plan: VIEWS_PLAN,
  contacts: VIEWS_CONTACTS, settings: VIEWS_SETTINGS };

/* ══════════════════════════════════════════════════════════════════════
   BOOT

   Load from Postgres, then render. Realtime keeps two reps on the same
   show floor looking at the same thing without either of them refreshing.
   ══════════════════════════════════════════════════════════════════════ */
async function reload() {
  const d = await DB.loadAll();
  CONFERENCES = d.conferences; ENCOUNTERS = d.encounters; LEADS = d.leads;
  TEAM = d.team || [];
  S.attending = new Set(CONFERENCES.filter(c => c.status === "Going").map(c => c.id));
  render();
  sweepAutoPush();
}

/* Leads do not only arrive through this page. The stand tablet writes
   straight to the database, and so does the n8n capture flow, so a hot or
   warm contact can appear without anything here having run. Without this,
   "goes automatically" would sit next to their name forever while nothing
   went anywhere, which is the exact lie the queued state exists to stop.
   It only touches contacts in neither set, so a reload cannot re-send. */
async function sweepAutoPush() {
  let touched = false;
  try {
    const { contacts } = identities();
    for (const c of contacts) {
      if (S.pushed.has(c.id) || S.queued.has(c.id)) continue;
      if (!AUTO_PUSH.includes(lastIntent(c))) continue;
      if (hasRelay()) await pushOne(c.id, { auto: true, quiet: true });
      else { S.queued.add(c.id); touched = true; }
    }
  } catch (e) { /* never let a sync sweep take the page down */ }
  if (touched) { save(); render(); }
}

function fatal(msg) {
  document.getElementById("main").innerHTML = `
    <div class="head"><h1>Can't reach the database</h1>
      <p>${esc(msg)}</p></div>
    <div class="card pad">
      <h3>What to check</h3>
      <ul style="font-size:13px;line-height:1.8;color:var(--ink2)">
        <li>The Supabase project is awake, free projects pause after a week idle.</li>
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


/* ══════════════════════════════════════════════════════════════════════
   ADD A CONFERENCE

   The brief asks that a non-developer can keep this up to date. A form is
   that. The score updates live as the estimates are set, so whoever fills
   it in can see what their judgement does to the ranking instead of
   finding out later.
   ══════════════════════════════════════════════════════════════════════ */
const REGIONS = ["Europe", "North America", "Middle East", "Asia-Pacific", "Africa", "South America"];

/* How we show up, not just whether we go. Grain's own LinkedIn shows they
   rarely just attend: they share a partner's booth, run a gift table, put
   someone on stage. That is a planning decision with a cost, so it is a field. */
const ACTIVATIONS = [
  "Attending only",
  "Booth",
  "Partner booth",
  "Speaking slot",
  "Panel",
  "Roundtable dinner",
  "Hosted meeting room",
  "Side event",
  "Sponsored coffee cart",
  "Pre-event drinks",
  "Workshop",
  "Sponsor",
];
const STATUSES = ["New", "Going", "Considering", "Not going"];
S.newConf = null;

function openAddConference() {
  S.newConf = { name: "", start: "", end: "", city: "", country: "", region: "Europe",
    verticals: [], activations: [], audienceSize: 1000, ticketEur: 500,
    icpDensity: 50, seniority: 50, strategic: 50,
    status: "New", covering: [], datesConfirmed: true, note: "" };
  drawAddConf();
}

function drawAddConf() {
  const d = S.newConf;
  /* Typing must not redraw the drawer. It did, and every keystroke destroyed
     the input the cursor was in, so the field had to be clicked again for
     each letter. Text and slider changes now only refresh the live score. */
  const F = (k, label, type = "text", extra = "") =>
    `<label>${label}</label><input class="inp" type="${type}" value="${esc(d[k] ?? "")}" ${extra}
       oninput="S.newConf['${k}']=${type === "number" ? "+this.value" : "this.value"};confPreview()">`;
  const SLIDER = (k, label, help) => `
    <div style="margin-bottom:13px">
      <div class="spread tiny" style="margin-bottom:3px">
        <span style="font-weight:550">${label}</span><b class="mono" id="sv_${k}">${d[k]}</b></div>
      <input type="range" min="0" max="100" value="${d[k]}" style="width:100%;accent-color:var(--accent)"
        oninput="S.newConf['${k}']=+this.value;document.getElementById('sv_${k}').textContent=this.value;confPreview()">
      <div class="tiny dim" style="margin-top:2px">${help}</div>
    </div>`;

  drawer(`<div class="spread"><h3 style="margin:0">Add a conference</h3>
      <button class="x" onclick="S.newConf=null;closeDrawer()">×</button></div>
`,
  `
    <div class="kv">
      ${F("name", "Name")}
      ${F("start", "Starts", "date")}
      ${F("end", "Ends", "date")}
      ${F("city", "City")}
      ${F("country", "Country")}
      <label>Region</label>
      <select class="inp" onchange="S.newConf.region=this.value;drawAddConf()">
        ${REGIONS.map(r => `<option value="${r}"${d.region === r ? " selected" : ""}>${rshort(r)}</option>`).join("")}</select>
      <label>Verticals</label>
      <input class="inp" value="${esc(d.verticals.join(", "))}" placeholder="Payments, Travel Tech"
        oninput="S.newConf.verticals=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
      ${F("audienceSize", "Attendance", "number")}
      ${F("ticketEur", "Ticket (EUR)", "number")}
      <label>How we show up</label>
      <div class="chips" style="margin:0">
        ${ACTIVATIONS.map(a => `<button class="chip ${d.activations.includes(a) ? "on" : ""}"
          onclick="S.newConf.activations = S.newConf.activations.includes('${a}')
            ? S.newConf.activations.filter(x=>x!=='${a}')
            : [...S.newConf.activations, '${a}']; drawAddConf()">${a}</button>`).join("")}
      </div>
      <label>Who is covering it</label>
      <div class="chips" style="margin:0">
        ${TEAM.map(t => `<button class="chip ${d.covering.includes(t.id) ? "on" : ""}"
          onclick="S.newConf.covering = S.newConf.covering.includes('${t.id}')
            ? S.newConf.covering.filter(x=>x!=='${t.id}')
            : [...S.newConf.covering, '${t.id}']; drawAddConf()">${esc(t.name)}</button>`).join("")}
      </div>
      <label>Are we going?</label>
      <select class="inp" onchange="S.newConf.status=this.value;drawAddConf()">
        ${STATUSES.map(o => `<option${d.status === o ? " selected" : ""}>${o}</option>`).join("")}
      </select>
      <label>Dates</label>
      <select class="inp" onchange="S.newConf.datesConfirmed=this.value==='yes';drawAddConf()">
        <option value="yes"${d.datesConfirmed ? " selected" : ""}>Confirmed</option>
        <option value="no"${!d.datesConfirmed ? " selected" : ""}>Estimated, flag it</option></select>
      <label>Note</label>
      <textarea class="inp" style="min-height:56px" placeholder="What's the honest read on this event?"
        oninput="S.newConf.note=this.value">${esc(d.note)}</textarea>
    </div>

    <div>
      <h4>Your estimates</h4>
      ${SLIDER("icpDensity", WEIGHT_INFO.icpDensity.label, WEIGHT_INFO.icpDensity.short)}
      ${SLIDER("seniority", WEIGHT_INFO.seniority.label, WEIGHT_INFO.seniority.short)}
      ${SLIDER("strategic", WEIGHT_INFO.strategic.label, WEIGHT_INFO.strategic.short)}
    </div>

    <div id="confprev">${confPreviewHTML()}</div>

    <div class="row">
      <button class="btn" id="confsave" onclick="saveConference()" ${!(d.name && d.start && d.end) ? "disabled" : ""}>Add to the database</button>
      <button class="btn ghost" onclick="S.newConf=null;closeDrawer()">Cancel</button>
    </div>`);
}

/* The only part of the drawer that changes as you type. */
function confPreviewHTML() {
  const d = S.newConf; if (!d) return "";
  const preview = (d.start && d.end) ? scoreConference({ ...d, id: "draft" }, S.weights) : null;
  return preview ? `<div class="ai">
      <h4>Scored live</h4>
      <div class="row" style="gap:10px;margin-bottom:8px">
        <span class="tier ${preview.tier}">${preview.tier}</span>
        <span class="score" style="font-size:24px">${preview.total}</span>
        <span class="muted" style="font-size:13px">${preview.label}</span>
      </div>
      <div style="font-size:13px">${preview.action}</div>
      <div class="tiny dim" style="margin-top:8px">
        ${eur(d.ticketEur)} ticket + ${eur(preview.eff.travel)} travel from Tel Aviv
        ÷ ${preview.eff.reachable} reachable ICP contacts over ${preview.eff.days} day${preview.eff.days > 1 ? "s" : ""}
        = <b>${eur(preview.eff.costPerContact)} per qualified conversation</b>
      </div></div>`
    : `<div class="alert">Set the dates to see the score.</div>`;
}

function confPreview() {
  const d = S.newConf; if (!d) return;
  const box = document.getElementById("confprev");
  if (box) box.innerHTML = confPreviewHTML();
  const save = document.getElementById("confsave");
  if (save) save.disabled = !(d.name && d.start && d.end);
}

async function saveConference() {
  const d = S.newConf;
  const id = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36)
    + "-" + d.start.slice(2, 4);
  try {
    await DB.addConference({
      id, name: d.name, start_date: d.start, end_date: d.end,
      city: d.city, country: d.country, region: d.region, verticals: d.verticals,
      audience_size: d.audienceSize, ticket_eur: d.ticketEur,
      icp_density: d.icpDensity, seniority: d.seniority,
      strategic: d.strategic,
      status: d.status, covering: d.covering || [], activations: d.activations || [],
      dates_confirmed: d.datesConfirmed, note: d.note,
    });
    S.newConf = null; closeDrawer(); await reload();
    toast(`${d.name} added.`);
  } catch (e) { toast("Couldn't save: " + e.message, true); }
}

/* ══════════════════════════════════════════════════════════════════════
   ADD A PERSON, email first, then ask

   Shira's design, and it is the right sequence. Most tools take the whole
   record and detect duplicates afterwards, by which time the rep has typed
   everything twice and the person has walked off.

   Here the work email goes in first and is searched immediately. If it
   finds someone, the rep is shown who, with their history, and asked the
   only question that matters: is this the same person? That question gets
   answered while the human is still standing there, which is the one
   moment anybody actually knows the answer.

   Three stages: email -> confirm identity -> log the encounter.
   ══════════════════════════════════════════════════════════════════════ */
S.ap = null;

function openAddPerson(confId) {
  S.ap = { stage: "email", email: "", matches: [], checking: false,
    leadId: null, known: null,
    fields: { name: "", company: "", title: "", phone: "", segment: "PSP" },
    confId: confId || (upcoming()[0] && upcoming()[0].id), intent: "warm", note: "",
    repId: REP_ID() };
  drawAddPerson();
}

const SEGMENTS = ["PSP", "Travel", "Marketplace", "BNPL", "Payroll", "Stablecoin", "Treasury", "Other"];

function drawAddPerson() {
  const a = S.ap; if (!a) return;
  const step = n => `<span class="pill ${a.stage === n ? "blue" : ""}">${n}</span>`;

  let body = "";

  /* ── 1. the work email, and nothing else yet ─────────────────────── */
  if (a.stage === "email") {
    body = `
      <div>
        <h4>Work email</h4>
        <p class="tiny muted" style="margin:-4px 0 12px">Searched against everyone we have met.</p>
        <div class="row" style="flex-wrap:nowrap">
          <input class="inp" id="ap_email" type="email" placeholder="name@company.com"
            value="${esc(a.email)}" onkeydown="if(event.key==='Enter')checkEmail()">
          <button class="btn" onclick="checkEmail()" ${a.checking ? "disabled" : ""}>
            ${a.checking ? `<span class="spin"></span> Searching` : "Check"}</button>
        </div>
        <button class="chip" style="margin-top:10px" onclick="S.ap.email='';S.ap.stage='form';drawAddPerson()">
          No email, skip</button>
      </div>`;
  }

  /* ── 2. we found someone. ask the one question that matters ──────── */
  if (a.stage === "matched") {
    body = `
      <div class="alert"><b>We have met someone with this email.</b>
        Confirm it is the same person before this gets logged against their history.</div>
      ${a.matches.map(m => {
        const lead = m.lead;
        // allEncounters() is the mapped list, it carries confName. The raw
        // ENCOUNTERS array does not, which is how the conference name went missing.
        const hist = allEncounters().filter(e => e.leadId === lead.id)
          .sort((x, y) => x.at.localeCompare(y.at));
        return `<div class="card pad">
          <div class="spread" style="margin-bottom:8px">
            <div><b>${esc(lead.full_name)}</b>
              <div class="tiny dim">${esc(lead.title || "")}${lead.title ? " · " : ""}${esc(lead.company || "")}</div>
              <div class="tiny dim">${esc(lead.work_email || "no email on file")}</div></div>
            <span class="pill ${m.confidence >= 90 ? "blue" : "warn"}">${m.confidence}% · ${esc(m.reason)}</span>
          </div>
          ${hist.length ? `<h4 style="margin-top:12px">Met ${hist.length} time${hist.length > 1 ? "s" : ""}</h4>
            ${hist.map(e => `<div class="tiny" style="padding:5px 0;border-top:1px solid var(--line-soft)">
              <div class="spread"><b>${esc(e.confName)}</b><span class="sig ${e.intent}">${e.intent}</span></div>
              <div class="dim">${e.at.slice(0, 10)} · logged by ${esc(e.rep)} · as ${esc(e.name)} at ${esc(e.company)}</div>
              <div class="muted" style="margin-top:2px">"${esc(e.note)}"</div></div>`).join("")}`
            : `<div class="tiny dim">No encounters logged yet.</div>`}
          <div class="row" style="margin-top:12px">
            <button class="btn" onclick="sameAs('${lead.id}')">Yes, same person</button>
            <button class="btn ghost" onclick="S.ap.stage='form';S.ap.leadId=null;drawAddPerson()">No, someone new</button>
          </div>
        </div>`; }).join("")}`;
  }

  /* ── 3. a genuinely new person ───────────────────────────────────── */
  if (a.stage === "form") {
    const f = (k, label, ph = "") =>
      `<label>${label}</label><input class="inp" placeholder="${ph}" value="${esc(a.fields[k])}"
        oninput="S.ap.fields['${k}']=this.value">`;
    body = `
      <div class="alert good"><b>No match.</b> New person, tell us who they are.</div>
      <div class="kv">
        ${f("name", "Name")}
        ${f("company", "Company")}
        ${f("title", "Job title")}
        ${f("phone", "Phone", "optional")}
        <label>Segment</label>
        <select class="inp" onchange="S.ap.fields.segment=this.value">
          ${SEGMENTS.map(s => `<option${a.fields.segment === s ? " selected" : ""}>${s}</option>`).join("")}
        </select>
        <label>Email</label>
        <input class="inp" value="${esc(a.email)}" oninput="S.ap.email=this.value">
      </div>
      <p class="tiny dim" style="margin:-4px 0 4px">Nothing here is required.</p>
      <div class="row">
        <button class="btn" onclick="S.ap.stage='encounter';drawAddPerson()">Next, where did you meet?</button>

      </div>`;
  }

  /* ── 4. the encounter itself ─────────────────────────────────────── */
  if (a.stage === "encounter") {
    const who = a.known ? a.known.full_name : a.fields.name;
    const opts = CONFERENCES.filter(c => c.end >= "2026-01-01")
      .sort((x, y) => y.start.localeCompare(x.start));
    body = `
      <div class="alert good"><b>${esc(who)}</b>, logging a new encounter${a.known ? " against their existing history" : ""}.</div>
      <div class="kv">
        <label>Conference</label>
        <select class="inp" onchange="S.ap.confId=this.value">
          ${opts.map(c => `<option value="${c.id}"${a.confId === c.id ? " selected" : ""}>${esc(c.name)}, ${esc(c.city)}, ${fmtDate(c.start)}</option>`).join("")}
        </select>
        <label>Signal</label>
        <select class="inp" onchange="S.ap.intent=this.value">
          ${["cold", "warm", "hot"].map(i => `<option${a.intent === i ? " selected" : ""}>${i}</option>`).join("")}
        </select>
        <label>Note</label>
        <textarea class="inp" style="min-height:84px" placeholder="What did they actually say?"
          oninput="S.ap.note=this.value">${esc(a.note)}</textarea>
        <label>Logged by</label>
        ${repSelect(a.repId, "S.ap.repId=this.value;localStorage.setItem('rep_id',this.value);drawAddPerson()")}
      </div>
      <div class="tiny dim">${INTENT_HELP}</div>
      <button class="btn" onclick="savePerson()">Save encounter</button>`;
  }

  drawer(`<div class="spread"><h3 style="margin:0">Add a person</h3>
      <button class="x" onclick="S.ap=null;closeDrawer()">×</button></div>
    <div class="row" style="gap:5px;margin-top:8px">${step("email")}${step("matched")}${step("form")}${step("encounter")}</div>`,
    body);
}

async function checkEmail() {
  const v = document.getElementById("ap_email").value.trim();
  if (!v) return;
  S.ap.email = v; S.ap.checking = true; drawAddPerson();
  try {
    const matches = await DB.findPossibleDuplicates({ email: v });
    S.ap.checking = false;
    S.ap.matches = matches;
    // A search that finds nothing is an answer too, go straight to the form.
    S.ap.stage = matches.length ? "matched" : "form";
    drawAddPerson();
  } catch (e) { S.ap.checking = false; drawAddPerson(); toast("Search failed: " + e.message, true); }
}

function sameAs(leadId) {
  S.ap.leadId = leadId;
  S.ap.known = (S.ap.matches.find(m => m.lead.id === leadId) || {}).lead;
  S.ap.stage = "encounter";
  drawAddPerson();
}

async function savePerson() {
  const a = S.ap;
  const conf = confById(a.confId);
  /* An encounter with no rep on it cannot answer "who spoke to them", which
     is half of what the contacts view is for. So it is required, not
     defaulted to whoever happens to be logged in on this browser. */
  if (!teamById(a.repId)) return toast("Pick who logged this first.", true);
  try {
    let leadId = a.leadId;
    if (!leadId) {
      const lead = await DB.upsertLead({
        // An email with no name is a perfectly good lead. Use the local part as
        // a placeholder so the row is readable until someone fills it in.
        full_name: a.fields.name || (a.email ? a.email.split("@")[0] : "Unnamed"),
        work_email: a.email || null,
        company: a.fields.company || null, title: a.fields.title || null,
        phone: a.fields.phone || null, icp_segment: a.fields.segment,
      });
      leadId = lead.id;
    }
    await DB.addEncounter({
      lead_id: leadId, conference_id: conf.id,
      rep: (teamById(a.repId) || {}).name || REP_NAME(),
      met_at: new Date().toISOString(), intent: a.intent,
      note: a.note, raw_note: a.note,
      name_as_given: a.known ? a.known.full_name : a.fields.name,
      company_as_given: a.known ? a.known.company : a.fields.company,
      title_as_given: a.known ? a.known.title : a.fields.title,
      email_as_given: a.email || null,
    });
    const wasKnown = !!a.leadId;
    S.ap = null; closeDrawer(); await reload();
    const { contacts } = identities();
    const c = contacts.find(x => x.encounters.some(e => e.leadId === leadId));
    toast(wasKnown && c
      ? `Logged. ${c.name} has now been met ${c.touches} times, ${c.pattern.toLowerCase()}.`
      : "Saved.");
    await autoPush(leadId);
    if (wasKnown) { S.view = "contacts"; render(); }
  } catch (e) { toast("Save failed: " + e.message, true); }
}
