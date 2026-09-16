/* ══════════════════════════════════════════════════════════════════════════
   DATA ACCESS

   One job: talk to Postgres and hand the rest of the app objects in the shape
   it already understands. Postgres uses snake_case, the engine uses camelCase,
   and that translation lives here and nowhere else, so the scoring code never
   has to know where its data came from.
   ══════════════════════════════════════════════════════════════════════════ */

/* Created lazily. If the CDN that serves supabase-js is blocked or slow, this
   file must still define DB, otherwise a network hiccup takes the whole app
   down at parse time instead of showing a useful message. */
const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

const NO_CLIENT = "The Supabase client library didn't load. Check the network, "
  + "or that the script tag for supabase-js in index.html is reachable.";

const DB = (() => {

  const toConf = r => ({
    id: r.id, name: r.name, start: r.start_date, end: r.end_date,
    city: r.city, country: r.country, region: r.region,
    verticals: r.verticals || [],
    audienceSize: r.audience_size, ticketEur: Number(r.ticket_eur),
    icpDensity: r.icp_density, seniority: r.seniority,
    crossBorder: r.cross_border, strategic: r.strategic,
    status: r.status, activations: r.activations || [],
    covering: r.covering || [],
    attendedBefore: r.attended_before, datesConfirmed: r.dates_confirmed,
    note: r.note,
    /* Set by the weekly discovery run in n8n, never by a person. */
    aiSourced: !!r.ai_sourced, sourceUrl: r.source_url, discoveredAt: r.discovered_at,
  });

  /* An encounter carries the identity AS RECORDED AT THE TIME, which is what
     makes job changes and name variants visible instead of overwritten. */
  const toEnc = (r, leadById) => {
    const lead = leadById[r.lead_id] || {};
    return {
      id: r.id, leadId: r.lead_id, confId: r.conference_id,
      name:    r.name_as_given    || lead.full_name,
      company: r.company_as_given || lead.company,
      title:   r.title_as_given   || lead.title,
      email:   r.email_as_given   || lead.work_email || "",
      rep: r.rep, at: r.met_at, intent: r.intent,
      note: r.note, raw: r.raw_note,
      icpSignals: r.icp_signals || [],
      segment: lead.icp_segment, leadStatus: lead.status,
      hubspotId: lead.hubspot_id,
    };
  };

  async function loadAll() {
    if (!sb) throw new Error(NO_CLIENT);
    const [c, l, e, t] = await Promise.all([
      sb.from("conferences").select("*").order("start_date"),
      sb.from("leads").select("*"),
      sb.from("encounters").select("*").order("met_at"),
      sb.from("team").select("*").order("full_name"),
    ]);
    for (const r of [c, l, e, t]) if (r.error) throw new Error(r.error.message);
    const leadById = Object.fromEntries(l.data.map(x => [x.id, x]));
    return {
      conferences: c.data.map(toConf),
      leads: l.data,
      encounters: e.data.map(r => toEnc(r, leadById)),
      team: t.data.map(r => ({ id: r.id, name: r.full_name,
        initials: r.initials, region: r.home_region, active: r.active,
        calendar: r.calendar_link || "" })),
    };
  }

  /* ── the entry-time duplicate check ──────────────────────────────────────
     Shira's design, and it is better than catching it later: the rep is told
     while the person is still standing in front of them, not in a queue
     afterwards. Email is the exact hit; name+company is the soft hit. */
  async function findPossibleDuplicates({ email, name, company }) {
    if (!sb) throw new Error(NO_CLIENT);
    const out = [];
    if (email) {
      const { data } = await sb.from("leads").select("*").ilike("work_email", email.trim());
      (data || []).forEach(d => out.push({ lead: d, reason: "same work email", confidence: 100 }));
    }
    if (!out.length && name) {
      const last = name.trim().split(/\s+/).slice(-1)[0];
      if (last && last.length > 2) {
        const { data } = await sb.from("leads").select("*").ilike("full_name", `%${last}%`);
        (data || []).forEach(d => {
          const sameCo = company && d.company &&
            d.company.toLowerCase().replace(/[^a-z]/g, "") === company.toLowerCase().replace(/[^a-z]/g, "");
          out.push({ lead: d, confidence: sameCo ? 88 : 60,
            reason: sameCo ? "similar name at the same company" : "similar name, different company" });
        });
      }
    }
    return out.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
  }

  /* Candidate retrieval for the identity check. This deliberately returns
     RAW ROWS and scores nothing. Narrowing the search is a database job;
     deciding whether two rows are the same person is engine.js's job, and
     keeping those two apart is what stops the confidence number from being
     invented in two different places. Cast wide, score once. */
  async function searchCandidates({ email, name, company }) {
    if (!sb) throw new Error(NO_CLIENT);
    const byId = {};
    const take = rows => (rows || []).forEach(r => { byId[r.id] = r; });

    if (email && email.includes("@")) {
      const [local, domain] = email.trim().toLowerCase().split("@");
      // Exact address, then everyone else at the same domain. The second one
      // is what catches "same person, new email format" and "same company,
      // different person", which are the two cases worth looking at.
      const { data: exact } = await sb.from("leads").select("*").ilike("work_email", email.trim());
      take(exact);
      const { data: sameDomain } = await sb.from("leads").select("*").ilike("work_email", "%@" + domain).limit(25);
      take(sameDomain);
      if (local && local.length > 2) {
        const { data: sameLocal } = await sb.from("leads").select("*").ilike("work_email", local + "@%").limit(10);
        take(sameLocal);
      }
    }
    if (name) {
      // Surname, because first names get shortened and surnames rarely do.
      const last = name.trim().split(/\s+/).slice(-1)[0];
      if (last && last.length > 2) {
        const { data } = await sb.from("leads").select("*").ilike("full_name", "%" + last + "%").limit(25);
        take(data);
      }
    }
    if (company && company.trim().length > 2) {
      const { data } = await sb.from("leads").select("*").ilike("company", "%" + company.trim() + "%").limit(25);
      take(data);
    }
    return Object.values(byId);
  }

  /* Correcting the snapshot an encounter was logged under. Used only when a
     person edits a contact's details: the contact card reads its name,
     company and role off the most recent encounter, so writing to the lead
     row alone changes the database and nothing the rep can see. */
  async function updateEncounter(id, fields) {
    if (!sb) throw new Error(NO_CLIENT);
    const { error } = await sb.from("encounters").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async function updateConference(id, fields) {
    if (!sb) throw new Error(NO_CLIENT);
    const { error } = await sb.from("conferences").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async function upsertLead(fields) {
    if (!sb) throw new Error(NO_CLIENT);
    const { data, error } = await sb.from("leads").insert(fields).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function addEncounter(fields) {
    if (!sb) throw new Error(NO_CLIENT);
    const { data, error } = await sb.from("encounters").insert(fields).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function setConferenceStatus(id, status) {
    if (!sb) throw new Error(NO_CLIENT);
    const { error } = await sb.from("conferences").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async function addConference(fields) {
    if (!sb) throw new Error(NO_CLIENT);
    const { data, error } = await sb.from("conferences").insert(fields).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function updateLead(id, fields) {
    if (!sb) throw new Error(NO_CLIENT);
    const { error } = await sb.from("leads").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  }

  /* Realtime: two reps working the same floor see each other's captures. */
  function onChange(cb) {
    if (!sb) return null;
    return sb.channel("floor")
      .on("postgres_changes", { event: "*", schema: "public", table: "encounters" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "conferences" }, cb)
      .subscribe();
  }

  return { sb, loadAll, findPossibleDuplicates, searchCandidates, upsertLead, addEncounter,
           setConferenceStatus, updateConference, addConference, updateLead,
           updateEncounter, onChange };
})();
