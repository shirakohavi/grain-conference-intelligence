/* ══════════════════════════════════════════════════════════════════════════
   DEMO MODE

   Shipping decision: whoever opens the live URL will not have pasted an API
   key. If the AI features only work with a key, they never get seen. So every
   AI call falls back to a pre-written response of the same SHAPE, clearly
   badged "demo" in the interface, and the tool stays fully clickable.

   These are canned outputs, not a fake model. Add a key in Settings and the
   identical code path hits the real API instead.
   ══════════════════════════════════════════════════════════════════════════ */

const DEMO = {
  mineSignals: {
    mentions: [
      { name:"Singapore FinTech Festival", mentionedBy:"Maya (via Priya, Airwallex)", sentiment:"concern", evidence:"customer",
        context:"Airwallex is sending 12 people; cross-border is the whole track now. We have never attended.", alreadyTracked:true },
      { name:"Merchant Payments Ecosystem", mentionedBy:"Tom", sentiment:"positive", evidence:"customer",
        context:"Two separate prospects asked this month whether Grain would be in Berlin. Alon: 1,800 people but the right 1,800.", alreadyTracked:true },
      { name:"Money20/20 USA", mentionedBy:"Daniel Mercer (Nuvei)", sentiment:"positive", evidence:"customer",
        context:"Daniel would rather meet there than take a call — his whole team will be in the building.", alreadyTracked:true },
      { name:"TRANSACT", mentionedBy:"Daniel Mercer (Nuvei)", sentiment:"positive", evidence:"customer",
        context:"Nuvei is sponsoring it next April.", alreadyTracked:true },
      { name:"Shoptalk Europe", mentionedBy:"Sophie Kaminski (Mirakl)", sentiment:"concern", evidence:"customer",
        context:"The marketplace crowd goes here rather than to fintech events — a possible explanation for thin marketplace pipeline.", alreadyTracked:true },
      { name:"VTEX DAY", mentionedBy:"Sophie Kaminski (Mirakl)", sentiment:"concern", evidence:"customer",
        context:"Where LATAM marketplaces concentrate. 20k attendees. Grain has zero LATAM presence.", alreadyTracked:true },
      { name:"Seamless Middle East", mentionedBy:"Ahmed Farouk (Paymob)", sentiment:"concern", evidence:"customer",
        context:"Ahmed asked why we skipped it. Entry is free.", alreadyTracked:true },
      { name:"Money20/20 Asia", mentionedBy:"Alon", sentiment:"positive", evidence:"internal",
        context:"Late April, Bangkok. High travel-platform density, which maps to one of our four verticals.", alreadyTracked:true },
      { name:"Sibos", mentionedBy:"Maya", sentiment:"neutral", evidence:"internal",
        context:"Most senior treasury audience of the year, but ~€3.4k per head.", alreadyTracked:true },
    ],
  },

  discover: {
    suggestions: [
      { name:"ITB Berlin", typicalMonth:"March", typicalCity:"Berlin", vertical:"Travel",
        whyUs:"The world's travel wholesalers and bed-banks in one hall — the single vertical where FX pain is most acute and where we currently have no presence at all.",
        risk:"It is a travel trade fair, not a fintech event. Nobody there is shopping for a hedging product, so it is a demand-creation play, not a pipeline play." },
      { name:"Phocuswright Conference", typicalMonth:"November", typicalCity:"Phoenix / San Diego", vertical:"Travel Tech",
        whyUs:"Travel platform executives and their investors. Smaller and far more senior than ITB, and the agenda is explicitly about platform economics.",
        risk:"Expensive for its size and heavily US-centric; European travel wholesalers are under-represented." },
      { name:"Seamless North Africa / Seamless Asia", typicalMonth:"varies", typicalCity:"Cairo / Singapore", vertical:"Payments",
        whyUs:"Same free-entry, high-volume format as Seamless Middle East which already scores A-tier for us, in corridors where FX volatility is the customer's loudest complaint.",
        risk:"Junior floor. Needs a rep who can work a room rather than deliver a pitch." },
      { name:"EBAday", typicalMonth:"June", typicalCity:"rotates (EU)", vertical:"Banking / Treasury",
        whyUs:"Already in our list, but worth re-rating: the bank treasury audience are the people our platform customers are trying to route around.",
        risk:"Bank-side, not platform-side. Long sales cycles and it is not where an embedded deal starts." },
      { name:"Fintech Meetup", typicalMonth:"March", typicalCity:"Las Vegas", vertical:"Fintech",
        whyUs:"Double-opt-in meeting algorithm produces more qualified conversations per day than any floor-based event; our cost-per-contact model rates it well.",
        risk:"You get meetings, not a brand presence. Wasted if the team has not built a target list beforehand." },
      { name:"Cross-Border Payments Summit (The Payments Association)",typicalMonth:"varies", typicalCity:"London", vertical:"Cross-border Payments",
        whyUs:"Single-topic and the topic is literally our topic; attendee list skews to PSP product owners rather than marketing.",
        risk:"Small and invitation-led — confirm we can actually get a stand or a speaking slot before budgeting for it." },
    ],
  },

  adjudicate: {
    "Danielle Roux": { verdict:"same", confidence:93,
      reasoning:"Alon's second note explicitly says she moved to Checkout in August and that she raised the Copenhagen conversation herself, which only makes sense if it is the same person.",
      tell:"\"she remembered the copenhagen conversation and brought it up first\"" },
    "David Cohen": { verdict:"different", confidence:91,
      reasoning:"One is on the fraud side at Riskified in London, the other in treasury at Payoneer in New York three days later, and the second rep's note opens by saying it is a different David.",
      tell:"Alon wrote \"different david\" in the note itself — and the two were logged 5,500km apart within 72 hours." },
    "Yusuf Al-Rashid": { verdict:"same", confidence:96,
      reasoning:"Identical company, identical job title, and a spelling difference consistent with two reps transliterating the same Arabic name; the second note picks up the exact thread the first one left open.",
      tell:"Feb note says \"talk again when their platform team frees up\"; June note says \"their platform team is free from september\"." },
  },

  arcs: {
    "Daniel Mercer": { arc:"He went from telling us FX was handled internally to owning FX himself — the February brush-off and the September budget question are the same person after a promotion.",
      verdict:"closing", why:"He is asking about specific currency pairs and naming a budget window, which is what someone building an internal business case asks about.",
      nudge:"Send THB and MXN coverage detail this week, addressed to him and the treasury colleague he offered to introduce, and ask to hold 30 minutes at Money20/20 USA on 19 Oct — he already said his whole team will be in the building.",
      avoid:"Do not re-pitch the product. He is past that and it will read as not having listened." },
    "Marco Ferrari": { arc:"Nothing has changed in five months: three warm conversations, two decks sent, zero replies, and in July he mentioned they renewed with their incumbent in April.",
      verdict:"politely disengage", why:"He renewed before the second meeting, which means every conversation since has been costing us a rep's floor time with no available deal behind it.",
      nudge:"One short email: congratulate him on the renewal, ask when the contract comes up again, and put a calendar reminder for 60 days before that date. Stop spending conference time on him.",
      avoid:"Do not send a third deck. Two went unanswered and a third confirms we are not reading the signal." },
    "Beatrice Lindqvist": { arc:"In May their internal build was the reason to say no; by June the build was behind schedule and she was asking what a pilot looks like.",
      verdict:"worth pushing", why:"A slipping internal project is the most reliable buying trigger we get, but the window closes as soon as it gets back on track.",
      nudge:"Send a one-page pilot scope — scope, timeline, what Klarna would need to provide — while the build is still late. Reference her own pilot question, not our product.",
      avoid:"Do not criticise their internal build. She may still own it." },
    "Priya Raghunathan": { arc:"She moved from an exploratory white-label idea in June to chasing us for the September meeting and getting legal to look at a mutual NDA.",
      verdict:"closing", why:"When the prospect is doing the chasing and legal is already engaged, the deal is real and the risk is us being slow.",
      nudge:"Return the mutual NDA within 48 hours and propose commercial terms for the white-label structure in the same email. Do not wait for the next conference.",
      avoid:"Do not treat Airwallex as a competitor in the conversation. The whole opening is that they want to resell, and framing it competitively kills it." },
    "Danielle Roux": { arc:"Same person, bigger job: at Trustly the blocker was their bank relationship, at Checkout.com she owns FX product with a budget behind it.",
      verdict:"worth pushing", why:"The objection that stopped this in June left the building with her old job title — she is a new prospect with an existing relationship.",
      nudge:"Email referencing the Copenhagen conversation directly, then ask what the FX product roadmap at Checkout looks like for the next two quarters. She raised the old conversation first, so she is inviting it.",
      avoid:"Do not reuse the Trustly framing. Their bank-relationship constraint is not her constraint any more." },
    "Yusuf Al-Rashid": { arc:"February's \"talk when the platform team frees up\" became June's \"the platform team is free from September and I want a technical session\" — he tracked the thread himself.",
      verdict:"worth pushing", why:"He named a date and asked for the technical conversation, but we have no email for him, only a phone number, which is how this one quietly dies.",
      nudge:"It is September. Call the number Alon took in Istanbul, get an email address on that call, and book the technical session before the end of the month.",
      avoid:"Do not wait for the next Gulf conference to re-open this. He has already given you the timing." },
  },

  capture: {
    name:"Nadia Haddad", company:"Wafeq", title:"Head of Payments", email:"", phone:"",
    intent:"warm",
    note:"Runs payments for a Gulf B2B invoicing platform. Their SME customers invoice in USD and EUR but settle in AED and SAR, and the spread is a running complaint. Asked how we price the hedge.",
    icpSignals:["B2B platform with multi-currency invoicing","Gulf SME customer base","customers absorbing FX spread today","asked about pricing unprompted"],
    missing:["email address","whether she owns the budget or influences it","volume per month"],
  },

  interpret(c, s) {
    const go = s.tier === "A" ? "go" : s.tier === "B" ? "go" : s.tier === "C" ? "go if clustered" : "skip";
    const weakLabel = { icpDensity:"the room is not dense enough in our buyers", seniority:"the decision-makers send juniors",
      crossBorder:"the agenda is mostly domestic", efficiency:"the cost per useful conversation is high",
      strategic:"the platforms who could embed us are not here" }[s.weakest];
    const strongLabel = { icpDensity:"buyer density", seniority:"seniority in the room", crossBorder:"cross-border relevance",
      efficiency:"cost per qualified conversation", strategic:"embedded-partner presence" }[s.strongest];
    return {
      __demo:true, verdict:go,
      argument: `${c.name} scores ${s.total} and its strongest dimension is ${strongLabel}. The case against it is that ${weakLabel} — at €${Math.round(s.eff.costPerContact)} per reachable ICP contact, that is the number to defend.`,
      targets:["Head of Treasury or FX at a cross-border PSP","Partnerships lead at a marketplace or travel platform","Product owner for multi-currency payouts"],
      blindSpot:"The score cannot see who is actually speaking or which of our existing prospects have already booked travel. Check the speaker list and cross-reference the contact book before committing.",
    };
  },
};
