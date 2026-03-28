/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GROQ_API_KEY?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_STRIPE_PRICE_PRO_MONTHLY?: string
  readonly VITE_STRIPE_PRICE_PRO_ANNUAL?: string
  readonly VITE_STRIPE_PRICE_UNLIMITED_MONTHLY?: string
  readonly VITE_STRIPE_PRICE_UNLIMITED_ANNUAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
