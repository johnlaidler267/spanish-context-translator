/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" in `.env` / `.env.local` to run usage preflight + plan-limit modal while `npm run dev`. */
  readonly VITE_ENFORCE_USAGE_IN_DEV?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_STRIPE_PRICE_PRO_MONTHLY?: string
  readonly VITE_STRIPE_PRICE_PRO_ANNUAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
