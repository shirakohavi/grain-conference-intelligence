# n8n flows

Two, and only two. Both are here as JSON because the source code is part of
the submission, and because the n8n public API cannot attach credentials
anyway: OAuth and header auth both need the browser consent flow, so these
are imported by hand regardless.

| Flow | What it is for |
|---|---|
| `grain-ai.json` | The model proxy. The app calls it instead of calling Anthropic from the browser. |
| `grain-hubspot-push.json` | The CRM sync. Contact, meeting notes, and the draft follow-up email. |

Four earlier flows were deleted along with the features they served:
conference discovery, the Slack and meeting-notes miner, the free-text
capture parser, and a separate lead enrichment step. Each one worked. None
survived the question "would a rep open this twice?".

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
