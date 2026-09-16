# n8n flows

Three. All here as JSON because the source code is part of the submission,
and because credentials have to be attached by hand anyway: OAuth and header
auth both need the browser consent flow, so the n8n public API cannot do it.

| Flow | What it is for |
|---|---|
| `grain-ai.json` | The model proxy. The app calls it instead of calling Anthropic from the browser. |
| `grain-hubspot-push.json` | The CRM sync. Contact, meeting notes, and the draft follow-up email. |
| `grain-discover.json` | The weekly conference search. Finds events nobody on the team has heard of. |

Three earlier flows were deleted along with the features they served: the
Slack and meeting-notes miner, the free-text capture parser, and a separate
lead enrichment step. Each one worked. None survived the question "would a
rep open this twice?".

## `grain-discover`

Two ways in, one path out. A schedule trigger fires it every Monday at
07:00; a webhook fires it when someone presses "Find conferences with AI" on
the Conferences page. Both land in the same chain, so there is one behaviour
to reason about rather than two.

1. **Conferences we already have** reads the table, so the model is told
   what not to suggest. The manual path also sends the browser's list, which
   costs nothing and covers the case where the two disagree.
2. **Write the search brief** builds the prompt. It names Grain's actual
   buyers, sets the rule that a null is a correct answer and a guess is not,
   and pins today's date so "the next 12 months" means something.
3. **Claude with web search** is an ordinary Messages API call with the
   `web_search_20250305` tool attached. The model searches, reads, and
   answers from what it read.
4. **Keep only what is new** parses the array, drops anything whose name
   already exists after normalising, drops anything with no URL, and builds
   the rows. It deliberately sets none of the four judgement scores.
5. **Add them** inserts. **How many** reports the count back to the button.

A discovered row arrives tagged `AI sourced`, carrying the page the search
cited, with whatever the search actually found and blanks where it found
nothing. It has no tier, because nobody has scored it, so it sits in the
existing "needs scoring" state until a person fills in the estimates.

That split is the whole point. Finding an event nobody knew about is
recall, which a model with a search tool is good at. Deciding whether it is
worth a flight is judgement about this company's pipeline, which it is not.
So the flow is allowed to add rows and forbidden to rank them.

It needs two credentials: the same header-auth Anthropic key `grain-ai`
uses, and a Supabase credential holding the project URL and the
`service_role` key. That key writes to the database, so it belongs in n8n's
credential store and nowhere near the repo or the browser.

## Why `grain-ai` exists at all

A model key in client-side JavaScript is readable by anyone who opens dev
tools. But a grader clicking the live URL has no key of their own, and a
tool that shows canned responses to the person evaluating it is a tool that
never demonstrates the thing it was built to demonstrate.

So the key lives in this n8n instance's credential store and the browser
only ever sees the answer. With no proxy configured the app falls back to
written sample responses, badged as such, so nothing dead-ends.

The flow only accepts three task names. Without that allow-list the webhook
URL is a free anonymous LLM proxy for anyone who finds it, which is how a
demo becomes a bill.

## Importing

1. n8n, Workflows, Import from File, one for each JSON
2. Attach the credentials:
   - `grain-ai` → **Header Auth**, header name `x-api-key`, value your
     Anthropic key. Header auth rather than a bearer token, because that is
     the header Anthropic reads.
   - `grain-hubspot-push` → **HubSpot App Token**, a private app token with
     CRM read and write on contacts, notes and emails.
3. Activate both
4. In the app, Settings, paste the base URL (no trailing slash, no `/webhook`)
   into the n8n field, and the HubSpot webhook URL into the relay field

## Before this is more than a demo

`allowedOrigins` is `*` on both webhooks so the Pages site can reach them.
Narrow it to the Pages URL. And the HubSpot webhook takes whatever it is
given, so it wants a shared secret in a header before it is pointed at a
real portal.
