/* ══════════════════════════════════════════════════════════════════════════
   STAND KIOSK

   A rep sets the event and a PIN, then hands the tablet across the stand.
   From that point the page shows nothing but a form: no contact list, no
   scores, no navigation, no way back into the tool without the PIN.

   One decision worth calling out. If the email already belongs to someone we
   have met, the prospect is told nothing. They get the same thank-you as
   everyone else and the encounter is quietly attached to their existing
   record. Telling a stranger "we have you on file from Money20/20" leaks our
   pipeline to them and is faintly unsettling besides. The rep sees the merge
   later, which is the only place that information is useful.
   ══════════════════════════════════════════════════════════════════════════ */

const K = {
  stage: localStorage.getItem("kiosk_event") ? "form" : "setup",
  eventId: localStorage.getItem("kiosk_event") || "",
  rep: localStorage.getItem("kiosk_rep") || "",
  pin: localStorage.getItem("kiosk_pin") || "",
  conferences: [],
  f: { email: "", name: "", company: "", segment: "" },
  busy: false, err: "",
};

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const el = () => document.getElementById("app");

/* Tap targets instead of a dropdown: faster standing up, and it gives us the
   ICP segment without asking anyone to describe themselves as a segment. */
const SEGMENTS = [
  ["Marketplace", "We pay sellers in other currencies"],
  ["PSP", "We process payments across borders"],
  ["Travel", "We book or sell travel"],
  ["Payroll", "We pay people in other countries"],
  ["BNPL", "We collect repayments later"],
  ["Other", "Something else"],
];

const brand = `<div class="k-brand">
  <img src="logo.png" alt="">
  <div><b>Grain</b><span>Embedded cross-currency</span></div>
</div>`;

function render() {
  if (K.stage === "setup")  return renderSetup();
  if (K.stage === "done")   return renderDone();
  if (K.stage === "unlock") return renderUnlock();
  renderForm();
}

/* ── Rep-facing setup. Runs once, before the tablet leaves their hands. ── */
async function renderSetup() {
  if (!K.conferences.length) {
    el().innerHTML = `<div class="k-wrap"><div class="k-card">${brand}<p class="lede">Loading events…</p></div></div>`;
    try {
      const { data, error } = await DB.sb.from("conferences")
        .select("id,name,city,start_date,end_date").order("start_date");
      if (error) throw error;
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
    <h1>Set up the stand</h1>
    <p class="lede">Do this before you hand the tablet over. After that the screen shows only the form.</p>
    <div class="k-field"><label>Which event</label>
      <select onchange="K.eventId=this.value">
        ${K.conferences.map(c => `<option value="${c.id}"${K.eventId === c.id ? " selected" : ""}>${esc(c.name)}, ${esc(c.city)}</option>`).join("")}
      </select></div>
    <div class="k-field"><label>Your name</label>
      <input value="${esc(K.rep)}" placeholder="who is on the stand" oninput="K.rep=this.value"></div>
    <div class="k-field"><label>Four-digit PIN to get back out</label>
      <input inputmode="numeric" maxlength="4" value="${esc(K.pin)}" placeholder="0000" oninput="K.pin=this.value.replace(/\\D/g,'')"></div>
    <button class="k-go" onclick="startKiosk()">Start</button>
    <div class="k-note"><b>To get out later:</b> tap the top-left corner of the screen five times and enter the PIN.
      There is no visible way back, which is the point.</div>
  </div></div>`;
}

function startKiosk() {
  if (!K.eventId || K.pin.length !== 4) { alert("Pick an event and set a four-digit PIN."); return; }
  localStorage.setItem("kiosk_event", K.eventId);
  localStorage.setItem("kiosk_rep", K.rep || "Stand");
  localStorage.setItem("kiosk_pin", K.pin);
  K.stage = "form"; render();
  document.documentElement.requestFullscreen?.().catch(() => {});
}

/* ── What the prospect sees. Nothing else exists on this screen. ───────── */
function renderForm() {
  const conf = K.conferences.find(c => c.id === K.eventId);
  const ready = /\S+@\S+\.\S+/.test(K.f.email);
  el().innerHTML = `
    <div class="k-exit" onclick="cornerTap()"></div>
    <div class="k-wrap"><div class="k-card">
      ${brand}
      <h1>Nice to meet you</h1>
      <p class="lede">Leave your work email and we will send you something useful, not a newsletter.</p>

      <div class="k-field"><label>Work email</label>
        <input type="email" inputmode="email" autocapitalize="off" autocorrect="off"
          placeholder="you@company.com" value="${esc(K.f.email)}"
          oninput="K.f.email=this.value;refresh()"></div>

      <div class="k-field"><label>Name <span class="k-optional">optional</span></label>
        <input placeholder="" value="${esc(K.f.name)}" oninput="K.f.name=this.value"></div>

      <div class="k-field"><label>Company <span class="k-optional">optional</span></label>
        <input placeholder="" value="${esc(K.f.company)}" oninput="K.f.company=this.value"></div>

      <div class="k-field"><label>Which sounds like you? <span class="k-optional">optional</span></label>
        <div class="k-chips">
          ${SEGMENTS.map(([k, label]) => `<button class="k-chip ${K.f.segment === k ? "on" : ""}"
            onclick="K.f.segment = K.f.segment === '${k}' ? '' : '${k}'; refresh()">${label}</button>`).join("")}
        </div></div>

      ${K.err ? `<div class="k-note" style="background:#FCEEEC;color:#B03A2E">${esc(K.err)}</div>` : ""}

      <button class="k-go" ${ready && !K.busy ? "" : "disabled"} onclick="submitLead()">
        ${K.busy ? "Saving…" : "Send it over"}</button>

      <div class="k-foot">${conf ? esc(conf.name) : ""}<br>
        We will only use this to follow up on what we talked about.</div>
    </div></div>`;
}

// Only the button state changes as they type, so don't rebuild the inputs and
// lose their cursor.
function refresh() {
  const ready = /\S+@\S+\.\S+/.test(K.f.email);
  const btn = document.querySelector(".k-go");
  if (btn) btn.disabled = !ready || K.busy;
  document.querySelectorAll(".k-chip").forEach((b, i) =>
    b.classList.toggle("on", SEGMENTS[i][0] === K.f.segment));
}

async function submitLead() {
  K.busy = true; K.err = ""; refresh();
  const email = K.f.email.trim().toLowerCase();
  try {
    // Does this person already exist? The prospect is never told either way.
    const { data: found } = await DB.sb.from("leads").select("id").ilike("work_email", email).limit(1);
    let leadId = found && found[0] && found[0].id;

    if (!leadId) {
      const { data, error } = await DB.sb.from("leads").insert({
        full_name: K.f.name.trim() || email.split("@")[0],
        work_email: email,
        company: K.f.company.trim() || null,
        icp_segment: K.f.segment || null,
      }).select().single();
      if (error) throw error;
      leadId = data.id;
    }

    const { error: e2 } = await DB.sb.from("encounters").insert({
      lead_id: leadId, conference_id: K.eventId,
      rep: localStorage.getItem("kiosk_rep") || "Stand",
      met_at: new Date().toISOString(),
      // Self-entered leads start warm: they walked up and typed their own
      // email, which is more than a leaflet-taker does and less than a
      // pricing question. A rep can correct it afterwards.
      intent: "warm",
      self_entered: true,
      name_as_given: K.f.name.trim() || null,
      company_as_given: K.f.company.trim() || null,
      email_as_given: email,
      note: "Filled in at the stand" + (K.f.segment ? ". Described themselves as: " + K.f.segment : "") + ".",
      raw_note: "self-entered at the stand",
    });
    if (e2) throw e2;

    K.stage = "done"; K.busy = false; render();
    setTimeout(() => { K.f = { email: "", name: "", company: "", segment: "" }; K.stage = "form"; render(); }, 4000);
  } catch (e) {
    K.busy = false;
    K.err = "That didn't save. Try again, or grab a card and we'll add it later.";
    render();
  }
}

function renderDone() {
  el().innerHTML = `<div class="k-wrap"><div class="k-card"><div class="k-done">
    <div class="k-tick"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="#3D82F7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 12.5l5.5 5.5L20 7"/></svg></div>
    <h1>Thanks</h1>
    <p class="lede">We'll be in touch about what we talked about.</p>
  </div></div></div>`;
}

/* ── Getting back out ─────────────────────────────────────────────────── */
let taps = 0, tapTimer;
function cornerTap() {
  taps++; clearTimeout(tapTimer);
  tapTimer = setTimeout(() => taps = 0, 1800);
  if (taps >= 5) { taps = 0; K.stage = "unlock"; render(); }
}

function renderUnlock() {
  el().innerHTML = `<div class="k-wrap"><div class="k-card">
    ${brand}
    <h1>PIN</h1>
    <p class="lede">Enter the four digits you set when the stand opened.</p>
    <div class="k-field">
      <input inputmode="numeric" maxlength="4" autofocus placeholder="0000"
        style="text-align:center;letter-spacing:.5em;font-size:26px"
        oninput="if(this.value.length===4)tryUnlock(this.value)"></div>
    <button class="k-go" style="background:#F1F3F9;color:#5C6590"
      onclick="K.stage='form';render()">Back to the form</button>
  </div></div>`;
}

function tryUnlock(v) {
  if (v !== localStorage.getItem("kiosk_pin")) { alert("Wrong PIN."); return; }
  localStorage.removeItem("kiosk_event");
  document.exitFullscreen?.().catch(() => {});
  location.href = "index.html";
}

/* Make the browser's own escape routes harder to hit by accident. */
window.addEventListener("beforeunload", e => {
  if (K.stage === "form" && localStorage.getItem("kiosk_event")) { e.preventDefault(); e.returnValue = ""; }
});
document.addEventListener("contextmenu", e => { if (K.stage === "form") e.preventDefault(); });

render();
