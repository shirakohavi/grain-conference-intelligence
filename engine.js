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
/* Conference size, in bands a rep can act on rather than raw numbers.
   The cuts are not round for their own sake: each one changes what the rep
   has to do to work the room, which is why they are worth filtering on. */
const SIZE_BANDS = [
  { key: "xs", label: "Under 1,000", max: 1000,   means: "You can meet everyone worth meeting" },
  { key: "s",  label: "1k-3k",       max: 3000,   means: "One rep can work the whole floor" },
  { key: "m",  label: "3k-10k",      max: 10000,  means: "Needs a plan before you land" },
  { key: "l",  label: "10k-25k",     max: 25000,  means: "Needs a booth" },
  { key: "xl", label: "25k+",        max: Infinity, means: "Needs a team" },
];
const sizeBand = n => (n == null || n === "") ? null
  : SIZE_BANDS.find(b => n < b.max) || SIZE_BANDS[SIZE_BANDS.length - 1];

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
    short: "How much of the room is a buyer",
    long: "Share of attendees that move money across currencies: marketplaces, PSPs, travel and e-commerce platforms, BNPL, stablecoin, payroll. The industry label on the event does not matter. A travel-tech summit can outrank a payments expo.",
    source: "Estimate. Exhibitor list and audience breakdown.",
  },
  seniority: {
    label: "Seniority",
    short: "Whether they can sign",
    long: "Does the company send the person who owns the FX line, or someone who reports to them. A small senior room beats a large junior one.",
    source: "Estimate. Organisers publish it to sell sponsorships.",
  },
  efficiency: {
    label: "Cost per conversation",
    short: "What one useful conversation costs",
    long: "Ticket plus flight and hotel from Tel Aviv, divided by the buyers one rep can reach. Capped at 20 a day, so size alone does not win.",
    source: "Calculated from ticket, travel and audience.",
  },
  strategic: {
    label: "Strategic reach",
    short: "Regions and partners we want",
    long: "Does this open a region Grain is pushing into this year, and are the platforms who could embed us in the room. A weak event in a corridor we want can beat a strong one where we are already known.",
    source: "Estimate. Region priority is a company decision.",
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
/* ── WHO COVERS WHAT ───────────────────────────────────────────────────────
   "Plan team coverage across the year" is only half answered by a calendar
   of events. The other half is a calendar of people. Three facts a sales
   lead actually needs, and all three are counting, not judgement:
     · which events worth attending have nobody on them
     · who is carrying more than their share
     · who has a long stretch with nothing booked
   `minTier` is the same 65 the gap finder uses, so "worth attending" means
   one thing across the whole app.                                        */
function coverageByPerson(confs, team, weights, { minTier = 65, quietDays = 120 } = {}) {
  const worth = confs
    .map(c => ({ c, s: scoreConference(c, weights) }))
    .filter(({ c, s }) => c.status === "Going" || (!s.unscored && s.total >= minTier))
    .sort((a, b) => a.c.start.localeCompare(b.c.start));

  const unassigned = worth.filter(({ c }) => !(c.covering || []).length);

  const rows = team.map(t => {
    const mine = worth.filter(({ c }) => (c.covering || []).includes(t.id));
    // The longest run with nothing booked, measured from today so a rep with
    // everything in December still reads as quiet now.
    // Only forward. A gap that already happened is history, not a plan.
    const marks = [Date.now(), ...mine.map(({ c }) => new Date(c.start).getTime())
      .filter(t => t >= Date.now())].sort((a, b) => a - b);
    let widest = 0, at = null;
    for (let i = 1; i < marks.length; i++) {
      const g = Math.round((marks[i] - marks[i - 1]) / 86400000);
      if (g > widest) { widest = g; at = marks[i - 1]; }
    }
    if (mine.length === 0) widest = quietDays + 1;
    return { rep: t, events: mine, count: mine.length,
             quietDays: widest, quiet: widest > quietDays,
             quietFrom: at ? new Date(at).toISOString().slice(0, 10) : null };
  });

  const counts = rows.map(r => r.count);
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  /* Overloaded is relative to the team, not an invented ceiling: half again
     the average AND at least three events, so a four-person team with one
     event each never lights up. A rep with a long clear stretch is not
     overloaded whatever the count says, so the two flags never contradict
     each other on the same row. */
  rows.forEach(r => { r.overloaded = r.count >= 3 && r.count > avg * 1.5 && !r.quiet; });

  return { rows, unassigned, worthCount: worth.length, avg: +avg.toFixed(1) };
}

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
    // A rep types "monday", the tablet gets "monday.com", the CRM has
    // "Monday.com Ltd". Strip the domain tail before anything else or the
    // same employer reads as three and a job change gets invented.
    .replace(/\.(com|co\.[a-z]{2}|co|io|ai|net|org|app|dev|xyz|[a-z]{2})(?=\s|$)/g, " ")
    // "N.V." and "S.p.A." become nv and spa so the suffix list below can see
    // them as words rather than leaving them welded to the name.
    .replace(/\./g, "")
    .replace(/\b(inc|ltd|limited|llc|lp|plc|gmbh|bv|nv|ab|oy|as|sa|spa|ag|kk|pte|pty|co|corp|corporation|company|group|holding|holdings|technologies|technology|tech|payments|solutions|labs)\b/g, " ")
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
  const everHot = ranks.some(r => r === 3);
  const daysSince = Math.round((Date.now() - last) / 86400000);
  const changedCompany = new Set(list.map(e => normCompany(e.company))).size > 1;
  const repsInvolved = [...new Set(list.map(e => e.rep))];

  /* Their own rhythm, not a fixed 90 days. A contact seen at every event is
     late after two months; a contact seen once a year is not. The gap that
     matters is the average gap THEY have kept, doubled. */
  const usualGapDays = n > 1 ? Math.round(spanDays / (n - 1)) : null;
  const overdue = usualGapDays != null && daysSince > usualGapDays * 2;

  /* Four states, each one rule, first match wins, all of them checkable by
     hand. The rule layer decides which one. A model never does, which is what
     keeps the label on screen reproducible. A rep can override it, and the
     override is stored separately so the two can visibly disagree.

       New        first interaction
       Active     clear commercial intent at the most recent meeting
       Developing repeat interactions with movement
       Dormant    previous engagement, no momentum now

     Dormant carries the case the brief actually asks about. "No momentum"
     means nothing MOVING, not nothing recent: someone who has come to four
     conferences, been polite every time and never once named a budget or a
     date has no momentum even if the last meeting was Tuesday. */
  let verdict, tone, test;
  if (n === 1) {
    verdict = "New"; tone = "neutral";
    test = `First interaction, at ${list[0].confName || "their first event"}.`;
  } else if (overdue) {
    verdict = "Dormant"; tone = "bad";
    test = `Silent for ${daysSince} days against their usual gap of ${usualGapDays}.`;
  } else if (n >= 3 && !everHot) {
    verdict = "Dormant"; tone = "bad";
    test = `Met ${n} times and never once named a budget or a date.`;
  } else if (ranks[n - 1] === 3) {
    verdict = "Active"; tone = "good";
    test = "Named a budget or a date at the most recent meeting.";
  } else if (delta > 0) {
    verdict = "Developing"; tone = "good";
    test = `Went ${list[0].intent} to ${list[n - 1].intent} across ${n} meetings.`;
  } else if (everHot) {
    verdict = "Developing"; tone = "neutral";
    test = "Was active at some point and is still in conversation, but has cooled.";
  } else {
    verdict = "Developing"; tone = "neutral";
    test = `${n} meetings, still talking, nothing named yet.`;
  }

  /* When to interrupt the rep. The brief's warning is that a nudge which is
     always there is noise and one that is never there is invisible, so it is
     neither: a nudge appears only when something happened. A Developing
     contact inside their normal rhythm gets the facts and silence, which is
     most of the list. */
  let nudgeReason = "";
  if (changedCompany) nudgeReason = "Changed employer since you met";
  else if (overdue) nudgeReason = `Overdue by their own rhythm, ${daysSince} days against ${usualGapDays}`;
  else if (verdict === "Dormant") nudgeReason = `${n} meetings, nothing named yet`;
  else if (everHot && ranks[n - 1] < 3) nudgeReason = "Was active, is not now";

  return {
    verdict, tone, test, spanDays, daysSince, changedCompany, repsInvolved,
    usualGapDays, overdue, everHot,
    needsNudge: !!nudgeReason, nudgeReason,
    // Kept under its old name so nothing downstream had to change at once.
    pattern: verdict,
    touches: n,
    velocity: n > 1 ? +(delta / (spanDays / 30 || 1)).toFixed(2) : 0,
  };
}

/* ── ICP FIT: IS THIS A PROSPECT WORTH THE EFFORT ──────────────────────────
   Deliberately a different question from the relationship below, and kept
   apart from it on purpose:

     ICP fit      is this a valuable Grain prospect        (who they are)
     Relationship how is our relationship progressing      (what it is doing)

   Merging them is the trap. A perfect-fit senior buyer who has attended four
   events and never named a budget would score high on a combined number and
   hide behind it. Separated, that person reads "High ICP fit, Dormant",
   which is the honest and useful sentence: worth chasing, not progressing.

   Company fit 70, role fit 30, banded 80+ High, 50-79 Medium, under 50 Low.
   One label shows. The arithmetic is available but is not a second badge. */

/* Grain's own list of who they sell to, taken from their LinkedIn rather
   than invented. Treasury and PSP sit top because both are the person who
   actually carries the FX risk. */
const SEGMENT_FIT = {
  "PSP": 100, "Treasury": 100, "Marketplace": 90, "Travel": 90,
  "BNPL": 80, "Payroll": 70, "Stablecoin": 55, "Other": 20,
};

/* Titles are free text written by a rep on a show floor, so this matches the
   words that actually appear rather than pretending there is a taxonomy. */
const ROLE_BANDS = [
  [/\b(founder|co-?founder|ceo|cfo|coo|cto|chief|owner|president|managing director)\b/i, 100],
  [/\b(vp|vice.president|svp|evp)\b/i, 90],
  [/\b(head of|director|gm|general manager)\b/i, 78],
  [/\b(lead|principal|senior manager)\b/i, 55],
  [/\b(manager|pm|product manager|owner)\b/i, 45],
  [/\b(analyst|associate|specialist|coordinator|intern)\b/i, 25],
];
const roleFit = title => {
  const t = String(title || "");
  if (!t.trim()) return 35;                 // no title is unknown, not junior
  for (const [re, pts] of ROLE_BANDS) if (re.test(t)) return pts;
  return 45;
};

const ICP_BANDS = [
  { min: 80, band: "High" },
  { min: 50, band: "Medium" },
  { min: 0,  band: "Low" },
];

/* ── ACCOUNTS: THE COMPANY BEHIND THE CONTACTS ─────────────────────────────
   Reps sell to companies, not to individuals, and until now the tool had no
   idea that four rows were one account. Grouping is cheap because
   normCompany already folds monday, monday.com and Monday.com Ltd together.

   This deliberately computes no verdict about the account. An earlier build
   flagged single-threaded, no-treasury-contact and uncoordinated accounts in
   prose on the card; it was cut because the card's job is to show who else is
   here and get you to them in one click, and three paragraphs of judgement on
   top of a screen that already carries a lead status is the clutter this tool
   keeps trying to grow.

   A single-contact company gets nothing. "One person, nothing else to tell
   you" is noise on most rows.                                           */
function accountFor(contact, allContacts) {
  const key = normCompany(contact.company);
  if (!key) return null;
  const people = allContacts.filter(c => normCompany(c.company) === key);
  if (people.length < 2) return null;
  return {
    key, name: contact.company,
    segment: people.map(c => c.segment).find(Boolean) || contact.segment,
    people,
    events: [...new Set(people.flatMap(c => c.encounters.map(e => e.confId)))],
    reps: [...new Set(people.flatMap(c => c.encounters.map(e => e.rep)).filter(Boolean))],
    others: people.filter(c => c.id !== contact.id),
  };
}

/* The same grouping, for the whole table. Biggest accounts first, because
   that is where the cross-conference story actually is. */
function groupByCompany(rows) {
  const by = {};
  rows.forEach(r => {
    const k = normCompany(r.company) || "~none";
    (by[k] = by[k] || { key: k, name: r.company || "No company", rows: [] }).rows.push(r);
  });
  const REL_RANK = { Active: 4, Developing: 3, New: 2, Dormant: 1 };
  return Object.values(by).map(g => {
    const best = g.rows.reduce((a, b) =>
      (REL_RANK[b.relationship] || 0) > (REL_RANK[a.relationship] || 0) ? b : a, g.rows[0]);
    return {
      ...g,
      best: best.relationship,
      icp: g.rows.map(r => r.icp).sort((a, b) => b.score - a.score)[0],
      met: g.rows.reduce((n, r) => n + r.met, 0),
      events: [...new Set(g.rows.flatMap(r => r.confs.map(c => c.id)))].length,
      repIds: [...new Set(g.rows.flatMap(r => r.repIds))],
      last: g.rows.map(r => r.last).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at))[0] || null,
    };
  }).sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
}

function icpFit({ segment, title, company } = {}) {
  const co = SEGMENT_FIT[segment];
  const companyFit = co == null ? 45 : co;   // unclassified is a middling guess
  const rf = roleFit(title);
  const score = Math.round(companyFit * 0.7 + rf * 0.3);
  const band = (ICP_BANDS.find(b => score >= b.min) || ICP_BANDS[2]).band;
  return {
    score, band, companyFit, roleFit: rf,
    why: `${segment || "Segment not set"} ${companyFit} at 70 percent, `
       + `${title || "no title"} ${rf} at 30 percent.`,
    unclassified: co == null,
  };
}
