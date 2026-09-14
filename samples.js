/* Sample internal text for the Signal Miner demo — the kind of raw Slack
   thread and meeting summary that conference decisions actually get made in.
   Kept in the repo rather than the database: it is demo fixture, not data. */

const SAMPLE_SIGNALS = [
  { source:"Slack · #sales-emea", date:"2026-08-28", text:
`Maya  09:12
ok so on the Airwallex call Priya mentioned they're doing a big push at Singapore FinTech Festival in november, like 12 people going

Tom  09:14
huh. we've never done SFF. isn't it enormous

Maya  09:15
62k apparently. she said the cross-border track is the whole point of the event now

Tom  09:18
worth a look. separately — two different prospects this month have asked if we'll be at Merchant Payments Ecosystem in berlin. never heard of it before this week

Alon  09:31
MPE is small but it's literally all acquirers and PSPs, a friend at Payabl swears by it. like 1800 people but the right 1800

Maya  09:33
adding both to the list for the planning convo`},

  { source:"Meeting summary · Nuvei intro call", date:"2026-09-12", text:
`Attendees: Daniel Mercer (Nuvei), Tom (Grain)
Summary: Daniel walked through Nuvei's travel vertical exposure. Confirmed Q1 budget cycle opens November.
Action items: send THB/MXN coverage detail; Tom to intro treasury contact.
Other notes: Daniel said he'll be at Money20/20 USA in Las Vegas in October and suggested meeting there rather than a call — "everyone on my side will be in the building anyway." He also mentioned Nuvei is sponsoring TRANSACT next April.`},

  { source:"Slack · #partnerships", date:"2026-09-03", text:
`Alon  16:40
Sophie at Mirakl says the marketplace crowd all goes to Shoptalk Europe in barcelona, not to the fintech events. that might explain why our marketplace pipeline is thin

Maya  16:44
that's actually a really good point, we index entirely on payments events

Alon  16:45
she also said VTEX Day in sao paulo is where LATAM marketplaces are. 20k people. we have zero LATAM presence

Tom  17:02
noting that we skipped Seamless Middle East this year and Ahmed from Paymob asked why. free entry too`},

  { source:"Meeting summary · Weekly pipeline review", date:"2026-09-08", text:
`Discussion covered Q4 pipeline coverage. Concern raised that APAC is under-covered — no events booked after October.
Alon noted Money20/20 Asia in Bangkok lands in late April and the travel-platform density there is high, which maps to one of our four target verticals.
Maya raised that Sibos is in Miami this year and the treasury audience is the most senior we get in front of all year, but the ticket is ~€3.4k per head.
Open question: do we send two people to fewer events or one person to more?`},
];
