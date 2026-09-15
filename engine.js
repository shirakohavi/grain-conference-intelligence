/* ══════════════════════════════════════════════════════════════════════════
   ENGINE, all deterministic logic lives here. No AI in this file.

   Design principle: anything that must be REPRODUCIBLE and DEFENSIBLE is
   computed here in plain arithmetic. AI is used only where the job actually
   requires judgement (see ai.js). A sales lead can audit every number on
   this page; they cannot audit a black box.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Grain is headquartered in Tel Aviv, so travel cost is anchored there.
      Rough all-in per-person flight + hotel, in EUR. ─────────────────────── */
const TRAVEL_FROM_TLV = {
  "Middle East": 900, "Europe": 1200, "Africa": 1800,
  "Asia-Pacific": 2200, "North America": 2400, "South America": 3000,
};

/* A rep can realistically hold ~20 qualified conversations per day on a show
   floor. Above that, extra attendees stop being reachable, so efficiency is
   cost per REACHABLE ICP contact, not cost per attendee. This is why a 62,000
   person festival does not automatically beat a 1,800 person one. */
const MEETINGS_PER_DAY = 20;

/* Sales shorthand for the regions, for display only. The stored value stays
   as it is, because travel cost and trip clustering both key off the full six
   and EMEA cannot have one flight price: Dubai is 900 from Tel Aviv, Europe
   1200, Africa 1800. Merging them would also suggest London and Dubai as one
   trip, which nobody flying out of Tel Aviv would book. */
const REGION_SHORT = {
  "Europe": "EUR", "Middle East": "ME", "Africa": "AFR",
  "Asia-Pacific": "APAC", "North America": "NA", "South America": "LATAM",
};
const rshort = r => REGION_SHORT[r] || r;

/* Four criteria, and ICP fit is worth double any other one.

   Cross-border relevance used to be a fifth criterion. It was dropped because
   it measures nearly the same thing as ICP fit from the agenda side, and it
   was rewarding events whose programme talks about cross-border payments but
   whose room is thin on companies that actually move money across currencies.
   Sibos and ITB Berlin were the clearest cases. The room is what a rep can
   work; the agenda is not. */
const DEFAULT_WEIGHTS = {
  icpDensity: 40,   // what share of the room moves money across currencies?
  seniority: 20,    // can the people there actually say yes?
  efficiency: 20,   // what does one qualified conversation cost us?
  strategic: 20,    // partners who could embed us, and markets we want to open
};

/* Plain-language definition of each weight, used by the Settings panel.
   Kept here rather than in the UI so the number and its meaning cannot
   drift apart. */
const WEIGHT_INFO = {
  icpDensity: {
    label: "ICP fit",
    short: "Is the room full of our buyers?",
    long: "The share of attendees that are marketplaces, PSPs, travel and e-commerce platforms, BNPL, stablecoin or payroll companies. What matters is whether they move money across currencies, not what the event calls itself. This is why a travel-tech summit can beat a payments expo.",
    source: "Estimated from the exhibitor list and audience breakdown.",
  },
  seniority: {
    label: "Seniority",
    short: "Can they say yes?",
    long: "Whether companies send people who own the FX line or people who report to them. A small senior room beats a large junior one.",
    source: "Organisers publish this to sell sponsorships.",
  },
  efficiency: {
    label: "Cost per conversation",
    short: "What does a useful conversation cost?",
    long: "Ticket plus flight and hotel from Tel Aviv, divided by the buyers one rep can realistically reach. Capped at 20 conversations a day, so a 40,000-person expo does not win on size alone.",
    source: "Calculated, not estimated. The only one.",
  },
  strategic: {
    label: "Strategic reach",
    short: "Partners, and markets we want to open",
    long: "Two things that both pay off later than a deal does. Are the platforms that could ship Grain to their own customer base in the room, the ones who would embed us rather than buy from us. And does this event open a market Grain is trying to enter this year. A mediocre event in a corridor we are pushing into can be worth more than a good one where we are already known.",
    source: "Partners come off the exhibitor list. The market priority is a decision the company makes, not a fact about the event.",
  },
};

/* No real conference scores 100 on all four, and none scores 0. A raw weighted
   average bunches everything between about 16 and 78, which makes the tiers
   useless to look at. We stretch that real band onto 0-100 with two stated
   anchors, so the number a rep sees is comparative:
     raw 12 = an event with no relevance to us whatsoever
     raw 80 = the realistic best case for Grain's ICP
   Nothing about the RANKING changes, this is presentation, not weighting. */
const RAW_FLOOR = 12, RAW_CEIL = 80;
const stretch = raw => clamp((raw - RAW_FLOOR) / (RAW_CEIL - RAW_FLOOR) * 100);

const TIERS = [
  { min: 80, tier: "A", label: "Anchor",       action: "Book it. Two reps, and a pre-booked meeting schedule before you fly." },
  { min: 65, tier: "B", label: "Selective",    action: "One rep. Name three targets who'll be there before you book it." },
  { min: 45, tier: "C", label: "Cluster-only", action: "Only if it bolts onto a trip you're already taking." },
  { min: -1, tier: "D", label: "Skip",         action: "Don't. Put the budget into an A-tier instead." },
];

function daysOf(c) {
  const a = new Date(c.start), b = new Date(c.end);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function efficiencyScore(c) {
  const days = daysOf(c);
  const icpAttendees = c.audienceSize * (c.icpDensity / 100);
  const reachable = Math.max(1, Math.min(icpAttendees, MEETINGS_PER_DAY * days));
  const travel = TRAVEL_FROM_TLV[c.region] ?? 1500;
  const costPerContact = (c.ticketEur + travel) / reachable;
  // €5 per reachable ICP contact is excellent; each 10x above that costs 55 pts.
  const score = 100 - 55 * Math.log10(Math.max(costPerContact, 0.5) / 5);
  return { score: clamp(score), costPerContact, reachable: Math.round(reachable), travel, days };
}

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/* An event can arrive without estimates: the signal miner reads a Slack thread,
   finds a conference name, and inserts it. Nobody has assessed it yet. Scoring
   it anyway would produce a confident-looking number built on nothing, so it is
   not scored at all until someone fills the estimates in. */
const ESTIMATE_FIELDS = ["icpDensity", "seniority", "strategic"];
const isUnscored = c => !c || c.audienceSize == null
  || ESTIMATE_FIELDS.some(k => c[k] == null || c[k] === "");

function scoreConference(c, weights = DEFAULT_WEIGHTS) {
  if (isUnscored(c)) {
    return { unscored: true, total: null, raw: null, parts: null, eff: null,
      tier: "?", label: "Not scored", min: -1,
      action: "Nobody has assessed this one yet. Add the estimates and it ranks with the rest." };
  }
  const eff = efficiencyScore(c);
  const parts = {
    icpDensity: c.icpDensity,
    seniority: c.seniority,
    efficiency: eff.score,
    strategic: c.strategic,
  };
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const raw = Object.keys(parts).reduce((s, k) => s + parts[k] * (weights[k] || 0), 0) / wsum;
  const total = stretch(raw);
  const t = TIERS.find(t => total >= t.min);
  // What is dragging this score down the most, relative to a 100 in that slot?
  const weakest = Object.keys(parts)
    .map(k => ({ k, loss: (100 - parts[k]) * (weights[k] || 0) / wsum }))
    .sort((a, b) => b.loss - a.loss)[0];
  const strongest = Object.keys(parts)
    .map(k => ({ k, gain: parts[k] * (weights[k] || 0) / wsum }))
    .sort((a, b) => b.gain - a.gain)[0];
  return { total, raw: Math.round(raw), parts, eff, ...t, weakest: weakest.k, strongest: strongest.k };
}

/* ── PLANNING ──────────────────────────────────────────────────────────────
   Two things a planner needs that a list cannot show: trips that could be
   combined, and dates where you've double-booked yourself.               */

const REGION_HUBS = { // crude but sufficient: same hub = one flight can cover both
  "Europe": "EU", "Middle East": "ME", "North America": "NA",
  "Asia-Pacific": "AP", "Africa": "AF", "South America": "SA",
};

function findClusters(confs, { maxGap = 10, maxSpan = 18, minTier = 45 } = {}, weights) {
  // Only cluster events that are individually worth some consideration -
  // otherwise the "trip" is padded with events nobody would attend.
  const worthy = confs
    .map(c => ({ c, s: scoreConference(c, weights) }))
    .filter(x => x.s.total >= minTier)
    .sort((a, b) => a.c.start.localeCompare(b.c.start));

  const clusters = [];
  for (const { c, s: sc } of worthy) {
    const hub = REGION_HUBS[c.region];
    const open = clusters.find(cl => {
      if (cl.hub !== hub) return false;
      const gap = (new Date(c.start) - new Date(cl.end)) / 86400000;
      const span = (new Date(c.end) - new Date(cl.start)) / 86400000 + 1;
      return gap <= maxGap && span <= maxSpan;
    });
    if (open) {
      open.items.push(c); open.scores.push(sc);
      if (c.end > open.end) open.end = c.end;
    } else {
      clusters.push({ hub, region: c.region, start: c.start, end: c.end, items: [c], scores: [sc] });
    }
  }
  return clusters
    .filter(cl => cl.items.length > 1)
    .map(cl => {
      const savedTravel = TRAVEL_FROM_TLV[cl.region] * (cl.items.length - 1);
      const bestScore = Math.max(...cl.scores.map(s => s.total));
      const avgScore = Math.round(cl.scores.reduce((a, s) => a + s.total, 0) / cl.scores.length);
      const cities = [...new Set(cl.items.map(i => i.city))];
      return {
        ...cl, savedTravel, bestScore, avgScore, cities,
        // The title is the distinct cities in date order. Capped at two so a
        // four-city trip does not run off the card, and falling back to the
        // region when every event is in the same city, because "Dubai" on its
        // own does not read as a trip.
        title: cities.length === 1
          ? `${cities[0]}, ${cl.items.length} events`
          : cities.slice(0, 2).join(" then ") + (cities.length > 2 ? ` +${cities.length - 2} more` : ""),
        span: Math.round((new Date(cl.end) - new Date(cl.start)) / 86400000) + 1,
        // A trip is worth taking if it saves money AND the events are good.
        value: Math.round(savedTravel / 100 * (avgScore / 50)),
      };
    })
    .sort((a, b) => b.value - a.value);
}

/* ── GAPS ──────────────────────────────────────────────────────────────
   Two different things a planner calls a gap, and they need different
   answers, so they are computed separately.

   A COVERAGE gap is a region with events worth attending where nothing is
   booked. The fix is to book one.

   A CALENDAR gap is a run of months with nothing booked at all. The fix is
   usually different: pipeline goes quiet about a quarter after the team
   stops meeting people, so a three-month hole in spring is a revenue hole
   in summer. It is only reported when there was something bookable in
   those months, otherwise it is not a gap, it is just a quiet season.   */
function findGaps(confs, attending, weights, { minTier = 65, minEvents = 2, minMonths = 2 } = {}) {
  const scored = confs.map(c => ({ c, s: scoreConference(c, weights) }));
  const worthy = scored.filter(x => x.s.total >= minTier);

  const byRegion = {};
  worthy.forEach(({ c, s }) => {
    const r = byRegion[c.region] = byRegion[c.region] || { region: c.region, events: [], booked: 0 };
    r.events.push({ c, s });
    if (attending.has(c.id)) r.booked++;
  });
  const coverage = Object.values(byRegion)
    .filter(r => r.events.length >= minEvents && r.booked === 0)
    .map(r => ({ ...r, best: r.events.slice().sort((a, b) => b.s.total - a.s.total)[0] }))
    .sort((a, b) => b.best.s.total - a.best.s.total);

  /* Calendar gaps. Walk every month from the first to the last event. */
  const months = [];
  const ym = d => d.slice(0, 7);
  const all = scored.slice().sort((a, b) => a.c.start.localeCompare(b.c.start));
  if (!all.length) return { coverage, calendar: [] };
  let cur = new Date(all[0].c.start.slice(0, 7) + "-01");
  const last = new Date(all[all.length - 1].c.start.slice(0, 7) + "-01");
  while (cur <= last) {
    const key = cur.toISOString().slice(0, 7);
    months.push({ key,
      booked: all.some(x => attending.has(x.c.id) && ym(x.c.start) === key),
      bookable: all.filter(x => ym(x.c.start) === key && x.s.total >= minTier) });
    cur.setMonth(cur.getMonth() + 1);
  }
  const calendar = [];
  let run = [];
  const flush = () => {
    const withOptions = run.filter(m => m.bookable.length);
    if (run.length >= minMonths && withOptions.length)
      calendar.push({ from: run[0].key, to: run[run.length - 1].key, months: run.length,
        missed: withOptions.flatMap(m => m.bookable).sort((a, b) => b.s.total - a.s.total).slice(0, 3) });
    run = [];
  };
  months.forEach(m => { if (m.booked) flush(); else run.push(m); });
  flush();

  return { coverage, calendar };
}

function findConflicts(confs, weights, minTier = 65) {
  // Two B-tier-or-better events in different cities on the same days is a real
  // decision. Two D-tier events clashing is not news.
  const s = confs.map(c => ({ c, s: scoreConference(c, weights) }))
    .filter(x => x.s.total >= minTier)
    .sort((a, b) => a.c.start.localeCompare(b.c.start));
  const out = [];
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      if (s[j].c.start > s[i].c.end) break;
      if (s[i].c.city !== s[j].c.city) out.push([s[i], s[j]]);
    }
  return out;
}

function coverageByMonth(confs, attending) {
  const months = {};
  for (const c of confs) {
    const k = c.start.slice(0, 7);
    months[k] = months[k] || { key: k, all: [], booked: [] };
    months[k].all.push(c);
    if (attending.has(c.id)) months[k].booked.push(c);
  }
  return months;
}

/* ── IDENTITY RESOLUTION ───────────────────────────────────────────────────
   Rules generate CANDIDATES and a confidence score. Anything confident is
   merged automatically. Anything ambiguous goes to a review queue where the
   AI adjudicates, because "is this the same person or two people with the
   same name" is a judgement call, not a string comparison.             */

const NICKNAMES = {
  dan:"daniel", danny:"daniel", dave:"david", davey:"david", mike:"michael",
  mikey:"michael", bea:"beatrice", beatriz:"beatrice", kate:"katherine",
  katie:"katherine", tom:"thomas", tommy:"thomas", bob:"robert", rob:"robert",
  bill:"william", will:"william", jim:"james", jimmy:"james", steve:"stephen",
  chris:"christopher", nick:"nicholas", alex:"alexander", sasha:"alexander",
  matt:"matthew", ben:"benjamin", sam:"samuel", joe:"joseph", tony:"anthony",
  liz:"elizabeth", beth:"elizabeth", meg:"margaret", peggy:"margaret",
  yossi:"yosef", yusuf:"yosef", yousef:"yosef", youssef:"yosef",
  mohamed:"muhammad", mohammed:"muhammad", muhammed:"muhammad", ahmad:"ahmed",
};

const strip = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
function normName(s) {
  return strip(s).toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|prof)\.?\b/g, "")
    .replace(/[^a-z\s]/g, "")          // drops hyphens & apostrophes: Al-Rashid -> alrashid
    .replace(/\s+/g, " ").trim();
}
function nameTokens(s) {
  return normName(s).split(" ").filter(Boolean).map(t => NICKNAMES[t] || t);
}
function normCompany(s) {
  return strip(s || "").toLowerCase()
    .replace(/\b(inc|ltd|llc|plc|gmbh|bv|nv|sa|ag|co|corp|company|group|holdings|technologies|tech|payments|labs)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function jaro(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const d = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const ma = new Array(a.length).fill(false), mb = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - d); j < Math.min(b.length, i + d + 1); j++) {
      if (mb[j] || a[i] !== b[j]) continue;
      ma[i] = mb[j] = true; m++; break;
    }
  }
  if (!m) return 0;
  let k = 0, tr = 0;
  for (let i = 0; i < a.length; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) tr++;
    k++;
  }
  return (m / a.length + m / b.length + (m - tr / 2) / m) / 3;
}
function jaroWinkler(a, b) {
  const j = jaro(a, b);
  let p = 0; while (p < 4 && a[p] && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}

function nameSimilarity(n1, n2) {
  const t1 = nameTokens(n1), t2 = nameTokens(n2);
  if (!t1.length || !t2.length) return 0;
  const flat1 = t1.join(""), flat2 = t2.join("");
  const whole = jaroWinkler(flat1, flat2);
  // best-pair token matching, so word order and middle names don't break it
  let paired = 0;
  const used = new Set();
  for (const a of t1) {
    let best = 0, bi = -1;
    t2.forEach((b, i) => { if (used.has(i)) return; const s = jaroWinkler(a, b); if (s > best) { best = s; bi = i; } });
    if (bi >= 0) { used.add(bi); paired += best; }
  }
  paired /= Math.max(t1.length, t2.length);
  return Math.max(whole, paired);
}

function emailKey(e) { return (e || "").toLowerCase().trim(); }
function emailLocal(e) { return emailKey(e).split("@")[0].replace(/[^a-z]/g, ""); }
function emailDomain(e) { return emailKey(e).split("@")[1] || ""; }

/* Returns 0-100 confidence that two encounters are the same human. */
function matchConfidence(a, b) {
  const reasons = [];
  const ea = emailKey(a.email), eb = emailKey(b.email);
  if (ea && eb && ea === eb) return { score: 100, reasons: ["identical email address"] };

  const nsim = nameSimilarity(a.name, b.name);
  const sameCo = normCompany(a.company) && normCompany(a.company) === normCompany(b.company);
  const sameDomain = emailDomain(a.email) && emailDomain(a.email) === emailDomain(b.email);
  const localSim = (emailLocal(a.email) && emailLocal(b.email))
    ? jaroWinkler(emailLocal(a.email), emailLocal(b.email)) : 0;

  if (nsim < 0.82) return { score: Math.round(nsim * 40), reasons: ["names are not similar enough to consider"] };

  let score = 0;
  if (nsim >= 0.97) { score += 46; reasons.push("names match"); }
  else if (nsim >= 0.90) { score += 40; reasons.push("names match allowing for spelling variation"); }
  else { score += 32; reasons.push("names are similar but not identical"); }

  if (sameCo) { score += 30; reasons.push("same company"); }
  else { score += 4; reasons.push(`different company (${a.company} vs ${b.company}), job change or different person`); }

  if (sameDomain) { score += 14; reasons.push("same email domain"); }
  if (localSim > 0.8 && !sameDomain) { score += 6; reasons.push("email username is a close variant"); }
  if (!ea || !eb) { score -= 4; reasons.push("one record has no email"); }

  if (normName(a.title || "") === normName(b.title || "") && a.title) { score += 6; reasons.push("identical job title"); }

  return { score: clamp(score), reasons };
}

const AUTO_MERGE = 85;   // confident enough to merge without asking
const REVIEW_FLOOR = 50; // below this, treat as unrelated

/* Union-find over encounters, then anything ambiguous is surfaced for review. */
function resolveIdentities(encounters, decisions = {}) {
  const parent = {}, find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  encounters.forEach(e => parent[e.id] = e.id);
  const review = [];

  for (let i = 0; i < encounters.length; i++)
    for (let j = i + 1; j < encounters.length; j++) {
      const a = encounters[i], b = encounters[j];
      const { score, reasons } = matchConfidence(a, b);
      const key = [a.id, b.id].sort().join("|");
      const decided = decisions[key];                 // human or AI verdict, if any
      const merge = decided === "same" ? true : decided === "different" ? false : score >= AUTO_MERGE;
      if (merge) parent[find(a.id)] = find(b.id);
      else if (score >= REVIEW_FLOOR && !decided)
        review.push({ key, a, b, score, reasons });
    }

  const groups = {};
  encounters.forEach(e => { const r = find(e.id); (groups[r] = groups[r] || []).push(e); });
  const contacts = Object.values(groups).map(list => {
    list.sort((x, y) => x.at.localeCompare(y.at));
    const latest = list[list.length - 1];
    return {
      id: list[0].id,
      name: latest.name,
      aliases: [...new Set(list.map(e => e.name))],
      company: latest.company,
      companies: [...new Set(list.map(e => e.company))],
      title: latest.title,
      email: latest.email || list.map(e => e.email).filter(Boolean).pop() || "",
      // The segment lives on the lead row, so take the last one that had it.
      segment: list.map(e => e.segment).filter(Boolean).pop() || "",
      encounters: list,
      ...arcSignals(list),
    };
  });
  return { contacts: contacts.sort((a, b) => b.encounters.length - a.encounters.length), review };
}

/* ── RELATIONSHIP ARC (the deterministic half) ─────────────────────────────
   The rule layer decides WHAT PATTERN this is. The AI layer decides what the
   rep should DO about it. Keeping those separate is what stops the nudge
   from being generic.                                                   */
const INTENT_RANK = { cold: 1, warm: 2, hot: 3 };

function arcSignals(list) {
  const n = list.length;
  const ranks = list.map(e => INTENT_RANK[e.intent] || 1);
  const first = new Date(list[0].at), last = new Date(list[n - 1].at);
  const spanDays = Math.round((last - first) / 86400000);
  const delta = ranks[n - 1] - ranks[0];
  const advancedEver = ranks.some((r, i) => i > 0 && r > ranks[i - 1]);
  const daysSince = Math.round((Date.now() - last) / 86400000);
  const changedCompany = new Set(list.map(e => normCompany(e.company))).size > 1;
  const repsInvolved = [...new Set(list.map(e => e.rep))];

  let pattern, tone;
  if (n === 1) { pattern = "New"; tone = "neutral"; }
  else if (delta > 0) { pattern = "Warming"; tone = "good"; }
  else if (delta < 0) { pattern = "Cooling"; tone = "bad"; }
  else if (!advancedEver && n >= 3) { pattern = "Stalled"; tone = "bad"; }
  else { pattern = "Flat"; tone = "neutral"; }

  return {
    pattern, tone, spanDays, daysSince, changedCompany, repsInvolved,
    touches: n,
    velocity: n > 1 ? +(delta / (spanDays / 30 || 1)).toFixed(2) : 0,
    // The single number a rep should sort by: multiple touches only matter
    // if the temperature is actually moving.
    priority: Math.round(
      (INTENT_RANK[list[n - 1].intent] || 1) * 22 +
      Math.min(n, 4) * 10 +
      (delta > 0 ? 25 : delta < 0 ? -15 : (n >= 3 ? -18 : 0)) +
      (changedCompany ? 8 : 0) +
      (repsInvolved.length > 1 ? 5 : 0)
    ),
  };
}
