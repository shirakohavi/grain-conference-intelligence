/* ══════════════════════════════════════════════════════════════════════════
   FIELD MODE

   One form, two screens, and a deliberate pause between them.

   Screen one is three boxes: work email, name, company. Either the rep or the
   person in front of them fills it in. There is nothing else on the page.

   Continue is the handback. Whoever filled the boxes in stops there and the
   rep takes the tablet, because screen two is where we say what we already
   know about this person.

   Everything is written the moment Continue is pressed: the lead, and the meeting.
   A rep who gets pulled into the next conversation and never types a note
   still keeps the lead. The note then autosaves as they type, so the only
   button on screen two is the one that clears it for the next person.
   ══════════════════════════════════════════════════════════════════════════ */

const K = {
  /* Always opens on setup, even when this browser remembers the last pair.
     Whoever picks the tablet up confirms which event they are at and which
     of them is logging, before a prospect touches it. The remembered pair is
     preselected, so confirming is one tap rather than a form to fill in. */
  stage: "setup",
  eventId: localStorage.getItem("fm_event") || "",
  repId: localStorage.getItem("rep_id") || "",
  team: [],
  conferences: [],
  f: { email: "", name: "", company: "", title: "" },
  lead: null, encounterId: null, history: [], maybe: [],
  note: { text: "", intent: "warm", segment: "" },
  busy: false, err: "", saved: "",
};

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const el = () => document.getElementById("app");
const dmy = iso => { const d = new Date(iso), p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };

const SEGMENTS = ["Marketplace", "PSP", "Travel", "Payroll", "BNPL", "Stablecoin", "Other"];
/* The chip is the value, written as something a rep can check against their
   own note rather than something they have to feel. "Real question" is a
   judgement two reps will disagree about, and this field decides whether
   HubSpot gets the lead on its own, so it has to be a test.
   The colours are the same red, amber and grey that HOT, WARM and COLD wear
   everywhere else, so the mapping is learned without being explained. */
const INTENTS = [
  ["hot",  "Named a budget or a date"],
  ["warm", "Told us their FX problem"],
  ["cold", "No problem named"],
];

const brand = `<div class="k-brand">
  <img src="logo.png" alt="">
  <div><b>Grain</b><span>Field mode</span></div>
</div>`;

function render() {
  if (K.stage === "setup") return renderSetup();
  if (K.stage === "card")  return renderCard();
  renderForm();
}

/* ── Setup. Once, then remembered. ──────────────────────────────────────── */
async function renderSetup() {
  if (!K.conferences.length) {
    el().innerHTML = `<div class="k-wrap"><div class="k-card">${brand}<p class="lede">Loading events…</p></div></div>`;
    try {
      const [{ data, error }, tm] = await Promise.all([
        DB.sb.from("conferences").select("id,name,city,start_date,end_date").order("start_date"),
        DB.sb.from("team").select("id,full_name").eq("active", true).order("full_name"),
      ]);
      if (error) throw error;
      K.team = (tm.data || []).map(t => ({ id: t.id, name: t.full_name }));
      const today = new Date().toISOString().slice(0, 10);
      K.conferences = data.filter(c => c.end_date >= "2026-01-01");
      const live = K.conferences.find(c => c.start_date <= today && c.end_date >= today);
      K.eventId = K.eventId || (live || K.conferences.find(c => c.start_date >= today) || K.conferences[0] || {}).id || "";
    } catch (e) {
      el().innerHTML = `<div class="k-wrap"><div class="k-card">${brand}
        <h1>Can't reach the database</h1><p class="lede">${esc(e.message)}</p>
        <button class="k-go" onclick="location.reload()">Try again</button></div></div>`;
      return;
    }
  }
  el().innerHTML = `<div class="k-wrap"><div class="k-card k-setup">
    ${brand}
    <h1>Field mode</h1>
    <div class="k-field"><label>Event</label>
      <select onchange="K.eventId=this.value">
        ${K.conferences.map(c => `<option value="${c.id}"${K.eventId === c.id ? " selected" : ""}>${esc(c.name)}, ${esc(c.city)}</option>`).join("")}
      </select></div>
    <div class="k-field"><label>Grain sales rep</label>
      <select onchange="K.repId=this.value">
        <option value="">Choose a rep</option>
        ${K.team.map(t => `<option value="${t.id}"${K.repId === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}
      </select></div>
    <button class="k-go" onclick="start()">Start</button>
  </div></div>`;
}

function start() {
  if (!K.eventId) { alert("Pick an event."); return; }
  /* The rep has to pick a name off the roster. Without it the encounter
     cannot say who spoke to this person, which is the column the contacts
     view is built around. */
  if (!K.team.find(t => t.id === K.repId)) { alert("Pick the rep logging this."); return; }
  localStorage.setItem("fm_event", K.eventId);
  localStorage.setItem("rep_id", K.repId);
  K.stage = "form"; render();
  document.documentElement.requestFullscreen?.().catch(() => {});
}

/* ══════════════════════════════════════════════════════════════════════
   SCREEN ONE. A title and three boxes.
   ══════════════════════════════════════════════════════════════════════ */
function renderForm() {
  el().innerHTML = `
    <div class="k-exit" onclick="cornerTap()"></div>
    <div class="k-wrap"><div class="k-card">
      ${brand}
      <h1>Nice to meet you</h1>

      <div class="k-field"><label>Work email</label>
        <input type="email" inputmode="email" autocapitalize="off" autocorrect="off"
          placeholder="you@company.com" value="${esc(K.f.email)}"
          oninput="K.f.email=this.value;refresh()"></div>

      <div class="k-field"><label>Name</label>
        <input value="${esc(K.f.name)}" oninput="K.f.name=this.value;refresh()"></div>

      <div class="k-field"><label>Company</label>
        <input value="${esc(K.f.company)}" oninput="K.f.company=this.value;refresh()"></div>

      <div class="k-field"><label>Role</label>
        <input placeholder="Head of Treasury" value="${esc(K.f.title)}"
          oninput="K.f.title=this.value;refresh()"></div>

      ${K.err ? `<div class="k-note k-bad">${esc(K.err)}</div>` : ""}

      <button class="k-go" id="go" ${ready() ? "" : "disabled"} onclick="lookUp()">Continue</button>

      <div class="k-context">
        <div class="k-cx"><label>Event</label>
          <select onchange="setEvent(this.value)">
            ${K.conferences.map(c => `<option value="${c.id}"${K.eventId === c.id ? " selected" : ""}
              >${esc(c.name)}</option>`).join("")}
          </select></div>
        <div class="k-cx"><label>Logged by</label>
          <select onchange="setRep(this.value)">
            ${K.team.map(t => `<option value="${t.id}"${K.repId === t.id ? " selected" : ""}
              >${esc(t.name)}</option>`).join("")}
          </select></div>
      </div>
    </div></div>`;
}

const ready = () => /\S+@\S+\.\S+/.test(K.f.email) && K.f.name.trim().length > 1;

// Only the button state changes while they type, so don't rebuild the inputs
// and throw away the cursor.
function refresh() {
  const b = document.getElementById("go");
  if (b) b.disabled = !ready() || K.busy;
}

/* ══════════════════════════════════════════════════════════════════════
   CONTINUE. Look them up, write the lead and the meeting, then show it.
   ══════════════════════════════════════════════════════════════════════ */
async function lookUp() {
  K.busy = true; K.err = "";
  el().innerHTML = `<div class="k-wrap"><div class="k-card">${brand}
    <p class="lede">Checking who we already know…</p></div></div>`;

  const email = K.f.email.trim().toLowerCase();
  const name = K.f.name.trim(), company = K.f.company.trim(), title = K.f.title.trim();
  try {
    if (!K.conferences.length) {
      const { data: cs } = await DB.sb.from("conferences").select("id,name,city");
      K.conferences = cs || [];
    }

    /* 1. Exact email. The person typed it themselves, so this is the check
          that matters. */
    const { data: exact } = await DB.sb.from("leads").select("*").ilike("work_email", email).limit(1);
    let lead = exact && exact[0];

    /* 2. No exact hit. Someone who gave a different address last time is the
          common case, so run the same matcher the Contacts page uses against
          people with the same surname or company. It suggests, never merges. */
    K.maybe = [];
    if (!lead) {
      const last = name.split(/\s+/).slice(-1)[0];
      const pool = {};
      if (last && last.length > 2) {
        const { data } = await DB.sb.from("leads").select("*").ilike("full_name", "%" + last + "%").limit(20);
        (data || []).forEach(r => pool[r.id] = r);
      }
      if (company.length > 2) {
        const { data } = await DB.sb.from("leads").select("*").ilike("company", "%" + company + "%").limit(20);
        (data || []).forEach(r => pool[r.id] = r);
      }
      K.maybe = Object.values(pool).map(l => {
        const { score, reasons } = matchConfidence(
          { name, company, title, email },
          { name: l.full_name || "", company: l.company || "", title: l.title || "", email: l.work_email || "" });
        return { lead: l, score, reasons };
      }).filter(x => x.score >= 40).sort((a, b) => b.score - a.score).slice(0, 2);
    }

    /* 3. Write it now, before anyone types a note. */
    if (!lead) {
      const { data, error } = await DB.sb.from("leads").insert({
        full_name: name || email.split("@")[0],
        work_email: email,
        company: company || null,
        title: title || null,
      }).select().single();
      if (error) throw error;
      lead = data;
    }
    K.lead = lead;
    K.note = { text: "", intent: "warm", segment: lead.icp_segment || "" };

    const { data: encs } = await DB.sb.from("encounters")
      .select("id,conference_id,rep,met_at,intent,note").eq("lead_id", lead.id).order("met_at");
    K.history = encs || [];

    const { data: created, error: e2 } = await DB.sb.from("encounters").insert({
      lead_id: lead.id, conference_id: K.eventId,
      rep: (K.team.find(t => t.id === K.repId) || {}).name || "Stand",
      met_at: new Date().toISOString(),
      intent: "warm", self_entered: true,
      name_as_given: name || null, company_as_given: company || null,
      title_as_given: title || null, email_as_given: email,
      note: "", raw_note: "",
    }).select().single();
    if (e2) throw e2;
    K.encounterId = created.id;
    K.saved = "Saved";
  } catch (e) {
    K.err = "Couldn't save that. " + e.message;
    K.busy = false; K.stage = "form"; render(); return;
  }
  K.busy = false; K.stage = "card"; render();
}

const confName = id => (K.conferences.find(c => c.id === id) || {}).name || id;

/* ══════════════════════════════════════════════════════════════════════
   SCREEN TWO. The contact, and a box to say what was said.
   ══════════════════════════════════════════════════════════════════════ */
function renderCard() {
  const l = K.lead || {};
  const known = K.history.length > 0;

  el().innerHTML = `
    <div class="k-exit" onclick="cornerTap()"></div>
    <div class="k-wrap"><div class="k-card k-rep">
      <div class="k-rephead">
        <span class="k-tag ${known ? "known" : "new"}">${known ? "Met before" : "New contact"}</span>
        <span class="k-saved" id="saved">${esc(K.saved)}</span>
      </div>

      <h1>${esc(l.full_name || K.f.name)}</h1>
      <p class="lede">${esc(l.company || K.f.company)}${(l.company || K.f.company) && l.title ? " · " : ""}${esc(l.title || "")}<br>
        <span class="k-mono">${esc(l.work_email || K.f.email)}</span></p>

      ${K.maybe.length ? `<div class="k-maybe">
        <div class="k-histhead">Might be someone we know</div>
        ${K.maybe.map((m, i) => `<div class="k-maybrow">
          <div><b>${esc(m.lead.full_name)}</b> <span class="k-histmeta">${esc(m.lead.company || "")} · ${esc(m.lead.work_email || "no email")}</span>
            <div class="k-histmeta">${m.score}/100 · ${esc(m.reasons.join(", "))}</div></div>
          <button class="k-mergebtn" onclick="mergeInto(${i})">Same person</button>
        </div>`).join("")}
      </div>` : ""}

      ${known ? `<div class="k-hist">
        <div class="k-histhead">Met ${K.history.length} time${K.history.length > 1 ? "s" : ""} before</div>
        ${K.history.map(e => `<div class="k-histrow">
          <div class="k-histtop"><b>${esc(confName(e.conference_id))}</b>
            <span class="k-sig ${esc(e.intent)}">${esc(e.intent)}</span></div>
          <div class="k-histmeta">${dmy(e.met_at)} · ${esc(e.rep)}</div>
          ${e.note ? `<div class="k-histnote">${esc(e.note)}</div>` : ""}
        </div>`).join("")}
      </div>` : ""}

      <div class="k-field"><label>What did they say?</label>
        <textarea class="k-ta" id="note" placeholder="asked how we price the hedge on THB, said FX is eating their margin"
          oninput="noteTyped(this.value)">${esc(K.note.text)}</textarea></div>

      <div class="k-field"><label>Signal</label>
        <div class="k-chips">
          ${INTENTS.map(([v, lab]) => `<button class="k-chip sig-${v} ${K.note.intent === v ? "on" : ""}"
            onclick="setIntent('${v}')">${lab}</button>`).join("")}
        </div></div>

      <div class="k-field"><label>Segment</label>
        <div class="k-chips">
          ${SEGMENTS.map(sg => `<button class="k-chip ${K.note.segment === sg ? "on" : ""}"
            onclick="setSegment('${sg}')">${esc(sg)}</button>`).join("")}
        </div></div>

      ${K.err ? `<div class="k-note k-bad">${esc(K.err)}</div>` : ""}

      <button class="k-go" onclick="nextPerson()">Next person</button>
    </div></div>`;
}

/* ── Autosave. No save button: the note is written as it is typed, so a rep
      who walks away mid-sentence loses a sentence and not a lead. ─────── */
let noteTimer;
function noteTyped(v) {
  K.note.text = v;
  flag("Saving…");
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => saveNote(), 700);
}
function setIntent(v) { K.note.intent = v; render(); saveNote(); }
function setSegment(sg) {
  K.note.segment = K.note.segment === sg ? "" : sg;
  render();
  saveNote();
  if (K.lead) DB.sb.from("leads").update({ icp_segment: K.note.segment || null }).eq("id", K.lead.id);
}

function flag(t) { K.saved = t; const e = document.getElementById("saved"); if (e) e.textContent = t; }

async function saveNote() {
  if (!K.encounterId) return;
  try {
    const { error } = await DB.sb.from("encounters").update({
      note: K.note.text.trim(), raw_note: K.note.text.trim(), intent: K.note.intent,
    }).eq("id", K.encounterId);
    if (error) throw error;
    flag("Saved");
  } catch (e) { flag("Not saved"); }
}

/* ── The rep says it is the same person as an existing record. Move the
      meeting we just wrote onto them and drop the duplicate lead. ─────── */
async function mergeInto(i) {
  const m = K.maybe[i]; if (!m || !K.encounterId) return;
  const dupe = K.lead;
  try {
    await DB.sb.from("encounters").update({ lead_id: m.lead.id }).eq("id", K.encounterId);
    if (dupe && dupe.id !== m.lead.id) await DB.sb.from("leads").delete().eq("id", dupe.id);
    K.lead = m.lead; K.maybe = [];
    const { data: encs } = await DB.sb.from("encounters")
      .select("id,conference_id,rep,met_at,intent,note").eq("lead_id", m.lead.id)
      .neq("id", K.encounterId).order("met_at");
    K.history = encs || [];
    K.saved = "Saved"; render();
  } catch (e) { K.err = "Couldn't move that meeting across."; render(); }
}

function nextPerson() {
  clearTimeout(noteTimer);
  saveNote();
  K.f = { email: "", name: "", company: "", title: "" };
  K.note = { text: "", intent: "warm", segment: "" };
  K.lead = null; K.encounterId = null; K.history = []; K.maybe = [];
  K.err = ""; K.saved = ""; K.busy = false;
  K.stage = "form"; render();
}

/* The footer is the way back. It is small and it names what it would change,
   because the screen it sits on is the one a prospect is holding: it has to
   be findable by the rep and uninteresting to a stranger. */
/* Changing either one happens in place. No dialog, no losing what is typed:
   a rep who has just walked to a different stand should not have to answer a
   question about it. Both persist immediately, so the next person captured
   on this tablet inherits the pair. */
function setEvent(id) { K.eventId = id; localStorage.setItem("fm_event", id); }
function setRep(id)   { K.repId   = id; localStorage.setItem("rep_id",   id); }

/* ── Getting out. Five taps in the top-left corner. ─────────────────────── */
let taps = 0, tapTimer;
function cornerTap() {
  taps++; clearTimeout(tapTimer);
  tapTimer = setTimeout(() => taps = 0, 1800);
  if (taps >= 5) {
    taps = 0;
    localStorage.removeItem("fm_event");
    document.exitFullscreen?.().catch(() => {});
    location.href = "index.html";
  }
}

document.addEventListener("contextmenu", e => { if (K.stage === "form") e.preventDefault(); });

/* The roster is needed even when setup is skipped, because the encounter
   written on save has to carry the rep's real name. */
(async () => {
  try {
    const { data } = await DB.sb.from("team").select("id,full_name").eq("active", true).order("full_name");
    K.team = (data || []).map(t => ({ id: t.id, name: t.full_name }));
    if (K.stage !== "setup" && !K.team.find(t => t.id === K.repId)) { K.stage = "setup"; render(); }
  } catch (e) { /* setup will load it again and show the error there */ }
})();

render();
