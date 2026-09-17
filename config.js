/* ──────────────────────────────────────────────────────────────────────────
   Supabase connection.

   The anon key below is PUBLIC BY DESIGN. It identifies the project, it does
   not grant access, Row Level Security decides what any given caller can
   read or write. Committing it is normal and intended.

   The service_role key is the opposite: it bypasses RLS entirely. It is not
   here, it is not anywhere in this repo, and it lives only in n8n's
   credential store.
   ────────────────────────────────────────────────────────────────────────── */
const SUPABASE_URL  = "https://toussjkyjkbcuytaadmq.supabase.co";
const SUPABASE_ANON = "sb_publishable_G6NK5cDOiz4p_1ihX180WA_cUfoh2hb";

/* n8n webhook base. The flows that need a server, AI calls, conference
   discovery, the HubSpot write, hang off this.

   The address below is NOT a credential. It is a public endpoint, the same
   kind of thing as the Supabase project URL above. Every actual secret, the
   Anthropic key, the HubSpot private app token, the Supabase service_role
   key, lives in that n8n instance's credential store and is never sent to a
   browser. That is the whole reason the calls are relayed rather than made
   from this page.

   It ships filled in so the AI features are live the moment someone opens
   the site, with nothing to paste. Settings overrides it: type your own n8n
   URL to point elsewhere, or clear the field to fall back to the written
   demo responses. An empty saved value wins over this default, which is why
   the read below distinguishes "cleared" from "never set". */
const N8N_DEFAULT = "https://admin-n8n.optimally-ai.com";

function n8nBase() {
  const saved = localStorage.getItem("n8n_base");
  const base = saved === null ? N8N_DEFAULT : saved;
  return (base || "").replace(/\/+$/, "");
}

const N8N_BASE = n8nBase();
