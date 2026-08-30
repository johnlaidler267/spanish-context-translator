import { splitIntoSentences } from "@/lib/translate/chunk-reconcile"
import type { ReconciledItem } from "@/lib/translate/types"
import { translatePageText } from "@/lib/translate/translate-page"

export async function translate(
  input: string,
): Promise<{ reconciled: ReconciledItem[]; sentences: ReturnType<typeof splitIntoSentences> }> {
  const reconciled = await translatePageText(input)
  const sentences = splitIntoSentences(reconciled)
  return { reconciled, sentences }
}
