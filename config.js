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

/* n8n webhook base. The flows that need a server, AI calls, enrichment,
   HubSpot, hang off this. Left blank, the app falls back to demo responses
   so nothing dead-ends. */
const N8N_BASE = localStorage.getItem("n8n_base") || "";
