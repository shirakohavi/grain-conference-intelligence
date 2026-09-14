# Video walkthrough — running order

**Target: 7 minutes.** They asked for 5–10. Under 5 reads as thin; over 10 and they stop watching.
Record in one take if you can — a slightly rough single take reads as confident. Screen + voice,
no face needed.

Before you hit record: open the tool, go to **Settings**, paste your API key, press **Test the
key**. Then click through Signal Miner → Conferences once so the ★ signals are live. If the key
is in, the badges say `live` instead of `demo response` — worth it.

---

## 0:00 — Open with the problem, not the tool (25 sec)

> "Grain's sales team is deciding which conferences to attend using spreadsheets, Slack threads
> and individual notebooks. The decision is fragmented across four different moments in a rep's
> year, so I built one tool around those four moments: decide what's worth attending, plan who
> covers what, capture people on the floor, and recognise relationships that build across events.
> One principle runs through all of it, and I'll come back to it: **rules where the answer has to
> be reproducible, AI where the job actually needs judgement.**"

Don't tour the navigation. Go straight to a screen.

---

## 0:25 — Decide (90 sec) · *Conferences tab*

Point at the top of the list.

> "51 real events, scored for Grain's ICP and tiered. The interesting thing isn't the ranking —
> it's this."

Open **Seamless Middle East** (free, Dubai, tier A) and put it next to **Money20/20 USA** (€3,670).

> "A free Dubai expo out-ranks the industry flagship. That's not a bug, it's the cost model.
> A rep holds about twenty real conversations a day on a show floor — above that, extra
> attendees stop being reachable. So efficiency is cost per *reachable* ICP contact, capped at
> twenty a day, not cost per attendee. Money20/20 has 11,500 people but you can only meet the
> same number as anywhere else. Size stops being rewarded for its own sake."

Now grab the **weight sliders** and drag *Decision-maker seniority* up.

> "And the weighting is the sales lead's call, not the tool's. This re-ranks everything live —
> if they care more about seniority than cost, Sibos climbs and the cheap expos fall. I didn't
> want to hand them a number they couldn't argue with."

Open the drawer on any event, point at the five bars and the arithmetic line underneath.

> "Every score decomposes. Five inputs, the weights, the actual cost arithmetic. A sales lead can
> audit the whole thing — which is the point, because a score they can't reproduce is a score
> they won't trust."

Then point at the **AI read** panel.

> "The AI doesn't compute the score. It's given the five numbers and asked for the argument —
> who to hunt on that floor, and what the score structurally can't see. That split is deliberate."

---

## 2:00 — Plan (60 sec) · *Plan the year tab*

> "Same data, planner's view. Two things a list can't show you."

Point at the alerts.

> "First — Middle East and Asia-Pacific have A-tier events coming and nothing booked. Second —
> these clash. Seamless Saudi and Singapore FinTech Festival overlap in November and both are
> worth attending, so that's a real decision: two reps, or pick one."

Scroll to **Trips you could combine**.

> "And this is the one I'd defend hardest. Riyadh to Dubai — two A-tier events eight days apart
> in the same region. That's one flight from Tel Aviv instead of two. It's pure date and
> geography arithmetic, no AI anywhere near it, and it's the feature that saves actual money."

---

## 3:00 — Capture (60 sec) · *Field mode tab*

> "This is the screen I thought about hardest, because it's the one used standing up, on a phone,
> while someone is still talking to you."

Click **A hot lead** to fill the box. Read a few words of it out loud so they hear how messy it is.

> "One box. No form. You type what you'd say to a colleague and you keep talking."

Hit **Save lead**.

> "Then it structures. Name, company, title, the signals that say ICP fit — and this bit matters —
> **what to grab before they walk away**. Not a list of empty fields; the two things actually
> worth chasing. And the raw note saves locally first, so conference wifi doesn't have to work."

Now click **Someone we've met before** and save it.

> "And when the person is already in the book, it tells you at the moment of capture, not later."

---

## 4:00 — Recognise (150 sec) · *Contacts tab* — **spend the most time here**

They flagged cross-conference intelligence as a scoring criterion. This is the section that wins it.

> "Rules generate candidate matches and a confidence score. Above 85 they merge silently, below
> 50 they stay apart. In between goes here, to a review queue — and this is where the whole
> design argument lives."

Point at the **Danielle Roux** pair and the **David Cohen** pair.

> "These two score fifty and fifty-six. Almost identical. Same name, different company, in both
> cases. And the right answers are opposite: Danielle Roux changed jobs, she's one person.
> The two David Cohens are two different people who happen to share a common name.
> **No string comparison can separate those.**"

Click **Ask AI to decide** on each.

> "It reads what the reps actually wrote. For Danielle — Alon's note says she moved to Checkout
> in August and that she raised the Copenhagen conversation herself. For David — one's in fraud
> at Riskified in London, the other's in treasury at Payoneer in New York three days later, and
> the second rep literally wrote 'different david' in the note."
>
> "It's told to be conservative, because the errors aren't symmetrical. Merging two people
> corrupts the CRM and has a rep greet a stranger by the wrong history. Splitting one person is
> annoying and recoverable. And the human always has the override — those two buttons never go away."

Mention the other cases briefly:

> "The rules also handle nicknames — Bea to Beatrice — transliteration, where two reps spelled
> the same Arabic name differently, and the case where one rep only got a phone number."

Now open **Daniel Mercer**.

> "Three encounters over seven months. The *pattern* — warming — is arithmetic on the intent
> sequence; I didn't want a model deciding that. What the AI does is read three sets of scrappy
> field notes and say what actually moved: in February he told us FX was handled internally,
> by June he'd been promoted and owned FX himself. And then the nudge — specific, with the hook
> from the notes, and a date."

Then open **Marco Ferrari**.

> "And this is the one I'm proudest of. Three friendly conversations, two decks sent, no replies,
> and in July he mentioned they'd renewed with their incumbent in April. The verdict is
> **politely disengage**. The brief asked for the tool to tell a rep whether this is a warming
> relationship or a polite tire-kicker who's been listening for a year — a tool that only ever
> says 'follow up!' isn't answering that question. It has to be willing to say stop."

Scroll to **Push to HubSpot**, click it, let the payload show.

> "And it pushes to HubSpot with the arc attached — touch count, pattern, first and last event —
> so the intelligence survives outside this tool. A browser can't call HubSpot directly, no CORS,
> and a private-app token in client-side JavaScript is readable by anyone who opens the page. So
> it builds the exact payload and posts it to a relay you configure. With no relay set it shows
> you the payload rather than pretending to sync."

---

## 6:30 — The feature they didn't ask for (45 sec) · *Signal miner tab*

> "One thing that isn't in the brief. The brief says the team should be able to find conferences
> they don't already know about. The obvious answer is to search the web. But the team already
> knows — it's sitting in Slack threads and meeting summaries nobody re-reads."

Click **All four**, then **Find the conferences**.

> "Four real-shaped internal texts. It pulls out every event mentioned, who raised it, and the
> thing that actually matters — **whether a customer raised it or just us**. Airwallex is sending
> twelve people to Singapore FinTech Festival. Mirakl says the marketplace crowd goes to Shoptalk,
> not to fintech events, which might be why the marketplace pipeline is thin. Paymob asked why we
> skipped Seamless. That's the gap between what the team already knows and what the plan reflects."

Switch to **Conferences** and point at a ★.

> "And it loops back — anything it finds shows here, where the decision gets made, instead of
> scrolling away in a thread. Today it reads a paste box. The same function takes its input from
> a Slack MCP connector without changing — the parsing was the hard part."

---

## 7:15 — How I built it, and what's next (60 sec)

**Be specific and honest here — they're hiring for exactly this.** Say what actually happened,
in your own words. The shape that works:

> "I built this with Claude as a pair. Where it helped most: the boring correctness — the
> Jaro-Winkler matching, the union-find that groups encounters into people, getting 51 real
> conferences with real dates in. Where I had to push back: the first instinct was to wrap a model
> around everything, including the scoring. I didn't want that. A score a sales lead can't
> reproduce is a score they won't trust, so I pulled the arithmetic back into plain code and kept
> AI for the six jobs that genuinely need judgement. That's in one file with a comment on each one
> saying why a rule couldn't do it."
>
> "The other thing I'd call out: it works with no API key. Every AI feature falls back to a
> pre-written response of the same shape, badged 'demo'. I assumed whoever opened this link
> wouldn't have pasted a key, and a tool that dead-ends on a missing key doesn't get evaluated."

Then next steps — keep it to two, not five:

> "With another week: first, replace the Signal Miner's paste box with a real Slack connector —
> the parsing is done, the input is a swap, and it's the only feature that gets better the more
> the team uses Slack normally. Second, close the loop with HubSpot outcomes. ICP density is a
> human estimate today. Once leads carry deal outcomes, it becomes measured — cost per *closed*
> contact instead of per conversation — and the score stops being an opinion."

---

## Things not to do

- Don't apologise for scope or call it "just a prototype". You scoped deliberately; say so.
- Don't read the screen out loud. Say what it means.
- Don't demo Settings. Mention the key handling in the build section and move on.
- Don't claim the conference attendance figures are verified. They're real events with real
  dates; the ICP estimates are clearly labelled as human estimates, and that's the honest position.

## If they ask

**"How did you pick the weights?"** — Grain sells embedded FX to platforms, so ICP density gets
the most weight and partner presence matters separately from direct buyers. But the sliders exist
precisely because I shouldn't be the one deciding that — the sales lead should.

**"How would you validate the score?"** — Backtest it. Take last year's events, the leads captured
at each, and which closed. Cost per closed contact against the predicted tier. If A-tiers don't
outperform C-tiers the model is wrong, and I'd rather find that out than defend it.

**"Why not just use a CRM?"** — HubSpot stores contacts. It doesn't tell you that the same person
has been met three times under two spellings and is stalling. This is the layer that turns
encounters into a judgement, and it pushes the result *into* HubSpot rather than replacing it.

**"What's the weakest part?"** — The ICP density and seniority figures are my estimates, not
measured. That's why the tool shows its arithmetic — so a sales lead can disagree with an input
rather than with the whole score. And everything is in localStorage, which is right for this
build and wrong for a team.
