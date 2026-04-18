export type {
  PageSentenceRange,
  PageSplitLimits,
  RawChunk,
  ReconciledChapter,
  ReconciledChunk,
  ReconciledItem,
  ReconciledText,
  ReadSentence,
  RomanChapterMarker,
} from "@/lib/translate/types"

export {
  getTranslationLlmDisplayInfo,
  LLM_CHUNK_INPUT_CHAR_CAP,
  clampPageLimitsForLlmBatching,
} from "@/lib/translate/llm-settings"

export {
  gapBetweenReconciledChunks,
  coalesceGlueablePunctuationReconciledItems,
  splitIntoSentences,
} from "@/lib/translate/chunk-reconcile"

export { stripStandaloneRomanChapterLines } from "@/lib/translate/roman-chapters"

export {
  PAGE_SIZE_WORDS_DESKTOP,
  PAGE_SIZE_WORDS_MOBILE,
  buildSentencePages,
  dedupeConsecutiveDuplicateLines,
  mergeArticlePagesIfWholeTextFitsLimits,
  pageCharCapForWordLimit,
  pageSourceText,
  resolvePageSplitLimits,
  splitSegmentIntoPageParts,
  splitSourceIntoSentences,
} from "@/lib/translate/page-split"

export { translatePageText } from "@/lib/translate/translate-page"

export {
  READ_MODE_CHARS_PER_STEP_DESKTOP,
  READ_MODE_CHARS_PER_STEP_MOBILE,
  countConsecutiveLoadedPages,
  cumulativePageSentenceRanges,
  mergeReconciledPagesToSentences,
  pageStepRangesFromSentences,
  sentenceCountsPerReconciledPage,
  subdivideReadStepsForDesktop,
  subdivideReadStepsForMobile,
} from "@/lib/translate/read-mode"

export { translate } from "@/lib/translate/translate-entry"

export { appendTranscriptToField, transcribeAudioWithGroq } from "@/lib/translate/transcription"

export { fetchLearnRandomParagraph, generateRandomSpanish } from "@/lib/translate/learn-random"
