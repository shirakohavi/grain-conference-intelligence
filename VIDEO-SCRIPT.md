# Video script

Target 8 minutes. The brief asks for five things and this covers them in
order: a live demo from a salesperson's point of view, the scoring logic and
why, cross-conference tracking including the edge cases, how AI was used to
build it, and what comes next.

Everything below is real. Every name, number and line of output is what the
tool actually shows, so nothing has to be staged.

---

## Before you hit record

1. Settings, check the AI route says **n8n**. If it says demo, the model is
   not being called and half the video is a lie.
2. Conferences, clear every filter. Upcoming, all regions, all tiers.
3. Have `join.html` open in a second tab, already through setup, sitting on
   the empty capture form.
4. Have the HubSpot contacts list open in a third tab.
5. Screen at 1440 wide or narrower so the tables are readable on playback.

---

## 0:00  What this is (30 sec)

> "Grain sells cross-currency FX hedging to PSPs, marketplaces, travel
> platforms and treasury teams. Conferences are where that pipeline starts,
> and right now the decisions around them live in a spreadsheet, a Slack
> thread and somebody's notebook.
>
> This is one tool for the four decisions a rep actually makes: which
> conferences are worth going to, who covers what, capturing people on the
> floor, and noticing when a relationship is going somewhere."

Show the sidebar. Three working screens and a settings page.

---

## 0:30  The demo, as a salesperson (2 min)

### Conferences

> "Eighty-seven events. Sorted by fit, not by date, because the question is
> what to attend, not what is next."

Point at the top row.

> "Juniper Travel Technology Summit. Five hundred people in Palma, a five
> hundred euro ticket, and it scores ninety-six. Money20/20 USA has eleven
> thousand people, a three and a half thousand euro ticket, and it scores
> eighty-three.
>
> The tool prefers the small one. Open it and it says why."

Open the drawer. Point at the cost line.

> "Twenty-eight euros per qualified conversation against seventy-four. A
> travel payments event where most of the room is a buyer beats a giant
> fintech show where most of the room is not."

### Plan the year

> "Same data, asked a different question. Where are we under-invested, which
> events cluster into one trip, and who is covering what."

Point at a cluster and at a rep with no events.

### Field mode

Switch to the second tab.

> "This is a different page. A rep opens it on a tablet at a stand, hands it
> to the person in front of them, and it never shows the pipeline to a
> prospect."

Type an email, a name, a company, press Continue.

> "It writes the contact and the meeting before anyone types a note, because
> the risk at a booth is a half-filled form, not a missing note."

Tap a segment, type a note, pick Hot.

> "Segment first, one tap, because it decides most of the ICP fit. The note
> saves as you type. There is no save button."

Switch back to the main app, Contacts.

> "And there they are, with the meeting, the rep who logged it, and the
> event. That also went to HubSpot."

Switch to the HubSpot tab and show the contact.

---

## 2:30  Scoring, and why this way (1 min 30)

Back to Conferences. Open the weights panel.

> "Four inputs, weighted. ICP fit at forty, because a room of the wrong
> people cannot be rescued by anything else. Seniority at twenty, whether
> the room can sign. Cost per conversation at twenty. Strategic reach at
> twenty, the regions and partners Grain actually wants.
>
> Three of those are a human's judgement, entered once per event. The
> fourth, cost per conversation, is arithmetic: ticket plus travel from Tel
> Aviv, divided by how many ICP conversations two people can physically have
> in the days available."

Drag the ICP fit slider. Let the table re-rank live.

> "Weights are editable because a sales lead will disagree with mine, and
> they should be able to argue with the tool instead of ignoring it.
>
> No model touches this number. A score a sales lead cannot reproduce is a
> score they will not trust, and a model asked to do arithmetic will quietly
> get it wrong."

Open a drawer, click the AI read.

> "What the model does do is argue with the result. Same four numbers, and
> it is asked what the score structurally cannot see. That is judgement, not
> arithmetic, which is the line I drew through the whole tool."

---

## 4:00  Cross-conference tracking (2 min)

Contacts.

> "Twenty-six people, and not one row here was typed as a contact. Every one
> is assembled from meetings, because a meeting is what actually happened
> and a contact record is an opinion about it."

### The case for going back

Open Daniel Mercer.

> "Daniel Mercer, Head of FX Partnerships at Nuvei. Met three times across
> ten months. Dubai in February, London in June, Visa Payments Forum last
> week. Cold, then warm, then hot.
>
> Lead status says Active, and underneath it says why: named a budget or a
> date at the most recent meeting. That is the case for booking a call this
> week, and no single rep had it. Idan met him once, Noa met him twice."

### The tire-kicker

Open Marco Ferrari.

> "Marco Ferrari, Head of Treasury at Satispay. Also three meetings. Also a
> good-looking title at a good-looking company.
>
> Dormant. Met three times and never once named a budget or a date. Three
> polite conversations is not a warming relationship, and the brief asked
> for exactly this distinction. Marco and Daniel look identical on a
> spreadsheet."

### The edge cases

> "Four of them, and they are where this got interesting."

Open Beatrice Lindqvist.

> "Name variants. She was logged as Bea at one event and Beatrice at the
> next. Jaro-Winkler plus a nickname map, and above eighty-five they merge
> without asking."

Show the review queue.

> "Between fifty and eighty-five, a human decides. Yusuf Al-Rashid and
> Yousef Alrashid at Tap Payments score seventy-eight. Same person, almost
> certainly, but one record has no email, so the tool asks instead of
> guessing."

Point at the David Cohen pair.

> "The other one is the opposite problem. David Cohen at Riskified and David
> Cohen at Payoneer. Fifty-six. Same name, different employer. That is
> either a job change, which is the single most useful thing a sales team
> can learn at a conference, or two different people. The tool will not
> decide that, and it does not average it away."

Show the nudge on Beatrice.

> "And the nudge. Silent for ninety-one days against their usual gap of
> twenty-seven. Not a fixed timer, their own rhythm, because a quarterly
> contact going quiet for a month means nothing and a monthly one going
> quiet for three is the whole signal."

Open carly.

> "Last one. The rule says New, a rep has overridden it to Dormant, and the
> tool shows both. The rule and the human are allowed to visibly disagree."

---

## 6:00  Where AI is, and why there (1 min 15)

> "Four AI features. The rule I used everywhere: rules where the answer must
> be reproducible, AI where the job genuinely needs judgement."

1. **Conference discovery.** Conferences, Find conferences with AI.

> "Runs weekly, and on demand. Claude with web search on, told what Grain's
> buyers look like and told that a blank field is a correct answer. It
> brings back events nobody on the team had heard of, tagged AI sourced,
> with the page it read. No tier, because it does not get to score them. A
> person fills in the estimates. Finding an event is recall. Deciding
> whether it is worth a flight is judgement about this pipeline."

2. **The relationship arc.** Open a contact, Draft the follow-up.

> "Fires after every meeting, including the first. It reads the note history
> and writes the follow-up the rep would write, signed by the rep who logged
> the meeting, with their calendar link. It goes to HubSpot as a draft.
> Never sent. Sending stays with a person."

3. **The score interpreter.** Already shown.

4. **Identity adjudication.** In the review queue.

> "When two records are ambiguous, the model gets the same evidence the rep
> would and says which way it leans. It advises. It does not merge."

> "The key never touches the browser. Every call goes through n8n, so
> whoever opens this link gets real answers without pasting anything, and
> the webhook only accepts three named tasks so the URL is not a free LLM
> proxy for anyone who finds it."

---

## 7:15  How I built it (45 sec)

> "I built this with Claude, and the honest version is that it was fastest
> at things I could check and slowest at things I could not.
>
> Where it helped: the identity matching, the arithmetic, the n8n flows,
> and rewriting the same table three times when I changed my mind about the
> columns.
>
> Where it got in the way: it happily builds features nobody asked for. At
> one point I had six AI features and three of them were unreachable from
> the interface. I deleted them. The version you are looking at has fewer
> features than the one I had on day one, and it is better.
>
> The other thing it cost me was trusting output I had not verified. The
> HubSpot push looked correct and silently failed for a day, because the
> code posted to an endpoint that only accepts PATCH and the error was
> swallowed three nodes downstream. Reading the actual response is what
> found it, not reading the code."

---

## 8:00  Another week (30 sec)

> "Two things, not five.
>
> First, the nudge is still reactive. It tells you someone went quiet after
> they have gone quiet. With a week I would make it forward-looking: this
> person is at an event you are already attending in six weeks, here are the
> three things they said last time, book them now.
>
> Second, coverage assumes a rep is interchangeable. They are not. Idan has
> met every travel contact in here. The tool should know that and route by
> relationship, not by who has a free slot."

> "That is the tool. The live link and the repo are in the email."

---

## Cut these if you run long

- The Plan the year screen. It is the least surprising part.
- The score interpreter. The arc is the better AI demo.
- The n8n canvas. Say the sentence, do not show the flow.
