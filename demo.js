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
  adjudicate: {
    "Danielle Roux": { verdict:"same", confidence:93,
      reasoning:"Noa's second note explicitly says she moved to Checkout in August and that she raised the Copenhagen conversation herself, which only makes sense if it is the same person.",
      tell:"\"she remembered the copenhagen conversation and brought it up first\"" },
    "David Cohen": { verdict:"different", confidence:91,
      reasoning:"One is on the fraud side at Riskified in London, the other in treasury at Payoneer in New York three days later, and the second rep's note opens by saying it is a different David.",
      tell:"Noa wrote \"different david\" in the note itself, and the two were logged 5,500km apart within 72 hours." },
    "Yusuf Al-Rashid": { verdict:"same", confidence:96,
      reasoning:"Identical company, identical job title, and a spelling difference consistent with two reps transliterating the same Arabic name; the second note picks up the exact thread the first one left open.",
      tell:"Feb note says \"talk again when their platform team frees up\"; June note says \"their platform team is free from september\"." },
  },

  arcs: {
    "Daniel Mercer": { arc:"He went from telling us FX was handled internally to owning FX himself, the February brush-off and the September budget question are the same person after a promotion.",
      verdict:"closing", why:"He is asking about specific currency pairs and naming a budget window, which is what someone building an internal business case asks about.",
      nudge:"Send THB and MXN coverage detail this week, addressed to him and the treasury colleague he offered to introduce, and ask to hold 30 minutes at Money20/20 USA on 19 Oct, he already said his whole team will be in the building.",
      avoid:"Do not re-pitch the product. He is past that and it will read as not having listened.",
      email:{ subject:"THB and MXN coverage, and 30 minutes in Vegas",
        body:"You asked how we price the hedge on THB and MXN, so I have put the actual coverage detail together rather than a deck.\nYou also said FX was eating the margin on your LATAM merchants. That is the number I would like to put a figure against with you.\nYou mentioned your whole team will be in the building at Money20/20 on the 19th. Can I take 30 minutes that morning?" } },
    "Marco Ferrari": { arc:"Nothing has changed in five months: three warm conversations, two decks sent, zero replies, and in July he mentioned they renewed with their incumbent in April.",
      verdict:"politely disengage", why:"He renewed before the second meeting, which means every conversation since has been costing us a rep's floor time with no available deal behind it.",
      nudge:"One short email: congratulate him on the renewal, ask when the contract comes up again, and put a calendar reminder for 60 days before that date. Stop spending conference time on him.",
      avoid:"Do not send a third deck. Two went unanswered and a third confirms we are not reading the signal.",
      email:{ subject:"Congratulations on the renewal, and a date for next time",
        body:"You mentioned in July that you renewed with your incumbent back in April. Congratulations, and thank you for being straight with me about it.\nI would rather not keep sending things you cannot act on. When does that contract come up again?\nI will put it in my calendar and come back to you properly two months before, with something worth reading." } },
    "Beatrice Lindqvist": { arc:"In May their internal build was the reason to say no; by June the build was behind schedule and she was asking what a pilot looks like.",
      verdict:"worth pushing", why:"A slipping internal project is the most reliable buying trigger we get, but the window closes as soon as it gets back on track.",
      nudge:"Send a one-page pilot scope, scope, timeline, what Klarna would need to provide, while the build is still late. Reference her own pilot question, not our product.",
      avoid:"Do not criticise their internal build. She may still own it.",
      email:{ subject:"The pilot scope you asked about",
        body:"You asked in June what a pilot would actually look like, so here it is on one page: scope, timeline, and the two things we would need from Klarna.\nYou also said the internal build had slipped. I am not going to pretend to have a view on that, but if a pilot is useful while the timeline is uncertain, this is what it would take.\nWorth 20 minutes?" } },
    "Priya Raghunathan": { arc:"She moved from an exploratory white-label idea in June to chasing us for the September meeting and getting legal to look at a mutual NDA.",
      verdict:"closing", why:"When the prospect is doing the chasing and legal is already engaged, the deal is real and the risk is us being slow.",
      nudge:"Return the mutual NDA within 48 hours and propose commercial terms for the white-label structure in the same email. Do not wait for the next conference.",
      avoid:"Do not treat Airwallex as a competitor in the conversation. The whole opening is that they want to resell, and framing it competitively kills it.",
      email:{ subject:"Mutual NDA back, and commercial terms",
        body:"The mutual NDA is signed and attached.\nYou asked about the white-label structure, so I have put outline commercial terms in the same document rather than making you wait for a second email.\nIf the terms look workable, I would like to get your legal and ours talking this week rather than at the next event." } },
    "Danielle Roux": { arc:"Same person, bigger job: at Trustly the blocker was their bank relationship, at Checkout.com she owns FX product with a budget behind it.",
      verdict:"worth pushing", why:"The objection that stopped this in June left the building with her old job title, she is a new prospect with an existing relationship.",
      nudge:"Email referencing the Copenhagen conversation directly, then ask what the FX product roadmap at Checkout looks like for the next two quarters. She raised the old conversation first, so she is inviting it.",
      avoid:"Do not reuse the Trustly framing. Their bank-relationship constraint is not her constraint any more.",
      email:{ subject:"Following up on Copenhagen, at Checkout this time",
        body:"You brought up the Copenhagen conversation before I did, which I took as an invitation.\nThe blocker back then was the bank relationship at Trustly. That is not your constraint any more.\nWhat does the FX product roadmap at Checkout look like over the next two quarters? If there is a slot in it, I would like to be in the conversation early rather than late." } },
    "Yusuf Al-Rashid": { arc:"February's \"talk when the platform team frees up\" became June's \"the platform team is free from September and I want a technical session\", he tracked the thread himself.",
      verdict:"worth pushing", why:"He named a date and asked for the technical conversation, but we have no email for him, only a phone number, which is how this one quietly dies.",
      nudge:"It is September. Call the number Noa took in Istanbul, get an email address on that call, and book the technical session before the end of the month.",
      avoid:"Do not wait for the next Gulf conference to re-open this. He has already given you the timing.",
      email:{ subject:"Your platform team is free, so let us book the technical session",
        body:"In February you said to come back when the platform team had capacity. In June you told me that would be September.\nIt is September.\nI only have a phone number for you, which is my fault. Can you send me an email address and I will get a technical session in the diary before the end of the month?" } },
  },

  /* Demo mode has no model. Six contacts have a hand-written arc because
     they are the ones worth reading. Everyone else gets a brief built from
     the same rule output the real prompt is handed.

     What this must never do is write its own excuse into the prose. An
     earlier version ended the next step with "turn on a model key in
     Settings" and put "demo mode has no model" in the email body, which put
     the word demo in the middle of a sales brief. The card carries a badge
     instead. Every sentence below stands on its own and is true. */
  arc(c, rep = {}) {
    const canned = DEMO.arcs[c.name];
    if (canned) return { ...canned, __demo: true };

    const firstE = c.encounters[0], last = c.encounters[c.encounters.length - 1];
    const name = c.name.split(" ")[0];
    const n = c.touches;
    const link = rep.calendar ? `\n${rep.calendar}\n` : "\n";
    const said = last.note ? `"${last.note}"` : "";

    /* A first meeting has no arc to read. Its job is to introduce and book
       time while the conversation is still warm, which is a different email
       from the one a fourth meeting needs. */
    if (n === 1) {
      return {
        __demo: true,
        arc: said
          ? `One meeting, at ${firstE.confName}. They said ${said}.`
          : `One meeting, at ${firstE.confName}. Nothing was written down about what they said.`,
        why: last.intent === "hot"
          ? "They named something concrete on the first meeting. The risk here is being slow, not being wrong."
          : last.intent === "warm"
          ? "They told you a problem on the first meeting. That is worth a proper conversation while they still remember you."
          : "Nothing named yet. One specific question is worth more than a pitch.",
        nudge: `Write to ${name} today, while ${firstE.confName} is still fresh, and offer a time.`,
        avoid: "Do not send a deck first. Nobody opens a deck from someone they met once.",
        email: {
          subject: `Good to meet you at ${firstE.confName}`,
          body: `Good to meet you at ${firstE.confName}.`
              + (last.note ? `\nYou mentioned ${said.toLowerCase()}, and that is the part I would like to pick up.` : "")
              + `\nGrain takes the FX risk off platforms so their customers never carry it, which is usually the quickest thing to show rather than describe.`
              + `\nAre you free for 20 minutes in the next couple of weeks?${link}`,
        },
      };
    }

    const why = c.verdict === "Dormant" && c.overdue
        ? `They have gone past their own usual gap of ${c.usualGapDays} days without a word. That is where a relationship quietly ends.`
      : c.verdict === "Dormant"
        ? `${n} meetings and they have never once named a budget or a date. Treat this as a tire-kicker until something changes.`
      : c.verdict === "Active"
        ? "They named something concrete at the last meeting. The risk here is being slow, not being wrong."
      : c.changedCompany
        ? "They changed employer, so the objection you were working may have left with the old job."
        : "Still in conversation, nothing named yet. Worth one specific question, not another pitch.";

    const nudge = c.changedCompany
        ? `Write to ${name} at the new company and ask what the FX picture looks like there. Do not reuse the old framing.`
      : c.overdue
        ? `Call ${name} rather than emailing. ${c.daysSince} days of silence is past the point where an email gets opened.`
      : c.verdict === "Dormant"
        ? `Ask ${name} one direct question: is there a budget line for this, and when does it open. A fourth polite conversation is worse than a clear no.`
      : c.verdict === "Active"
        ? `Reply to ${name} this week on the specific thing in the last note, and put a date in it.`
        : `Pick the one specific thing ${name} said at ${last.confName} and write about that alone.`;

    return {
      __demo: true,
      arc: `${n} meetings between ${firstE.confName} and ${last.confName}. ${c.test}`,
      why, nudge,
      avoid: "Do not send a generic check-in. It is the message that ends these.",
      email: {
        subject: `Following up from ${last.confName}`,
        body: `We spoke at ${last.confName} and I have been thinking about what you said.`
            + (last.note ? `\nYou mentioned ${said.toLowerCase()}` : "")
            + `\nIs there a good 20 minutes in the next two weeks to go through it properly?${link}`,
      },
    };
  },

  interpret(c, s) {
    const go = s.tier === "A" ? "go" : s.tier === "B" ? "go" : s.tier === "C" ? "go if clustered" : "skip";
    const weakLabel = { icpDensity:"the room is not dense enough in our buyers", seniority:"the decision-makers send juniors",
      efficiency:"the cost per useful conversation is high",
      strategic:"the platforms who could embed us are not here" }[s.weakest];
    const strongLabel = { icpDensity:"buyer density", seniority:"seniority in the room",
      efficiency:"cost per qualified conversation", strategic:"embedded-partner presence" }[s.strongest];
    return {
      __demo:true, verdict:go,
      argument: `${c.name} scores ${s.total} and its strongest dimension is ${strongLabel}. The case against it is that ${weakLabel}, at €${Math.round(s.eff.costPerContact)} per reachable ICP contact, that is the number to defend.`,
      targets:["Head of Treasury or FX at a cross-border PSP","Partnerships lead at a marketplace or travel platform","Product owner for multi-currency payouts"],
      blindSpot:"The score cannot see who is actually speaking or which of our existing prospects have already booked travel. Check the speaker list and cross-reference the contact book before committing.",
    };
  },
};
