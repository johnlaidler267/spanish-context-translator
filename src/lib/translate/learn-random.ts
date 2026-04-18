import {
  fetchChatCompletion,
  parseChatJsonErrorBody,
  stringifyMessageContent,
  throwChatHttpError,
} from "@/lib/translate/chat-completion"
import { learnModel } from "@/lib/translate/llm-settings"

export async function generateRandomSpanish(): Promise<string> {
  /**
   * Use `learnModel()` (not the main translate model): the translate model on Groq is a
   * reasoning model whose hidden reasoning shares the completion budget — with a low
   * `max_tokens` the visible paragraph was often truncated mid-sentence. The learn stack
   * is already used for similar short Spanish generation (Learn pill) without that issue.
   */
  const res = await fetchChatCompletion({
    model: learnModel(),
    messages: [
      {
        role: "user",
        content: `Write one short paragraph in natural Spanish (about 3–5 sentences).

You choose the topic, setting, tone, and register freely — fiction, opinion, dialogue, description, anything. Be creative and make each response feel different when asked again.

Use idiomatic Spanish. Return only the Spanish paragraph: no title, no translation, no explanation, no quotation marks around the whole text.`,
      },
    ],
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

const LEARN_PARAGRAPH_PROMPT = `Pick a random subject from this list, then pick a specific topic within that subject entirely on your own. Write a single paragraph of 75–100 words about it.

Subjects:
- Physics
- Mathematics
- Philosophy
- Psychology
- History
- Linguistics
- Biology
- Neuroscience
- Economics
- Astronomy
- Anthropology
- Logic

Do not always pick the same subject or the same kinds of topics. Vary widely across runs.

Write in plain, engaging prose. No bullet points in the paragraph. Assume the reader is intelligent but not an expert. End on something that makes them want to know more.

Write the entire paragraph in Spanish.

Return only the Spanish paragraph: no title, no translation, no explanation, no quotation marks around the whole text.`

const LEARN_RANDOM_MAX_WORDS = 100

function truncateLearnParagraphToWordLimit(text: string, maxWords: number): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return normalized
  return `${words.slice(0, maxWords).join(" ")}…`
}

/**
 * Learn pill: topic paragraph via the configured learn model (Spanish, ~75–100 words).
 * Replaces the former Spanish Wikipedia featured-article fetch.
 */
export async function fetchLearnRandomParagraph(): Promise<string> {
  const res = await fetchChatCompletion({
    model: learnModel(),
    messages: [{ role: "user", content: LEARN_PARAGRAPH_PROMPT }],
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
    throw new Error("No se pudo generar un párrafo. Inténtalo de nuevo.")
  }
  return intro
}
