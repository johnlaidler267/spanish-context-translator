import type { PageSplitLimits } from "@/lib/translate/types"

/** `groq` (default) or `gemini` — set `VITE_TRANSLATION_LLM_PROVIDER` in `.env`. */
export function translationProvider(): "groq" | "gemini" {
  const v = (import.meta.env.VITE_TRANSLATION_LLM_PROVIDER as string | undefined)?.trim().toLowerCase()
  return v === "gemini" ? "gemini" : "groq"
}

const GROQ_TRANSLATE_MODEL = "llama-3.3-70b-versatile"
const GROQ_LEARN_MODEL = "llama-3.1-8b-instant" as const
/** Must match a model id from the Generative Language API (see ListModels / Gemini docs). `gemini-3.0-flash` is not valid — use e.g. `gemini-2.0-flash` or `gemini-3-flash` if your project lists it. */
const GEMINI_TRANSLATE_MODEL_DEFAULT = "gemini-2.5-flash-lite"
const GEMINI_LEARN_MODEL_DEFAULT = "gemini-2.5-flash-lite"

export function translateModel(): string {
  if (translationProvider() === "gemini") {
    return (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || GEMINI_TRANSLATE_MODEL_DEFAULT
  }
  return GROQ_TRANSLATE_MODEL
}

export function learnModel(): string {
  if (translationProvider() === "gemini") {
    return (import.meta.env.VITE_GEMINI_MODEL_LEARN as string | undefined)?.trim() || GEMINI_LEARN_MODEL_DEFAULT
  }
  return GROQ_LEARN_MODEL
}

/** For Settings UI — reflects `VITE_TRANSLATION_LLM_PROVIDER` and Gemini model env at build time. */
export function getTranslationLlmDisplayInfo(): {
  provider: "groq" | "gemini"
  translateModel: string
  learnModel: string
} {
  return {
    provider: translationProvider(),
    translateModel: translateModel(),
    learnModel: learnModel(),
  }
}

/**
 * Groq on_demand counts roughly (prompt tokens + max_tokens) against a low TPM
 * ceiling (~8k). Our chunking user prompt is long; 12k max_tokens was ~13k+ “requested”
 * and always tripped TPM — unrelated to how short the user’s Spanish is.
 * 4k further reduces “requested” TPM vs 5k; if you still see 429s, wait or upgrade Groq.
 */
export const TRANSLATE_MAX_COMPLETION_TOKENS = 8000

/**
 * Spanish character budget for a single `translatePageText` completion.
 * {@link PageSplitLimits.maxChars} comes from viewport fill and can be several thousand; per-word
 * chunk JSON is far larger than the source, so one “screen-sized” paste must not always mean one API call.
 * Tune down if `finish_reason: length` or long plain tails persist; up slightly if article pages feel too fragmented.
 */
export const LLM_CHUNK_INPUT_CHAR_CAP = 1800

/** Clamp DOM-measured {@link PageSplitLimits} so each batch stays within {@link LLM_CHUNK_INPUT_CHAR_CAP}. */
export function clampPageLimitsForLlmBatching(limits: PageSplitLimits): PageSplitLimits {
  return {
    maxWords: limits.maxWords,
    maxChars: Math.min(limits.maxChars, LLM_CHUNK_INPUT_CHAR_CAP),
  }
}
