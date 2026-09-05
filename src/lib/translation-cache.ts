import type { User } from "@supabase/supabase-js"
import { isRetryableTranslationFailure } from "@/lib/api-errors"
import type { ReconciledItem } from "@/lib/translate"
import {
  getCachedTranslationPage,
  setCachedTranslationPage,
} from "@/lib/storage/translation-cache-storage"

const AUTO_RETRY_DELAYS_MS = [0, 900, 2200, 4500] as const
const AUTO_RETRY_MAX_ATTEMPTS = AUTO_RETRY_DELAYS_MS.length

async function translateWithAutoRetries(
  translateOnce: () => Promise<ReconciledItem[]>,
): Promise<ReconciledItem[]> {
  let lastErr: unknown
  for (let attempt = 0; attempt < AUTO_RETRY_MAX_ATTEMPTS; attempt++) {
    const delay = AUTO_RETRY_DELAYS_MS[attempt] ?? 0
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    try {
      return await translateOnce()
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (
        attempt < AUTO_RETRY_MAX_ATTEMPTS - 1 &&
        isRetryableTranslationFailure(msg)
      ) {
        continue
      }
      throw e
    }
  }
  throw lastErr
}

/** Identifies which localStorage-backed cache entry (see translation-cache-storage.ts) this
 *  in-memory TranslationCache should read from / write through to, if any. Omitted entirely
 *  (no persistence) for a session with nothing stable to key by. */
export interface TranslationCachePersistOptions {
  user: User | null
  cacheKey: string
}

/**
 * Per-page translation cache shared by Article and Read modes.
 * Failed pages are not stored as data — use getError + clearPage to retry.
 *
 * Optionally backed by a localStorage-persisted L2 cache (see translation-cache-storage.ts):
 * pass `persist` and a page that isn't in memory yet is checked there before falling back to
 * translating it, and a freshly-translated page is written there so it survives this
 * TranslationCache instance being thrown away (every `handleTextSubmit` in App.tsx creates a
 * new one) and a full page reload / new browser session on top of that.
 */
export class TranslationCache {
  private resolved = new Map<number, ReconciledItem[]>()
  private errors = new Map<number, string>()
  private inFlight = new Map<number, Promise<ReconciledItem[]>>()
  private readonly persist: TranslationCachePersistOptions | null

  constructor(persist: TranslationCachePersistOptions | null = null) {
    this.persist = persist
  }

  getPage(index: number): ReconciledItem[] | null {
    return this.resolved.get(index) ?? null
  }

  setPage(index: number, chunks: ReconciledItem[]): void {
    this.errors.delete(index)
    this.resolved.set(index, chunks)
  }

  getError(index: number): string | undefined {
    return this.errors.get(index)
  }

  isLoading(index: number): boolean {
    return this.inFlight.has(index)
  }

  /** Remove success, error, and any stale in-flight entry (for retry). */
  clearPage(index: number): void {
    this.resolved.delete(index)
    this.errors.delete(index)
    this.inFlight.delete(index)
  }

  /**
   * Cache hit → immediate resolve.
   * In-flight → same promise for duplicate callers.
   * On failure: page is marked errored (not cached); re-throws.
   */
  loadPage(
    index: number,
    pageText: string,
    translateFn: (text: string) => Promise<ReconciledItem[]>,
  ): Promise<ReconciledItem[]> {
    const hit = this.resolved.get(index)
    if (hit) return Promise.resolve(hit)

    const existing = this.inFlight.get(index)
    if (existing) return existing

    // L2 cache: a page translated in an earlier session for the same content. Only used when
    // its stored text hash still matches this exact page's source text (page-splitting can
    // shift page boundaries between sessions, e.g. a different viewport) -- a mismatch just
    // falls through to translating it fresh rather than showing the wrong text.
    if (this.persist) {
      const persisted = getCachedTranslationPage(this.persist.user, this.persist.cacheKey, index, pageText)
      if (persisted) {
        this.resolved.set(index, persisted)
        return Promise.resolve(persisted)
      }
    }

    const p = translateWithAutoRetries(() => translateFn(pageText))
      .then((items) => {
        this.resolved.set(index, items)
        this.errors.delete(index)
        this.inFlight.delete(index)
        if (this.persist) {
          setCachedTranslationPage(this.persist.user, this.persist.cacheKey, index, pageText, items)
        }
        return items
      })
      .catch((e) => {
        this.inFlight.delete(index)
        this.resolved.delete(index)
        const msg = e instanceof Error ? e.message : String(e)
        this.errors.set(index, msg)
        throw e
      })

    this.inFlight.set(index, p)
    return p
  }
}
