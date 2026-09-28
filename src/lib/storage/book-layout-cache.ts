/**
 * On-device cache of a book's finished page layout, so reopening a book you've already been
 * reading skips straight to your page instead of sitting behind the loading overlay.
 *
 * Why: opening a book re-downloads its whole text and then re-paginates it from scratch --
 * the real-DOM fit pass (reflowPagesForRealFit) measures every page of the book, which is
 * ~1-2s for a full novel on a phone, every single open. None of that changes between opens on
 * the same device and screen size, so the first open saves the result here and later opens
 * reuse it without touching the network or the DOM.
 *
 * IndexedDB rather than localStorage: a novel's layout is a few MB, and localStorage's ~5MB
 * quota is already shared with the translation cache and the Discover catalog.
 *
 * A saved layout is only reused when all of these still match (otherwise it's a plain miss and
 * the normal load runs, then overwrites it):
 *   - the book itself (`version` -- the row's `updated_at`), so an edited book re-paginates;
 *   - the pagination code (`__PAGINATION_SOURCE_HASH__`, see vite.config.js), so a deploy that
 *     changes how pages are split never serves a layout the new code wouldn't produce;
 *   - the page box: mobile/desktop, exact width, the page-size estimate's limits, and a height
 *     at least as tall as the one it was built for (see `layoutFitsBox`).
 * Every read and write is best-effort: private mode, a blocked or full database, or an old
 * browser all just behave like a cache miss.
 */

export type BookLayout = {
  sents: string[]
  pages: string[][]
  topFillPaddingPx: number[]
  pageStartSentenceIndices: number[]
  /** Length of the source text, for the free plan's per-submission character check. */
  textLength: number
}

/** Everything about the current screen that the layout was built for. */
export type BookLayoutBox = {
  /** Mode, width, page-size limits and code version -- must match exactly. */
  signature: string
  /** Height of the page box; see layoutFitsBox. */
  heightPx: number
}

type StoredLayout = BookLayout & {
  key: string
  version: string
  signature: string
  heightPx: number
}

type RecencyRow = { key: string; lastUsedAt: number }

const DB_NAME = "lexa-book-layouts"
const DB_VERSION = 1
const LAYOUT_STORE = "layouts"
/** Kept apart from the layouts so eviction can read every book's timestamp without loading MBs of pages. */
const RECENCY_STORE = "recency"
/** A novel's layout is a few MB -- a dozen books is plenty for "the ones you're reading now". */
const MAX_CACHED_BOOKS = 12

/**
 * Mobile browsers grow and shrink the viewport as their address bar hides and shows, so the
 * height a book was paginated at drifts a little from open to open. A layout built for a
 * slightly *shorter* box still fits (pages just end a touch early), so it's reused within this
 * much; a taller-built layout could overflow a shorter box, so that's always a miss.
 */
const HEIGHT_TOLERANCE_PX = 96

export function bookLayoutSignature(parts: {
  isMobile: boolean
  widthPx: number
  maxWords: number
  maxChars: number
}): string {
  return [
    __PAGINATION_SOURCE_HASH__,
    parts.isMobile ? "m" : "d",
    Math.round(parts.widthPx),
    parts.maxWords,
    parts.maxChars,
  ].join("|")
}

export function layoutFitsBox(saved: { signature: string; heightPx: number }, box: BookLayoutBox): boolean {
  if (saved.signature !== box.signature) return false
  const extra = Math.round(box.heightPx) - saved.heightPx
  return extra >= 0 && extra <= HEIGHT_TOLERANCE_PX
}

function cacheKey(ownerId: string, contentId: string): string {
  return `${ownerId}:${contentId}`
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null)
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(LAYOUT_STORE)) db.createObjectStore(LAYOUT_STORE, { keyPath: "key" })
        if (!db.objectStoreNames.contains(RECENCY_STORE)) db.createObjectStore(RECENCY_STORE, { keyPath: "key" })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function requestResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** The saved layout for this book, if it was built for this version of it and fits this box. */
export async function readBookLayout(
  ownerId: string,
  contentId: string,
  version: string,
  box: BookLayoutBox,
): Promise<BookLayout | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const key = cacheKey(ownerId, contentId)
    const tx = db.transaction(LAYOUT_STORE, "readonly")
    const saved = (await requestResult(tx.objectStore(LAYOUT_STORE).get(key))) as StoredLayout | undefined
    if (!saved || saved.version !== version || !layoutFitsBox(saved, box)) return null
    void touch(db, key)
    return {
      sents: saved.sents,
      pages: saved.pages,
      topFillPaddingPx: saved.topFillPaddingPx,
      pageStartSentenceIndices: saved.pageStartSentenceIndices,
      textLength: saved.textLength,
    }
  } catch {
    return null
  }
}

async function touch(db: IDBDatabase, key: string): Promise<void> {
  try {
    const tx = db.transaction(RECENCY_STORE, "readwrite")
    tx.objectStore(RECENCY_STORE).put({ key, lastUsedAt: Date.now() } satisfies RecencyRow)
    await transactionDone(tx)
  } catch {
    /* best-effort */
  }
}

/** Saves (or replaces) this book's layout, then drops the least recently opened beyond the cap. */
export async function writeBookLayout(
  ownerId: string,
  contentId: string,
  version: string,
  box: BookLayoutBox,
  layout: BookLayout,
): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    const key = cacheKey(ownerId, contentId)
    const row: StoredLayout = {
      ...layout,
      key,
      version,
      signature: box.signature,
      heightPx: Math.round(box.heightPx),
    }
    const tx = db.transaction([LAYOUT_STORE, RECENCY_STORE], "readwrite")
    tx.objectStore(LAYOUT_STORE).put(row)
    tx.objectStore(RECENCY_STORE).put({ key, lastUsedAt: Date.now() } satisfies RecencyRow)
    await transactionDone(tx)
    await evictOldest(db)
  } catch {
    /* quota / private mode -- the next open just paginates again */
  }
}

async function evictOldest(db: IDBDatabase): Promise<void> {
  const readTx = db.transaction(RECENCY_STORE, "readonly")
  const rows = (await requestResult(readTx.objectStore(RECENCY_STORE).getAll())) as RecencyRow[]
  if (rows.length <= MAX_CACHED_BOOKS) return
  const stale = rows.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(MAX_CACHED_BOOKS)
  const tx = db.transaction([LAYOUT_STORE, RECENCY_STORE], "readwrite")
  for (const { key } of stale) {
    tx.objectStore(LAYOUT_STORE).delete(key)
    tx.objectStore(RECENCY_STORE).delete(key)
  }
  await transactionDone(tx)
}

/** Drops a book's saved layout, e.g. when the book is deleted from the library. */
export async function deleteBookLayout(ownerId: string, contentId: string): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    const key = cacheKey(ownerId, contentId)
    const tx = db.transaction([LAYOUT_STORE, RECENCY_STORE], "readwrite")
    tx.objectStore(LAYOUT_STORE).delete(key)
    tx.objectStore(RECENCY_STORE).delete(key)
    await transactionDone(tx)
  } catch {
    /* best-effort */
  }
}
