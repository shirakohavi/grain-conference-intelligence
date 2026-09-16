# Conference Intelligence, Grain sales

One tool for the four decisions a Grain rep makes about conferences across a
year: **which ones to attend, who covers what, capturing people on the floor,
and working out which of those people is worth another flight.**

**Live:** https://shirakohavi.github.io/grain-conference-intelligence/
**Stack:** static HTML, CSS and JavaScript. No framework, no build step.
Postgres behind it (Supabase) so the team shares one set of records, and n8n
for the work that cannot happen in a browser.

---

## The decision everything else follows from

> Rules where the answer has to be reproducible. AI where the job needs
> judgement.

A score a sales lead cannot reproduce is a score they will not trust, and a
model asked to do arithmetic gets it quietly wrong. So the split is explicit:

| Arithmetic, in `engine.js` | Judgement, in `ai.js` and `flows/` |
|---|---|
| Conference score and A to D tier | The attend or skip argument, and what the score structurally cannot see |
| Cost per reachable ICP contact | |
| ICP fit for a person, High / Medium / Low | |
| Trip clusters, date clashes, coverage gaps | |
| Candidate identity matches and a 0 to 100 confidence | Adjudicating the ambiguous ones, 50 to 84 |
| Lead status: New, Developing, Active, Dormant | The follow-up email, and what to do next |
| | Finding conferences nobody on the team has heard of |

Every model call is in one place, and each one carries a comment saying why a
rule could not do it.

---

## The screens

**Conferences.** 36 events, scored and tiered, sorted by fit rather than by
date. Filter by region, vertical, size, status, origin, or who is covering it.
Status and coverage are set in the row. The scoring weights are sliders and
everything re-ranks live, because the weighting is the sales lead's call.

**Plan the year.** Month by month coverage, regions going uncovered, date
clashes between two events worth attending, and events close enough in time and
geography to be one trip.

**Contacts.** People, assembled from meetings rather than typed in. Lead
status, ICP fit, how many times met, where, and which reps spoke to them. A
review queue holds the identity matches a human should settle.

**Field mode** (`join.html`). A separate page for a tablet at a stand. Work
email, name, company, role, then the note and the signal. The record is written
before the note is typed, because what gets lost at a booth is the half-finished
form. It never shows a prospect the pipeline.

**Settings.** The n8n base URL, the HubSpot relay, and an optional model key.
Nothing is hardcoded.

---

## Scoring a conference

Four inputs, each 0 to 100, weighted. Defaults in brackets, all editable.

- **ICP fit (40)** how much of the room is a PSP, a marketplace, a travel
  platform, or a treasury team carrying FX exposure
- **Seniority (20)** whether the people who own the FX decision are personally
  there
- **Cost per conversation (20)** see below
- **Strategic reach (20)** the regions and partner types Grain wants next

Three of those are a person's estimate, entered once per event. The fourth is
arithmetic: `(ticket + travel from Tel Aviv) ÷ reachable ICP contacts`, where
reachable is capped by how many conversations two people can physically have in
the days they are there. That cap is why a 500-person travel payments summit in
Palma at €28 per qualified conversation outranks Money20/20 USA at €74, and why
size on its own earns nothing.

Tiers: **A** 80+, book it. **B** 65+, one rep, name three targets first.
**C** 45+, only if it bolts onto a trip. **D**, skip.

An event nobody has scored reads **not scored**, not "low". A missing answer is
not a bad one.

---

## Scoring a person

ICP fit is company fit at 70 percent plus role fit at 30, banded High (80+),
Medium (50 to 79) and Low. Company fit comes from the ICP segment on the
contact. Role fit comes from the job title, on a seniority ladder from founder
and C-level down to analyst.

A segment describes the employer rather than the person, so a contact with no
segment borrows one from a colleague at the same company, matched on a
normalised company name so monday, monday.com and Monday.com Ltd count as one
employer. A borrowed band is drawn differently and says where it came from.

---

## Cross-conference contact tracking

Rules generate candidates and a confidence. Above 85 they merge silently, below
50 they stay apart, and **50 to 84 goes to a review queue** where a person
decides and the model advises.

Matching uses Jaro-Winkler on the name, a nickname map, email local-part and
domain comparison, and company and title agreement, resolved with union-find so
three records of one person collapse into one contact.

Handled deliberately:

- **Name variants.** Bea and Beatrice at two different events, merged.
- **Transliteration.** Yusuf Al-Rashid and Yousef Alrashid at Tap Payments,
  score 78, sent to review because one record has no email.
- **Job changes.** David Cohen at Riskified and David Cohen at Payoneer, score
  56. Either a job change, which is the most useful thing a rep can learn at a
  conference, or two people. The tool refuses to decide and refuses to average.
- **Missing fields.** A rep who got a name and a company but no email.
- **Different reps, same person**, logged in different words.

Merging two people wrongly corrupts a CRM and makes a rep greet a stranger with
the wrong history, so the threshold is conservative and a person always has the
override.

**Lead status** is the relationship, worked out from the meeting history: New on
a first interaction, Developing while it moves, Active once a budget or a date is
named, Dormant when there is no momentum. Three polite meetings with nothing
named reads Dormant, which is the tire-kicker the brief asks about. A rep can
override any of it, and the tool then shows the rule and the override side by
side rather than silently replacing one with the other.

**The nudge** measures each person against their own rhythm rather than a fixed
timer. Ninety-one days quiet against a usual gap of twenty-seven is a signal. The
same ninety-one days on a contact seen twice a year is not.

---

## The AI features

1. **Conference discovery.** A weekly n8n flow, also on a button. Claude with
   web search, told what Grain's buyers look like and told that a blank field is
   a correct answer. New events arrive tagged `AI sourced` with the page the
   search cited, carrying whatever it found and blanks where it found nothing.
   They carry no tier: the flow is allowed to add rows and not to rank them.
2. **The relationship arc.** Runs after every meeting including the first. Reads
   the note history, writes the follow-up the rep would write, signs it from
   whoever logged the meeting, adds their calendar link. Lands in HubSpot as a
   draft. Never sent.
3. **The score interpreter.** Given the same four numbers the arithmetic used,
   it argues with the result and says what the score cannot see.
4. **Identity adjudication.** On an ambiguous pair it gets the evidence a rep
   would and says which way it leans. It advises. It does not merge.

Calls go through n8n rather than from the browser, so the key stays in a
credential store and whoever opens the live URL gets live answers without
pasting anything. The webhook accepts three named tasks and nothing else, so the
URL is not an open model proxy. With no n8n URL set, every feature returns a
written fallback of the same shape, badged as such, so nothing dead-ends.

---

## HubSpot

A browser cannot call HubSpot directly, and a private app token in client-side
JavaScript is readable by anyone who opens the page. So the app posts to a relay
you configure and n8n does the write, from both the desktop app and field mode.

One contact per person, matched on work email, so someone met at four
conferences is one record with four notes rather than four records. Each push
carries the Grain properties (lead status, ICP fit, segment, conference touches,
first and last met), every meeting note as a timeline note, and the follow-up as
a draft email.

Two custom contact properties are needed in the portal: `grain_lead_status` and
`grain_icp_fit`.

---

## Running it

Open `index.html`. That is the whole build step.

Hosting is GitHub Pages from `main`, root folder. `DEPLOY.md` has the steps.

Configuration lives in Settings and in this browser only. Nothing is hardcoded
and nothing is committed. The Supabase key in `config.js` is the publishable
one, which is public by design and gated by row-level security; the
`service_role` key is not in this repo and never has been.

Updating the conference list needs no developer: Add conference on the
Conferences page, or Edit on any row.

---

## What I would build next

Close the loop after the event, across email and LinkedIn, pointed at the next
conference instead of the last one. Before an event, take everyone already met
and work out who is going, which people often state on LinkedIn. If they are,
draft the "we are both at Money20/20 in three weeks, here is what you said last
time, here is twenty minutes in my calendar". If that person is not going but a
colleague is, surface them instead. That is a warm introduction the team has
already earned and currently throws away every year.

---

## Files

```
index.html     the app shell and script tags
join.html      field mode, a separate page on purpose
engine.js      scoring, clustering, clashes, identity resolution. No AI
ai.js          every model call, each with a comment on why a rule cannot do it
demo.js        written fallbacks so the tool works without a key
app.js         views and state
join.js        field mode
db.js          Postgres reads and writes
config.js      project URL and the publishable key
styles.css     structure
theme.css      visual layer, loaded last
flows/         the three n8n workflows, as JSON, with a README
```
