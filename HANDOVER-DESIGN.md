# Handover — visual redesign

Paste this whole file into the new chat as your first message, then attach
`grain-app.zip`. Everything below is current as of 14 Sep 2026.

---

## What this is

A home assignment for an **AI Builder** role at **Grain** (grainfinance.com), a
Tel Aviv fintech selling embedded cross-currency hedging. The brief: build a
conference intelligence tool for their sales team. Due **17 Sep**. Deliverables
are a live URL, source code, and a 5–10 minute video walkthrough.

The tool covers four moments in a rep's year: **decide** which conferences are
worth attending, **plan** team coverage, **capture** leads on the show floor,
and **recognise** relationships that build across multiple events.

**The functionality is built and working. This handover is for the visual design
only.** Do not restructure the logic, the scoring model, or the copy arguments —
they are the substance the assignment is graded on.

## Live right now

| | |
|---|---|
| Live site | https://shirakohavi.github.io/grain-conference-intelligence/ |
| Repo | https://github.com/shirakohavi/grain-conference-intelligence |
| Database | Supabase project `toussjkyjkbcuytaadmq` (Postgres 17, EU) |
| Automation | n8n at `admin-n8n.optimally-ai.com` — not built yet |

The site is static HTML/CSS/JS on GitHub Pages. No framework, no build step.
Data comes from Supabase at runtime via `supabase-js` from a CDN.

## Files

```
index.html     markup shell + script tags
styles.css     ← the design system. Most of your work is here.
logo.png       Grain's mark, used in the sidebar and as favicon
config.js      Supabase URL + anon key (public by design, RLS protects rows)
db.js          data access — the only file that knows Postgres exists
engine.js      scoring, trip clustering, identity resolution. NO AI. Don't touch.
ai.js          every model call, one file
demo.js        canned AI responses so the tool works without an API key
app.js         ← all views and markup. Your other work is here.
samples.js     sample Slack/meeting text for the Signal Miner demo
```

`app.js` is one file with six view functions: `VIEWS_CONF`, `VIEWS_PLAN`,
`VIEWS_FIELD`, `VIEWS_CONTACTS`, `VIEWS_SIGNALS`, `VIEWS_SETTINGS`. Each returns
an HTML string. There is no framework — `render()` swaps `innerHTML`.

## Design direction (Shira's brief, verbatim)

- Look more like **Notion / Monday** — database views, **status columns, tags**
- **No emojis** anywhere
- **Keep Grain's brand colours and fonts**

## Brand, sampled from grainfinance.com's live stylesheet

| Role | Hex |
|---|---|
| Primary navy | `#2B3674` |
| Body slate | `#5C6590` |
| Pale blue-grey | `#A3AED0` |
| Accent blue | `#3D82F7` |
| Background | `#FBFCFE` |
| Border | `#E6EAF4` |

Their typeface is **Suisse Intl** (commercial). **Inter** is the free substitute
in use. Don't swap it for something else without a reason.

## What's already done — and the reasoning, so it doesn't get undone

**Tags use three colours, not twenty-six.** There are 26 verticals in the data.
Blue marks payments/fintech, sand marks travel — Grain's two core verticals —
and everything else is grey. The colour tells a rep about vertical fit at a
glance instead of being decoration. See `TAG_TONE` in `app.js`. Keep this idea
even if you change the hues.

**Status is a real `<select>` styled as a Notion property** (`.status`,
`.st-New` / `.st-Considering` / `.st-Attending` / `.st-Rejected`). Changing it
writes straight to Postgres. It is functional, not a badge.

**Tier is a rank, so weight is deliberate**: A is solid navy, B is soft blue,
C is grey, D is an outline that recedes.

**Nav icons are inline SVG** (`IC` map in `app.js`), 16px, 1.5 stroke,
`currentColor`. They replaced geometric symbols. Keep them icon-only, no emoji.

**One border weight (1px), one radius scale, shadows only on things that float**
(drawer, toast). Flat surfaces otherwise.

## Known issues to fix

1. **The filter bar is the weakest part.** Boxed `<select>`s and chip buttons
   in a bordered card. Notion would use quieter inline text controls with a
   subtle hover, not boxes. This is the most visible thing to improve.
2. **The five other views are much less designed than Conferences.** Plan,
   Field, Contacts, Signals and Settings still use generic `.card` / `.pad`
   layout. Contacts matters most — it is the view the assignment is graded on
   hardest, and it currently renders repeat contacts as plain cards.
3. **Vertical rhythm is inconsistent** between views — spacing was set
   ad hoc rather than on a scale.
4. **The drawer** (opens on row click) works but hasn't had a design pass.
5. **Mobile** is functional but untuned. Field mode especially should feel
   phone-first — a rep uses it standing up on a show floor.
6. **The month grid on Plan** is a grid, not a calendar. A Gantt-style timeline
   was requested and never built.

## Deploying a change — read this, it is not obvious

There is **no git push**. The Chrome extension can't read the project folder and
there's no GitHub CLI. The loop is:

1. Edit files locally
2. Shira opens `~/claude Job Hunt/grain-conference-intelligence` in Finder
3. Selects all files, drags them onto
   `https://github.com/shirakohavi/grain-conference-intelligence/upload`
4. Commits. GitHub Pages rebuilds in about a minute.

So **batch your changes** and hand her one upload per round. Don't drip out
single-file edits.

To preview locally before shipping: `python3 -m http.server` in the folder, then
open `localhost:8000`. The database loads fine from localhost.

## Don't break

- **`engine.js`** — scoring, clustering and identity resolution. Pure arithmetic,
  deliberately AI-free. The whole pitch is that a sales lead can audit it.
- **The copy.** Sentences like *"Cost efficiency is measured per reachable ICP
  contact — one rep can hold about 20 real conversations a day"* are the
  argument the assignment is graded on. Restyle them; don't rewrite them.
- **The three hard match cases** in the Contacts review queue (Danielle Roux at
  50, David Cohen at 56, Yusuf/Yousef at 78). That queue is the strongest part
  of the whole submission. Make it look better, change nothing about what it says.
- **`demo.js`** — the tool must stay fully clickable with no API key, because
  whoever evaluates this won't have one.
