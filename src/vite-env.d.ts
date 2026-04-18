/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `groq` (default) or `gemini` — which backend translates + learn flows use. */
  readonly VITE_TRANSLATION_LLM_PROVIDER?: string
  /** Gemini model id when `VITE_TRANSLATION_LLM_PROVIDER=gemini` (must match Edge allowlist). */
  readonly VITE_GEMINI_MODEL?: string
  readonly VITE_GEMINI_MODEL_LEARN?: string
  /** Set to "true" in `.env` / `.env.local` to run usage preflight + plan-limit modal while `npm run dev`. */
  readonly VITE_ENFORCE_USAGE_IN_DEV?: string
  /** Set to `1` to draw the red inset column frame in article + read mode (also on in `npm run dev`). */
  readonly VITE_SHOW_READING_BOUNDS?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_STRIPE_PRICE_PRO_MONTHLY?: string
  readonly VITE_STRIPE_PRICE_PRO_ANNUAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
