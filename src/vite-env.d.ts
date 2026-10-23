/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (e.g. https://xxxx.supabase.co). Enables accounts +
   *  runtime Cloud sync. Cloud mode is entitlement-driven (no VITE_BACKEND flag). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/public key. Safe to ship to the browser — security is
   *  enforced by Row-Level Security in the database, not by hiding this key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "true" to show in-app purchase buttons AND activate cosmetic gating. */
  readonly VITE_BILLING_ENABLED?: string;
  /** Google OAuth client ID for the desktop (installed-app) Calendar sync.
   *  Uses PKCE, so there is no client secret and this is safe to ship. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** URL of the hosted web app (the /app/ deployment). Desktop opens it in the
   *  system browser for browser-based sign-in. Defaults to the Pages URL. */
  readonly VITE_WEB_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
