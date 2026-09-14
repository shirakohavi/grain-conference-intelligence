# n8n flows

Six workflows. Each is exported here as JSON and lives in n8n at
`admin-n8n.optimally-ai.com`, prefixed `grain-` so they're distinguishable on a
shared instance.

**They are all inactive.** Activate them in n8n once credentials are attached.

## What each one does

| File | Trigger | What it does |
|---|---|---|
| `01-conference-discovery.json` | Weekly, Mon 08:00 | Reads what we already track, works out where coverage is thin, asks Claude what we're missing, dedupes, writes new rows with `source: AI search` and `dates_confirmed: false` |
| `02-signal-miner.json` | Webhook `/grain-signal-miner` | Takes raw Slack or meeting text, extracts every conference mentioned, records **who raised it and whether they were a customer**, matches against the database |
| `03-lead-capture.json` | Webhook `/grain-capture` | Turns a rep's one-line show-floor note into structured fields, then checks for a duplicate **before** the lead is saved |
| `04-lead-enrich-score.json` | Every 15 min | Scores every lead: ICP fit × conversation signal, plus trajectory. No AI — see below |
| `05-hubspot-push.json` | Hourly | Pushes leads scoring 60+ to HubSpot with the full encounter history attached, once each |
| `06-ai-proxy.json` | Webhook `/grain-ai` | Holds the Anthropic key server-side so the published site gets real AI without anyone pasting a key |

## The split, deliberately

Flows 1, 2, 3 and 6 call a model. Flows 4 and 5 do not, and that's the point.

**Scoring is arithmetic.** A lead score a sales lead can't reproduce is a score
they won't trust, and a model asked to do arithmetic will quietly get it wrong.
The formula is in the `Score` node in flow 4, commented:

```
lead_score = ICP fit (who they are)
           × conversation signal (what the rep observed)
           + trajectory (warming / stalled / cooling)
           + repeat-contact credit
```

Signal is a **multiplier, not an addition** — a perfect ICP match who showed no
interest is not a good lead, and adding points would pretend otherwise.

**Duplicate detection is rules too.** An exact email match is certainty; a
surname match is a question. The model is never asked "is this the same person"
at capture time — it's asked to read handwriting, which is a different job.

## Credentials to attach (three, once)

Open each flow, click the credential dropdown on the relevant nodes:

**1. Supabase** — on every Supabase node
- Host: `https://toussjkyjkbcuytaadmq.supabase.co`
- Service Role Secret: the **`service_role`** key from Supabase → Settings → API
- This is the one key that bypasses RLS. It belongs here and nowhere else —
  never in the repo, never in the browser.

**2. Header Auth** — on every HTTP Request node calling Claude
- Name: `x-api-key`
- Value: your Anthropic API key

**3. HubSpot** — on the one HubSpot node in flow 5
- A private app token with `crm.objects.contacts.write`

## Webhook URLs

Live only once the flow is **active**:

```
https://admin-n8n.optimally-ai.com/webhook/grain-signal-miner
https://admin-n8n.optimally-ai.com/webhook/grain-capture
https://admin-n8n.optimally-ai.com/webhook/grain-ai
```

While testing, n8n serves `/webhook-test/...` instead, and only for one call
after you press **Execute workflow**.

Set the base in the app under Settings so the front end starts calling them.

## Known gap

Flow 5 maps standard HubSpot fields (name, company, job title). The Grain-specific
properties it sends — `grain_lead_score`, `grain_relationship_pattern`,
`grain_conference_touches`, `grain_first_met_at`, `grain_last_met_at`,
`grain_encounter_log` — **have to exist as custom properties in HubSpot first**,
or they're silently dropped. Create them under Settings → Properties → Contact.
