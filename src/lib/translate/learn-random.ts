import { getStoredLanguageLearningPreferences } from "@/lib/language-learning-preferences"
import {
  fetchChatCompletion,
  parseChatJsonErrorBody,
  stringifyMessageContent,
  throwChatHttpError,
} from "@/lib/translate/chat-completion"
import { learnParagraphUserPrompt, randomShortParagraphUserPrompt } from "@/lib/translate/chunk-sort-prompt"
import { learnModel } from "@/lib/translate/llm-settings"

/**
 * Random ~3–5-sentence paragraph in the language from General settings (“I’m learning”).
 * Uses {@link learnModel} (not the main translate model): the translate model on Groq can
 * truncate mid-sentence when `max_tokens` is tight.
 */
export async function generateRandomLearningParagraph(): Promise<string> {
  const learning = getStoredLanguageLearningPreferences().learning
  const res = await fetchChatCompletion({
    model: learnModel(),
    messages: [{ role: "user", content: randomShortParagraphUserPrompt(learning) }],
    temperature: 1.5,
    max_tokens: 800,
  })

  if (!res.ok) {
    const detail = await parseChatJsonErrorBody(res)
    throwChatHttpError(res, detail)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const out = stringifyMessageContent(data.choices?.[0]?.message?.content)
  if (!out) throw new Error("Empty response from language model.")
  return out
}

const LEARN_RANDOM_MAX_WORDS = 100

function truncateLearnParagraphToWordLimit(text: string, maxWords: number): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return normalized
  return `${words.slice(0, maxWords).join(" ")}…`
}

/**
 * Learn pill: topic paragraph via the configured learn model (~75–100 words) in your
 * settings “I’m learning” language. Replaces the former Wikipedia featured-article fetch.
 */
export async function fetchLearnRandomParagraph(): Promise<string> {
  const learning = getStoredLanguageLearningPreferences().learning
  const res = await fetchChatCompletion({
    model: learnModel(),
    messages: [{ role: "user", content: learnParagraphUserPrompt(learning) }],
    temperature: 1.5,
    max_tokens: 500,
  })

  if (!res.ok) {
    const detail = await parseChatJsonErrorBody(res)
    throwChatHttpError(res, detail)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const raw = stringifyMessageContent(data.choices?.[0]?.message?.content)
  if (!raw?.trim()) throw new Error("Empty response from language model.")
  const intro = truncateLearnParagraphToWordLimit(raw, LEARN_RANDOM_MAX_WORDS)
  if (intro.length < 40) {
    throw new Error("Could not generate a paragraph. Please try again.")
  }
  return intro
}
