import { jsonrepair } from "jsonrepair"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = "openai/gpt-oss-120b"

const PROMPT = (input: string) => `You are a Spanish language expert helping an English speaker understand Spanish text deeply.

You will break the input text into chunks so the reader can hover each one in sequence and mentally assemble the English sentence as they go — like translating in their own head, chunk by chunk.

For each chunk return:
- "chunk": the original Spanish text
- "meaning": the natural English equivalent in the context of this specific sentence
- "literal": word-for-word translation, even if unnatural
- "note": a brief grammatical explanation for non-obvious chunks — null if the chunk is straightforward

DEFAULT: Usually, words should be seperated individually, or in the smallest logical group. Only group when the words make more sense together.

Study these examples carefully and match this behavior exactly:

INPUT: "El siempre cerraba la puerta, como hacía siempre que la llamaba."
OUTPUT: [
  { "chunk": "El", "meaning": "He", "literal": "He", "note": null },
  { "chunk": "siempre", "meaning": "always", "literal": "always", "note": null },
  { "chunk": "cerraba", "meaning": "closed", "literal": "closed", "note": null },
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "puerta", "meaning": "door", "literal": "door", "note": null },
  { "chunk": ",", "meaning": ",", "literal": ",", "note": null },
  { "chunk": "como", "meaning": "as", "literal": "as", "note": null },
  { "chunk": "hacía", "meaning": "he always did", "literal": "did", "note": null },
  { "chunk": "siempre", "meaning": "whenever", "literal": "always", "note": null },
  { "chunk": "que", "meaning": "that", "literal": "that", "note": null },
  { "chunk": "la", "meaning": "[to] her", "literal": "the", "note": null },
  { "chunk": "llamaba", "meaning": "[he] called", "literal": "called", "note": null }
]
- note: wrap any English word in [] if it has no corresponding Spanish word in the chunk. Whether that's an implied pronoun, a preposition absorbed into context, or a grammatical particle that just doesn't exist in Spanish.

INPUT: "bajo pena de perjurio ante el Senado"
OUTPUT: [
  { "chunk": "bajo", "meaning": "under", "literal": "under", "note": null },
  { "chunk": "pena", "meaning": "penalty", "literal": "penalty", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "perjurio", "meaning": "perjury", "literal": "perjury", "note": null },
  { "chunk": "ante", "meaning": "before", "literal": "before", "note": null },
  { "chunk": "el", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "Senado", "meaning": "Senate", "literal": "Senate", "note": null }
]

INPUT: "Wendy se ha enfrentado a una campaña publicitaria"
OUTPUT: [
  { "chunk": "Wendy", "meaning": "Wendy", "literal": "Wendy", "note": "person's name" },
  { "chunk": "se", "meaning": "herself", "literal": "herself", "note": "Reflexive pronoun — indicates the subject is acting on herself." },
  { "chunk": "ha", "meaning": "has", "literal": "has", "note": null },
  { "chunk": "enfrentado", "meaning": "faced", "literal": "confronted", "note": null },
  { "chunk": "a", "meaning": "to", "literal": "to", "note": null },
  { "chunk": "una", "meaning": "a", "literal": "a", "note": null },
  { "chunk": "campaña publicitaria", "meaning": "advertising campaign", "literal": "publicity campaign", "note": null }
]

INPUT: "en las redes sociales el jueves"
OUTPUT: [
  { "chunk": "en", "meaning": "on", "literal": "in", "note": "\"en\" means \"on\" here, not \"in\" — context of social media changes the preposition." },
  { "chunk": "las", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "redes sociales", "meaning": "social media", "literal": "social networks", "note": null },
  { "chunk": "el jueves", "meaning": "on Thursday", "literal": "the Thursday", "note": "\"el\" before a day of the week means \"on\" in English, not \"the\"." }
]

INPUT: "era poco probable que"
OUTPUT: [
  { "chunk": "era", "meaning": "was", "literal": "was", "note": null },
  { "chunk": "poco probable que", "meaning": "unlikely that", "literal": "little probable that", "note": null }
]

INPUT: "dar su brazo a torcer"
OUTPUT: [
  { "chunk": "dar su brazo a torcer", "meaning": "to give in", "literal": "to give its arm to twist", "note": null },
]

INPUT: "Nos vamos campeones"
OUTPUT: [
  { "chunk": "Nos vamos", "meaning": "we're leaving", "literal": "we are leaving", "note": null },
  { "chunk": "campeones", "meaning": "[as] champions", "literal": "champions", "note": null }
]
note: wrap any English word in [] if it has no corresponding Spanish word in the chunk. Whether that's an implied pronoun, a preposition absorbed into context, or a grammatical particle that just doesn't exist in Spanish.

INPUT: "insistiera"
OUTPUT: [
  { "chunk": "insistiera", "meaning": "would insist", "literal": "would insist", "note": null }
]

INPUT: "no debe"
OUTPUT: [
  { "chunk": "no debe", "meaning": "should not", "literal": "should not", "note": null }
]

INPUT: "antes que encontrarse"
OUTPUT: [
  { "chunk": "antes que", "meaning": "before", "literal": "before", "note": null },
  { "chunk": "encontrarse", "meaning": "finding oneself", "literal": "to meet", "note": null }
]

INPUT: "su estado natal en cambio"
OUTPUT: [
  { "chunk": "su", "meaning": "her", "literal": "her", "note": null },
  { "chunk": "estado natal", "meaning": "home state", "literal": "native state", "note": null },
  { "chunk": "en cambio", "meaning": "on the other hand", "literal": "in change", "note": "Fixed expression — the individual words do not hint at this meaning." }
]

INPUT: "la casa en la que vivía"
OUTPUT: [
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "casa", "meaning": "house", "literal": "house", "note": null },
  { "chunk": "en la que", "meaning": "in which", "literal": "in the that", "note": "Relative clause connector — must be grouped, splitting produces nonsense." },
  { "chunk": "vivía", "meaning": "she lived", "literal": "was living", "note": null }
]

INPUT: "No se trata de respirar y trabajar"
OUTPUT: [
  { "chunk": "No", "meaning": "(It isn't)", "literal": "No", "note": null },
  { "chunk": "se trata de", "meaning": "about", "literal": "it treats itself of", "note": null },
  { "chunk": "respirar", "meaning": "breathing", "literal": "to breathe", "note": null },
  { "chunk": "y", "meaning": "and", "literal": "and", "note": null },
  { "chunk": "trabajar", "meaning": "working", "literal": "to work", "note": null }
]

INPUT: "para estar agradecidos por lo maravilloso que es la vida"
OUTPUT: [
  { "chunk": "para", "meaning": "in order to", "literal": "for", "note": null },
  { "chunk": "estar", "meaning": "be", "literal": "to be", "note": null },
  { "chunk": "agradecidos", "meaning": "grateful", "literal": "grateful", "note": null },
  { "chunk": "por", "meaning": "for", "literal": "for", "note": null },
  { "chunk": "lo maravilloso", "meaning": "how wonderful", "literal": "the wonderful", "note": "\"lo\" before an adjective followed by \"que\" means \"how\" — \"lo maravilloso que es\" = \"how wonderful it is\"." },
  { "chunk": "que", "meaning": "(that)", "literal": "that", "note": null },
  { "chunk": "es", "meaning": "is", "literal": "is", "note": null },
  { "chunk": "la", "meaning": "(in)", "literal": "the", "note": null },
  { "chunk": "vida", "meaning": "life", "literal": "life", "note": null }
]

INPUT: "así mismo como tuve mis bajas"
OUTPUT: [
  { "chunk": "así mismo", "meaning": "likewise", "literal": "thus same", "note": "Fixed expression — must be grouped. Means \"likewise\" or \"also\"." },
  { "chunk": "como", "meaning": "as", "literal": "as", "note": null },
  { "chunk": "tuve", "meaning": "I had", "literal": "I had", "note": null },
  { "chunk": "mis", "meaning": "my", "literal": "my", "note": null },
  { "chunk": "bajas", "meaning": "lows", "literal": "lows", "note": null }
]

INPUT: "lo que"
OUTPUT: [
  { "chunk": "lo que", "meaning": "what", "literal": "what", "note": null }
]

INPUT: "había dado su visto bueno a una serie de declaraciones"
OUTPUT: [
  { "chunk": "había", "meaning": "had", "literal": "had", "note": null },
  { "chunk": "dado", "meaning": "given", "literal": "given", "note": null },
  { "chunk": "su", "meaning": "his", "literal": "his", "note": null },
  { "chunk": "visto bueno", "meaning": "approval", "literal": "good sight", "note": "Fixed expression — neither word alone suggests \"approval\"." },
  { "chunk": "a", "meaning": "to", "literal": "to", "note": null },
  { "chunk": "una", "meaning": "a", "literal": "a", "note": null },
  { "chunk": "serie", "meaning": "series", "literal": "series", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "declaraciones", "meaning": "statements", "literal": "declarations", "note": null }
]

INPUT: "el miércoles dijo"
OUTPUT: [
  { "chunk": "el miércoles", "meaning": "on Wednesday", "literal": "the Wednesday", "note": "\"el\" before a day of the week means \"on\" in English, not \"the\"." },
  { "chunk": "dijo", "meaning": "he said", "literal": "said", "note": null }
]

INPUT: "obsesionados con mejorar su aspecto físico"
OUTPUT: [
  { "chunk": "obsesionados", "meaning": "obsessed", "literal": "obsessed", "note": null },
  { "chunk": "con", "meaning": "with", "literal": "with", "note": null },
  { "chunk": "mejorar", "meaning": "improving", "literal": "to improve", "note": null },
  { "chunk": "su", "meaning": "their", "literal": "their", "note": null },
  { "chunk": "aspecto físico", "meaning": "appearance", "literal": "aspect physical", "note": null },
]

INPUT: "la técnica de golpearse la cara"
OUTPUT: [
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "técnica", "meaning": "technique", "literal": "technique", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "golpearse", "meaning": "hitting oneself", "literal": "to hit oneself", "note": "Reflexive verb — \"se\" is attached to the infinitive, indicating the action is done to oneself." },
  { "chunk": "la", "meaning": "(in) the", "literal": "the", "note": null },
  { "chunk": "cara", "meaning": "face", "literal": "face", "note": null }
]

INPUT: "durante varias semanas del mismo modo"
OUTPUT: [
  { "chunk": "durante", "meaning": "for", "literal": "during", "note": null },
  { "chunk": "varias", "meaning": "several", "literal": "various", "note": null },
  { "chunk": "semanas", "meaning": "weeks", "literal": "weeks", "note": null },
  { "chunk": "del mismo modo", "meaning": "in the same way", "literal": "of the same mode", "note": "Fixed expression — must be grouped, the words together form a set phrase." }
]

INPUT: "se le conoce como"
OUTPUT: [
  { "chunk": "se le conoce", "meaning": "it is known", "literal": "itself it knows", "note": "Impersonal construction — neither \"se\" nor \"le\" carry their usual meaning here. Together they make the verb passive." },
  { "chunk": "como", "meaning": "as", "literal": "as", "note": null }
]

INPUT: "apoyo que me dieron"
OUTPUT: [
  { "chunk": "apoyo", "meaning": "support", "literal": "support", "note": null },
  { "chunk": "que", "meaning": "that", "literal": "that", "note": null },
  { "chunk": "me", "meaning": "(to) me", "literal": "me", "note": null },
  { "chunk": "dieron", "meaning": "(you all) gave", "literal": "gave", "note": null }
]

  INPUT: "para dejar a los miembros de la generación Z en gran medida apartados los unos de los otros, temerosos y solos"
OUTPUT: [
  { "chunk": "para", "meaning": "to", "literal": "for", "note": null },
  { "chunk": "dejar", "meaning": "leave", "literal": "to leave", "note": null },
  { "chunk": "a", "meaning": "", "literal": "to", "note": "Personal \"a\" — a grammatical marker used before human direct objects in Spanish. It has no English equivalent and is not translated." },
  { "chunk": "los", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "miembros", "meaning": "members", "literal": "members", "note": null },
  { "chunk": "de", "meaning": "of", "literal": "of", "note": null },
  { "chunk": "la", "meaning": "the", "literal": "the", "note": null },
  { "chunk": "generación Z", "meaning": "Generation Z", "literal": "Generation Z", "note": null },
  { "chunk": "en gran medida", "meaning": "largely", "literal": "in great measure", "note": "Fixed expression — must be grouped." },
  { "chunk": "apartados", "meaning": "isolated", "literal": "separated", "note": null },
  { "chunk": "los unos de los otros", "meaning": "from each other", "literal": "the ones from the others", "note": "Fixed expression — must be grouped. Individual words give no hint of the meaning \"each other\"." },
  { "chunk": "temerosos", "meaning": "fearful", "literal": "fearful", "note": null },
  { "chunk": "y", "meaning": "and", "literal": "and", "note": null },
  { "chunk": "solos", "meaning": "alone", "literal": "alone", "note": null }
]

Return only a valid JSON array, no preamble, no markdown fences.
Every word in the input must appear in the output. Do not stop early — complete the full array and close it with ].

Text: "${input}"`

export type RawChunk = {
  chunk: string
  meaning: string
  literal?: string
  note?: string
}

export type ReconciledChunk = {
  type: "chunk"
  chunk: string
  meaning: string
  literal?: string
  note?: string
}

export type ReconciledText = {
  type: "text"
  text: string
}

export type ReconciledItem = ReconciledChunk | ReconciledText

function reconcileChunks(
  chunks: RawChunk[],
  originalText: string
): ReconciledItem[] {
  const result: ReconciledItem[] = []
  let pos = 0

  for (const chunk of chunks) {
    const idx = originalText.indexOf(chunk.chunk, pos)
    if (idx === -1) {
      result.push({ type: "chunk", ...chunk })
      continue
    }
    if (idx > pos) {
      result.push({ type: "text", text: originalText.slice(pos, idx) })
    }
    result.push({ type: "chunk", ...chunk })
    pos = idx + chunk.chunk.length
  }

  if (pos < originalText.length) {
    result.push({ type: "text", text: originalText.slice(pos) })
  }

  return result
}

function splitIntoSentences(items: ReconciledItem[]) {
  const sentences: { id: number; chunks: Array<{ id: number; text: string; meaning: string; literal?: string; grammar?: string }> }[] = []
  let currentChunks: Array<{ id: number; text: string; meaning: string; literal?: string; grammar?: string }> = []
  let chunkId = 0

  for (const item of items) {
    if (item.type === "text") continue
    const chunkData = {
      id: chunkId++,
      text: item.chunk,
      meaning: item.meaning,
      literal: item.literal,
      grammar: item.note,
    }
    currentChunks.push(chunkData)
    const endsSentence = /[.!?]$/.test(item.chunk.trim())
    if (endsSentence && currentChunks.length > 0) {
      sentences.push({ id: sentences.length, chunks: currentChunks })
      currentChunks = []
    }
  }
  if (currentChunks.length > 0) {
    sentences.push({ id: sentences.length, chunks: currentChunks })
  }
  return sentences
}

export async function translate(
  input: string,
  apiKey: string
): Promise<{ reconciled: ReconciledItem[]; sentences: ReturnType<typeof splitIntoSentences> }> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: PROMPT(input) }],
      temperature: 0.2,
      max_tokens: 16000,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`
    )
  }

  const data = await res.json()
  let raw =
    data.choices?.[0]?.message?.content?.trim() ?? ""

  raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim()

  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("No JSON array found in response")

  const repaired = jsonrepair(match[0])
  const parsed: RawChunk[] = JSON.parse(repaired)
  const reconciled = reconcileChunks(parsed, input)
  const sentences = splitIntoSentences(reconciled)

  return { reconciled, sentences }
}
