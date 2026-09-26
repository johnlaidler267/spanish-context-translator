import { supabase } from "@/lib/supabase"
import { translateModel, translationProvider } from "@/lib/translate/llm-settings"
import type { ReconciledItem } from "@/lib/translate/types"

/**
 * Cross-user translation cache for Discover content (table: `translation_cache`, see
 * supabase/migrations/0026_shared_translation_cache.sql). The first reader of a given
 * translation batch (see translation-batches.ts) pays for the LLM call and stores the result;
 * every later reader of that batch -- on any device -- reuses it instead of re-translating.
 *
 * Everything here is best-effort: any cache read/write failure just falls through to
 * translating, exactly as if nothing were cached. The cache can make reading cheaper and
 * faster, never block it.
 */

/**
 * Bump when the chunking prompt, reconciliation logic, or anything else that changes a batch's
 * translated items changes -- orphans old rows (they stop matching) without a migration.
 */
const TRANSLATION_CACHE_VERSION = 1

function modelVersion(): string {
  return `${translationProvider()}:${translateModel()}:v${TRANSLATION_CACHE_VERSION}`
}

/** A `pending` row younger than this is presumed still being translated by its writer; older
 *  ones were abandoned (tab closed mid-translate) and can be taken over -- matches the RLS
 *  update policy's one-minute window. */
const PENDING_ROW_STALE_MS = 60_000
const POLL_INTERVAL_MS = 700
const POLL_MAX_ATTEMPTS = 8

const TARGET_LANG = "en"

export type SharedTranslationCacheScope = {
  discoverItemId: string
  /** Signed-in (non-anonymous) user id, or null. Only these users can write rows under RLS --
   *  everyone else reads the cache but never adds to it. */
  writerUserId: string | null
}

async function hashSourceText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

type CacheRow = { status: "pending" | "ready"; chunks: ReconciledItem[] | null; createdAt: string }

async function fetchRow(discoverItemId: string, sourceHash: string): Promise<CacheRow | null> {
  const { data, error } = await supabase
    .from("translation_cache")
    .select("status, chunks, created_at")
    .eq("discover_item_id", discoverItemId)
    .eq("source_hash", sourceHash)
    .eq("target_lang", TARGET_LANG)
    .eq("model_version", modelVersion())
    .maybeSingle()
  if (error || !data) return null
  return {
    status: data.status,
    chunks: Array.isArray(data.chunks) ? (data.chunks as ReconciledItem[]) : null,
    createdAt: data.created_at,
  }
}

function rowKey(scope: SharedTranslationCacheScope, sourceHash: string) {
  return {
    discover_item_id: scope.discoverItemId,
    source_hash: sourceHash,
    target_lang: TARGET_LANG,
    model_version: modelVersion(),
  }
}

/** Claim a batch with a `pending` row so concurrent readers wait for this translation instead of
 *  paying for their own. Fails harmlessly (unique violation) if someone else got there first. */
async function claimPendingRow(
  scope: SharedTranslationCacheScope & { writerUserId: string },
  sourceHash: string,
  sourceCharLen: number,
): Promise<void> {
  await supabase.from("translation_cache").insert({
    ...rowKey(scope, sourceHash),
    status: "pending",
    chunks: null,
    source_char_len: sourceCharLen,
    created_by: scope.writerUserId,
  })
}

/** Fill in a pending row (ours, or an abandoned one) with the finished translation. RLS refuses
 *  to touch a row that's already `ready`, so a finished translation is never overwritten. */
async function saveReadyRow(
  scope: SharedTranslationCacheScope & { writerUserId: string },
  sourceHash: string,
  sourceCharLen: number,
  chunks: ReconciledItem[],
): Promise<void> {
  await supabase.from("translation_cache").upsert(
    {
      ...rowKey(scope, sourceHash),
      status: "ready",
      chunks,
      source_char_len: sourceCharLen,
      created_by: scope.writerUserId,
    },
    { onConflict: "discover_item_id,source_hash,target_lang,model_version" },
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Wait briefly for another reader's in-flight translation of the same batch. Null on timeout. */
async function pollForReady(discoverItemId: string, sourceHash: string): Promise<ReconciledItem[] | null> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)
    const row = await fetchRow(discoverItemId, sourceHash)
    if (row?.status === "ready" && row.chunks) return row.chunks
    if (!row) return null
  }
  return null
}

/**
 * Shared cache in front of `translate` for one translation batch of a Discover item: a cached
 * `ready` row is returned as-is; otherwise the batch is translated (after briefly waiting out
 * another reader's fresh claim on it, if any) and, for a signed-in writer, stored for everyone
 * after. `translate` should throw on anything that shouldn't be shared (e.g. a misaligned
 * result, see assertBatchAligned) -- a failed translation is never stored.
 */
export async function loadBatchWithSharedCache(
  scope: SharedTranslationCacheScope,
  sourceText: string,
  translate: (text: string) => Promise<ReconciledItem[]>,
): Promise<ReconciledItem[]> {
  let sourceHash: string
  let existing: CacheRow | null
  try {
    sourceHash = await hashSourceText(sourceText)
    existing = await fetchRow(scope.discoverItemId, sourceHash)
  } catch {
    return translate(sourceText)
  }

  if (existing?.status === "ready" && existing.chunks) return existing.chunks

  if (existing?.status === "pending") {
    const age = Date.now() - new Date(existing.createdAt).getTime()
    if (age < PENDING_ROW_STALE_MS) {
      const ready = await pollForReady(scope.discoverItemId, sourceHash).catch(() => null)
      if (ready) return ready
      // Gave up waiting on someone else's claim rather than blocking the reader indefinitely.
    }
  }

  const writerUserId = scope.writerUserId
  const writer = writerUserId ? { ...scope, writerUserId } : null
  if (writer && existing == null) {
    await claimPendingRow(writer, sourceHash, sourceText.length).catch(() => {})
  }
  const chunks = await translate(sourceText)
  if (writer) {
    // Best-effort: a failed write just means the next reader translates this batch themselves.
    void saveReadyRow(writer, sourceHash, sourceText.length, chunks).catch(() => {})
  }
  return chunks
}
