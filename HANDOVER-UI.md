# Handover: visual design pass

Paste this whole file into the new chat as its first message. Everything below
is true as of 15 Sep 2026.

---

## 1. What you are inheriting

A home assignment for an **AI Builder** role at **Grain** (grainfinance.com),
a Tel Aviv fintech selling embedded cross-currency FX hedging. The brief was to
build a conference intelligence tool for their sales team.

Due **17 Sep 2026**. Deliverables: a live URL, the source code, and a 5 to 10
minute video walkthrough.

**The product is finished and working. Your job is the visual design only.**
Do not restructure the logic, the scoring model, the information architecture
or the copy arguments. Those are the substance the assignment is graded on and
they were fought over at length. Restyle them; do not rewrite them.

The tool covers four moments in a rep's year: decide which conferences are
worth attending, plan team coverage across the calendar, capture leads on the
show floor, and recognise relationships that build across several events.

## 2. Where everything lives

| | |
|---|---|
| Live site | https://shirakohavi.github.io/grain-conference-intelligence/ |
| Field mode | same URL + `/join.html` |
| Repo | https://github.com/shirakohavi/grain-conference-intelligence |
| Local folder | `~/claude Job Hunt/grain-conference-intelligence` |
| Database | Supabase project `toussjkyjkbcuytaadmq`, Postgres 17, EU |
| Automation | n8n at `admin-n8n.optimally-ai.com`, six flows, not yet activated |

Static HTML, CSS and JS on GitHub Pages. No framework, no build step, no
bundler. Data loads from Supabase at runtime through `supabase-js` from a CDN.

## 3. File map

```
index.html     shell for the main app, sidebar + <main id="main">
join.html      shell for field mode, a separate page, no sidebar
styles.css     the design system, 528 lines. Most of your work is here.
join.css       field mode only, the .k-* classes
logo.png       Grain's mark, sidebar and favicon
config.js      Supabase URL + anon key. Public by design, RLS protects the rows.
db.js          every Postgres call. Nothing else knows the database exists.
engine.js      scoring, trip clustering, identity resolution. No AI. Do not touch.
ai.js          every model call, one file
demo.js        canned AI answers so the tool works with no API key
app.js         all four views and their markup, 1823 lines. Your other file.
join.js        field mode, one page, its own state machine
data/samples.js  sample Slack and meeting text
```

### How rendering works

There is no framework. `render()` builds an HTML string and assigns it to
`innerHTML`. Four views, each a function returning a string:

```
VIEWS = { conferences: VIEWS_CONF, plan: VIEWS_PLAN,
          contacts:    VIEWS_CONTACTS, settings: VIEWS_SETTINGS }
```

Field mode is a separate page with its own loop in `join.js`.

**The one trap this causes:** calling `render()` from an `oninput` handler
destroys the focused element mid-keystroke. That bug has been fixed twice
already, once for text inputs and once for sliders. The pattern now is a narrow
update function that rewrites only the affected node: see `confPreview()` and
`reweight(k, v)` in `app.js`. If you add an input, follow that pattern.

## 4. Brand

Sampled from grainfinance.com's live stylesheet. All tokens are on `:root` in
`styles.css`.

| Role | Token | Hex |
|---|---|---|
| Primary navy | `--ink` | `#2B3674` |
| Body slate | `--ink2` | `#676E97` |
| Pale blue-grey | `--ink3` | `#A3AED0` |
| Accent blue | `--accent` | `#5B9FFF` |
| Accent fill | `--accent-soft` | `#EAF1FE` |
| Accent text | `--accent-ink` | `#1B5FD9` |
| Background | `--bg` | `#F4F7FE` |
| Panel | `--panel` | `#fff` |
| Border | `--line` | `#E9EDF7` |
| Faint border | `--line2` | `#F1F4FB` |

Signal colours: `--hot` `#D0342C`, `--warm` `#B7791F`, `--cold` `#2F6FD0`.
Cold is deliberately blue, not grey. Shira asked for that specifically.

Grain's real typeface is **Suisse Intl**, which is commercial. **Inter** is the
free substitute in use. Do not swap it without a reason.

## 5. Shira's standing rules

These are not preferences to weigh. They are instructions.

- **No emojis.** Anywhere, ever, including in chat replies.
- **No em dashes.** In code comments, copy or chat.
- **Keep Grain's colours and font.**
- **Notion or Monday style.** Database views, status columns, tags. Quiet
  chrome, not decoration.
- **Far less text than an AI would write by default.** She has said the UI was
  "too many words everywhere, so much content, it's messy" more than once. When
  in doubt, cut.
- **Show her before you build.** Describe the change, get a yes, then write code.
  She has rejected whole rounds of work that were built without agreement.
- **Short answers in chat.** She is a project manager, not a frontend engineer.
  Explain technical things plainly.
- **Never push to GitHub.** Commit if asked; she pushes from GitHub Desktop.

## 6. What is settled, and why, so it does not get undone

**The scoring model.** Four inputs, weights fixed after a long conversation:
ICP fit 40, Seniority 20, Cost per conversation 20, Strategic reach 20. The raw
weighted average is stretched from its real band (12 to 80) onto 0 to 100 so the
scores use the full range. Cross-border exposure is folded into ICP fit.
Activation potential was cut. Strategic reach includes geography. Do not
reweight, rename or reorder these.

**The organising principle**, which the video will state out loud: *rules where
the answer must be reproducible, AI where the job actually requires judgement.*
`engine.js` is pure arithmetic on purpose, so a sales lead can audit it.

**"We don't know" is a real state.** Unscored events show `?`, sort to the top
of the table, get an amber row and a bar saying how many need scoring. Keep that
loud. It is a deliberate honesty move, not an error state to hide.

**Tags use three colours, not twenty-six.** There are 26 verticals in the data.
Blue is payments and fintech, sand is travel, Grain's two core verticals, and
everything else is grey. See `TAG_TONE` in `app.js`. You may change the hues.
Do not turn it into a rainbow.

**Status is a real `<select>` styled as a Notion property**, not a badge.
Changing it writes to Postgres. Same for lead status in Contacts.

**Tier is a rank, so the weight is deliberate:** A solid navy, B soft blue,
C grey, D an outline that recedes.

**The signal test.** hot = named a budget or a date. warm = told us their FX
problem. cold = no problem named. It is phrased as a test, not a feeling,
because it decides the HubSpot auto push and two reps must classify the same
note the same way. Do not soften the wording.

**The three hard identity match cases** in Contacts (Danielle Roux at 50,
David Cohen at 56, Yusuf and Yousef at 78). This is the strongest part of the
submission. Make it look better. Change nothing about what it says.

**`demo.js`** must keep working with no API key. Whoever grades this will not
have one.

## 7. Where the design actually needs work

Ranked. The first two are worth most.

1. **Contacts is the view the assignment is graded hardest on** and it is the
   least designed. The table works and the column widths were just tuned, but
   the contact drawer, the relationship summary and the identity review queue
   are all plain `.card` / `.pad` blocks.
2. **Plan the year.** The month and year views are grids, not a calendar you can
   read at a glance. The trip cluster cards and gap cards were added late and
   still look like boxes with text in them. A Gantt-style timeline was asked for
   at one point and never built.
3. **The drawer** (opens on any row click) has never had a design pass. It holds
   the score breakdown, which is the most argued-over content in the app, so it
   deserves better than stacked paragraphs.
4. **Vertical rhythm is inconsistent between views.** Spacing was set ad hoc.
   There are `--spacing-*` tokens on `:root` that are barely used. Putting
   everything on a scale would lift the whole thing.
5. **The filter row.** Now all dropdowns, which was the requested fix, but they
   are still boxed controls in a bordered strip. Notion would make them quieter.
6. **`styles.css` has grown by appending.** Roughly the last 250 lines are
   layers added fix by fix, some of them overriding earlier rules. It would
   benefit from being consolidated, carefully, without changing what renders.
7. **Mobile.** Functional, untuned. Field mode especially should feel phone
   first, since a rep uses it standing up on a show floor.
8. **The logo and the sidebar brand block** have never been designed. Shira
   parked this until the end and it is still parked.

## 8. How to work on it

### Preview locally

```
cd ~/claude\ Job\ Hunt/grain-conference-intelligence
python3 -m http.server 8899
```

Then open `localhost:8899`. The database loads fine from localhost.

### Test before you ship

The repo has a set of Playwright harnesses (`*.mjs`) written during the build.
They seed data directly into the page globals, so they run without Supabase.
Useful ones: `ct.mjs` contacts, `verify4.mjs` the add-conference drawer and all
three field mode stages, `typ2.mjs` typing and focus, `chip.mjs` chip selection,
`ovf.mjs` horizontal overflow, `mob.mjs` mobile.

```
node ct.mjs
```

Chromium is at `/opt/pw-browsers/chromium` in the cloud sandbox. Every harness
prints `errors: 0` at the end if no JS threw. **Run them after any CSS change**,
because several past bugs were pure CSS that silently broke behaviour.

### Ship a change

1. Edit the files in `~/claude Job Hunt/grain-conference-intelligence`
2. Commit (you may run `git commit`)
3. **Stop there.** Shira clicks Push origin in GitHub Desktop herself.
4. GitHub Pages rebuilds in about a minute. She hard refreshes with Cmd+Shift+R.

If git fails with "cannot lock ref" or "Another git process seems to be
running", there is a stale `.git/HEAD.lock` or `.git/index.lock`. Delete them.

Batch your changes into rounds. Do not hand her one file at a time.

## 9. Useful skills in her account

She has the `taste-skill` plugin installed. `taste-skill:redesign-skill` is
built for exactly this job: audit an existing site, find the generic patterns,
raise the quality without breaking behaviour. `taste-skill:minimalist-skill`
matches the Notion direction she asked for. Read one before starting rather
than designing from instinct.

`anthropic-skills:avoid-ai-writing` is the one she used on the copy. If you
touch any user-facing text, run it.

## 10. Still open, not yours

Listed so you do not trip over them or duplicate work.

- n8n: three credentials to attach, six flows to activate, `n8n_base` to set in
  Settings
- The n8n API key needs rotating
- `README.md` and `VIDEO-SCRIPT.md` both still describe a Signal Miner tab that
  was removed, and both contain em dashes
- The video has not been recorded
