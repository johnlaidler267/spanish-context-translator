import type { ReconciledItem } from "@/lib/translate"

/**
 * Per-page translation cache shared by Article and Read modes.
 * Failed pages are not stored as data — use getError + clearPage to retry.
 */
export class TranslationCache {
  private resolved = new Map<number, ReconciledItem[]>()
  private errors = new Map<number, string>()
  private inFlight = new Map<number, Promise<ReconciledItem[]>>()

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

    const p = translateFn(pageText)
      .then((items) => {
        this.resolved.set(index, items)
        this.errors.delete(index)
        this.inFlight.delete(index)
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
