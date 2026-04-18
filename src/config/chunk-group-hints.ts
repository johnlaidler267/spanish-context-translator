/**
 * Substring-driven chunk hints for the translation LLM.
 *
 * Flow: page text is normalized to single spaces (same as the TEXT block in the prompt).
 * For each entry, we check `normalizedText.includes(substring)`. Only strings that match
 * are listed in the prompt appendix as a JSON array.
 */

/** Edit this list: each string is a substring to look for in the text. */
export const CHUNK_SUBSTRING_RULES: string[] = [
  "darse cuenta de que",
  "por supuesto",
  "a pesar de",
  "de vez en cuando",
  "sin embargo",
  "en cuanto a",
  "hace falta",
  "al cabo de",
  "cada día más",
  "antes de que",
  "a su alrededor",
  "algo de",
  "asalta en",
  "Dar ganas de",
]

/** Substrings from {@link CHUNK_SUBSTRING_RULES} that appear in `canonical`, in config order. */
export function substringChunkRulesMatching(canonical: string): string[] {
  const hits: string[] = []
  for (const sub of CHUNK_SUBSTRING_RULES) {
    if (!sub || !canonical.includes(sub)) continue
    hits.push(sub)
  }
  return hits
}

/**
 * Prompt appendix when at least one substring matched.
 * Appends a JSON array of the matching substrings only.
 */
export function formatSubstringChunkRulesForPrompt(canonical: string): string {
  const hits = substringChunkRulesMatching(canonical)
  if (hits.length === 0) return ""

  const block = `Examples of things that should be grouped (each string below appears in the TEXT; emit that span as a single chunk with appropriate m and l):

${JSON.stringify(hits)}`
  console.log("[chunk-group-hints] substring prompt appendix:\n", block)
  return block
}
