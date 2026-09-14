# Getting it live on GitHub Pages

Roughly ten minutes, all in the browser, no command line.

1. Go to **github.com/new**. Name it `grain-conference-intelligence`. Set it to **Public**
   (Pages needs public on a free account). Don't add a README — you already have one.
   Create the repository.

2. On the empty repo page click **uploading an existing file**.

3. Drag in these, all at once:
   `index.html`, `styles.css`, `engine.js`, `ai.js`, `demo.js`, `app.js`,
   `README.md`, `VIDEO-SCRIPT.md`
   Then drag the **`data` folder** in as well (GitHub keeps the folder structure).
   Commit.

4. **Settings → Pages.** Source: *Deploy from a branch*. Branch: `main`, folder: `/ (root)`. Save.

5. Wait about a minute, then refresh the Pages settings screen. Your URL will be
   `https://<your-username>.github.io/grain-conference-intelligence/`

6. Open it. Check all five tabs load. Add your API key in Settings and press **Test the key**.

7. Paste that URL into the README's `**Live:**` line (edit `README.md` right in GitHub), and
   send them the Pages URL plus the repo URL.

**Don't commit your API key.** It's never in the source — it lives in your browser's
localStorage after you type it into Settings.

**Updating the conference list later** — this is worth saying on camera. Open
`data/conferences.js` in GitHub, click the pencil, edit a block, commit. The site updates itself
in about a minute. No build step, no developer.
