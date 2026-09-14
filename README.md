# Conference Intelligence — Grain Sales

A single tool for the four decisions a Grain rep makes about conferences across a year:
**which ones to attend, who covers what, capturing people on the floor, and recognising
relationships that build across events.**

**Live:** _paste your GitHub Pages URL here_
**Stack:** static HTML/CSS/JS. No framework, no build step, no server. Open `index.html` and it runs.

---

## The one design decision everything else follows from

> **Rules where the answer must be reproducible. AI where the job actually requires judgement.**

A conference score a sales lead cannot reproduce is a score they will not trust, and a model
asked to do arithmetic will quietly get it wrong. So:

| Computed in `engine.js` (plain arithmetic, auditable) | Sent to a model in `ai.js` (judgement / unstructured language) |
|---|---|
| ICP fit score and tier | The attend/skip *argument*, and what the score can't see |
| Cost per reachable ICP contact | — |
| Trip clustering (dates + geography + travel cost) | — |
| Date clashes and coverage gaps | — |
| Candidate contact matches + confidence 0–100 | Adjudicating the ambiguous ones (50–84) |
| Relationship *pattern* (warming / stalled / cooling) | What actually changed, and the specific next action |
| — | Pulling conference names out of Slack threads and meeting notes |
| — | Turning a rep's one-line show-floor note into structured fields |

Every AI call is in one file, and each one has a comment saying why a rule couldn't do it.

---

## The five screens

**Conferences** — 51 real fintech/payments/travel/commerce events scored 0–100 and tiered A–D.
Weights are sliders, because the weighting is the sales lead's call, not the tool's; everything
re-ranks live. Open a row for the five component scores, the cost arithmetic, and the AI read.

**Plan the year** — month-by-month coverage, regions where A-tier events are going uncovered,
date clashes between two events worth attending, and **trips that could be one trip** (same
region, within 10 days, both worth attending) with the travel saving.

**Field mode** — one big box. The rep types what they'd say to a colleague and keeps talking;
structuring happens after save, not while the person is standing there. It saves the raw note
locally first, so conference wifi doesn't have to work.

**Contacts** — encounters resolved into people, the review queue for ambiguous matches, and a
relationship read on anyone met more than once.

**Signal miner** — paste a Slack thread or meeting summary; it extracts every conference
mentioned, who raised it, and **whether it was a customer or just us**. Anything it finds shows
as a ★ on the Conferences tab, so the signal lands where the decision gets made.

---

## Scoring

Five inputs, each 0–100, weighted (defaults in brackets):

- **ICP density (30)** — share of the room that looks like a PSP, travel wholesaler, cross-border
  payment company, or a marketplace/platform carrying FX exposure
- **Decision-maker seniority (20)** — is the person who owns the FX decision personally there
- **Cross-border relevance (20)** — is the agenda about multi-currency flow, or domestic banking
- **Cost efficiency (20)** — see below
- **Embedded-partner presence (10)** — platforms who could *resell* Grain, not just buy it

**Cost efficiency is the part worth arguing about.** A rep holds roughly 20 real conversations a
day on a show floor. Above that, extra attendees stop being reachable. So efficiency is
`(ticket + travel from Tel Aviv) ÷ reachable ICP contacts`, where reachable is capped at
`20 × days`. This is why a free Dubai expo can out-rank a €3,670 flagship, and why the model
doesn't reward size for its own sake.

The raw weighted average of real conferences bunches between 15 and 75, which makes tiers
useless to look at, so it's stretched onto 0–100 between two stated anchors. **Ranking is
unaffected** — that's presentation, not weighting.

Tiers: **A** ≥80 book it · **B** ≥65 one rep, name three targets first · **C** ≥45 only if it
bolts onto a trip · **D** skip.

---

## Cross-conference contact tracking

Rules generate candidates and a 0–100 confidence. Above 85 they merge silently; below 50 they
stay apart; **50–84 goes to a review queue** where the model reads the reps' field notes and
decides.

Handled: nickname expansion (Bea → Beatrice, Dan → Daniel), transliteration differences
(Yusuf Al-Rashid / Yousef Alrashid), employer changes between events, one rep getting a phone
number instead of an email, and the same person logged by different reps.

The case that makes the split worth it is in the seed data. **Two pairs score almost the same
and get opposite answers:**

- *Danielle Roux* at Trustly vs at Checkout.com → **50** → same person, changed jobs
- *David Cohen* at Riskified vs at Payoneer → **56** → two different people

No string comparison can separate those. Both are settled by what the rep wrote down.
Merging two people wrongly corrupts a CRM and has a rep greet a stranger by the wrong history,
so the model is told to be conservative and the human always has the final override.

Once someone's been met more than once, the pattern (Warming / Stalled / Cooling / Flat) is
arithmetic on the intent sequence. The **interpretation and the nudge** are the AI's job —
and the tool is willing to say *politely disengage*, which is the answer a rep needs on a
friendly contact who renewed with an incumbent five months ago.

---

## Running it

Open `index.html`. That's it.

**Deploying:** drop the folder into a GitHub repo, Settings → Pages → deploy from `main`,
`/root`. A non-technical person updates the conference list by editing `data/conferences.js` in
the GitHub web editor — it's a commented list of plain objects — and the site rebuilds itself.

**AI keys** are configured in Settings and stored in `localStorage`. Nothing is hardcoded and
nothing is committed. Anthropic or OpenAI, model name editable.

**Demo mode:** with no key set, every AI feature returns a pre-written response *of the same
shape*, badged `demo response`. This was deliberate — whoever opens the live URL won't have
pasted a key, and a tool that dead-ends on a missing key doesn't get evaluated.

**HubSpot:** a browser can't call HubSpot directly (no CORS, and a private-app token in
client-side JS is readable by anyone who opens the page). The tool builds the exact payload —
contact properties plus every encounter as timeline notes — and POSTs it to a relay URL you
configure (a Make/Zapier webhook or a small serverless function). With no relay set it shows
the payload rather than pretending to sync.

---

## What I'd build next, in order

1. **Replace the Signal Miner's paste box with a Slack MCP connector and a meeting-notes API.**
   The parsing is the hard part and it's done; the input is a swap. This is the feature I'd
   prioritise because it's the only one that gets *better* the more the team uses Slack normally.
2. **Pre-conference target lists.** The tool knows who we've met and who's warming; before a
   trip it should say "these six people you already know will probably be at this event, here's
   the opener for each" instead of waiting for the rep to bump into them.
3. **Close the loop with outcomes.** Right now ICP density is a human estimate. Once leads carry
   HubSpot deal outcomes, the estimates become measured — cost per *closed* contact rather than
   per conversation — and the score stops being an opinion.
4. **Voice capture in field mode.** Typing on a show floor is still friction. The parser already
   handles messy language; the missing piece is the microphone.
5. **Multi-rep sync.** Everything is `localStorage` today, which is right for a scoped build and
   wrong for a team — the review queue in particular only pays off when three reps' notes land
   in the same place.

## Files

```
index.html          markup + script tags
styles.css
data/conferences.js 51 events, commented for non-technical editing
data/seed.js        22 seeded encounters + 4 sample Slack/meeting texts
engine.js           scoring, clustering, clash detection, identity resolution — no AI
ai.js               every model call, each with a comment on why a rule can't do it
demo.js             pre-written fallbacks so the tool works without a key
app.js              views and state
```
