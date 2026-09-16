# Hosting and configuring it

No build step. The repo is the site.

## The site

GitHub Pages, **Settings → Pages**, source *Deploy from a branch*, branch
`main`, folder `/ (root)`. A minute later it is at
`https://<username>.github.io/grain-conference-intelligence/`.

Updating it is a commit. Every local script and stylesheet is loaded with a
version string (`app.js?v=...`), so bump that version in `index.html` and
`join.html` whenever the JavaScript or CSS changes. Without it a browser will
happily run yesterday's `app.js` against today's page, which looks exactly like
a bug in whichever half is newer.

## The database

Supabase, one project, four tables: `conferences`, `leads`, `encounters`,
`team`. Row-level security is on. `config.js` carries the project URL and the
publishable key, which is public by design. The `service_role` key is not in
this repo. It lives in n8n's credential store and nowhere else.

## The flows

Import the three files in `flows/` into n8n and attach credentials by hand. The
n8n API cannot attach them: header auth and OAuth both need the browser consent
flow.

- `grain-ai` needs header auth, header name `x-api-key`, value an Anthropic key
- `grain-discover` needs the same one, plus a Supabase credential holding the
  project URL and the `service_role` key
- `grain-hubspot-push` needs a HubSpot service key with read and write on
  contacts

Publish all three.

## The app

Settings, then:

- **n8n base URL** the domain only, for example
  `https://your-n8n.example.com`. The app appends the path itself.
- **Relay URL** the full webhook, `<base>/webhook/grain-hubspot-push`.
- **Key** leave empty. That field is the fallback route that puts a model key in
  the browser. The point of the n8n route is that it does not have to.

Press Test under n8n. A clean result means the model is live for everyone who
opens the URL.

## Without any of it

Open `index.html` with no n8n and no relay configured and the tool still runs:
every AI feature returns a written fallback of the same shape, badged as such,
and HubSpot pushes show the payload instead of sending it.
