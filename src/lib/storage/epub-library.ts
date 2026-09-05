import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

/**
 * Personal EPUB library: lets a signed-in (including anonymous/guest) user come back to books
 * they've uploaded, instead of the upload in src/lib/epub/parse-epub.ts being a one-off
 * "upload, read once, gone" trip through the translator.
 *
 * Backed by `user_epubs` (see supabase/migrations/0017_user_epub_library.sql), which stores
 * each book's already-extracted plain text -- the same string parse-epub.ts produces -- not
 * the original .epub binary (see that migration's header comment for why). Reading position
 * for a saved book reuses the existing `reading_progress` table/sync (reading-progress-sync.ts)
 * keyed by this table's row id as `content_id`, exactly like a Discover catalog item.
 *
 * Guests: `saveEpubToLibrary`/`listUserEpubs`/`deleteUserEpub` all no-op (return
 * null/[]/false) for a null user rather than throwing -- there's no account to save to until
 * an anonymous Supabase session exists (see the `!user` guard in App.tsx's handleTextSubmit
 * for why `user` can briefly be null on a very first submit). All of these are best-effort:
 * a network/RLS error is swallowed and surfaced as a normal "nothing happened" result, mirroring
 * reading-progress-sync.ts's treatment of the same class of failure.
 */

/** Mirrors the CHECK constraint on `user_epubs.body_text` -- kept here so the client can reject
 *  an oversized upload with a clear message instead of a raw Postgres error. */
export const MAX_EPUB_LIBRARY_CHARS = 2_000_000

/** Mirrors the per-user row cap enforced by the `trg_user_epubs_limit` trigger. */
export const MAX_EPUBS_PER_LIBRARY = 50

export class EpubLibraryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EpubLibraryError"
  }
}

/** One saved book's metadata -- deliberately without `bodyText` (potentially large; see
 *  `getUserEpubText` to fetch a single book's text when actually opening it to read). */
export interface LibraryEpub {
  id: string
  title: string
  fileName: string
  charCount: number
  createdAt: number
  updatedAt: number
}

interface UserEpubListRow {
  id: string
  title: string
  file_name: string
  char_count: number
  created_at: string
  updated_at: string
}

function rowToLibraryEpub(row: UserEpubListRow): LibraryEpub {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    charCount: row.char_count,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

/** This user's saved books, most recently added first. `[]` for a guest with no session yet,
 *  or if the fetch failed (swallowed -- see module docstring). */
export async function listUserEpubs(user: User | null): Promise<LibraryEpub[]> {
  if (!user) return []
  const { data, error } = await supabase
    .from("user_epubs")
    .select("id, title, file_name, char_count, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  if (error || !data) {
    if (error) console.warn("[epub-library] list failed:", error.message)
    return []
  }
  return (data as UserEpubListRow[]).map(rowToLibraryEpub)
}

/**
 * Saves a parsed EPUB into `user`'s library. `title` falls back to `fileName` (extension
 * stripped) when the EPUB itself had none. Returns the new row's id, or null for a guest with
 * no session yet or a swallowed network/RLS failure -- callers should treat this as best-effort
 * and not block the read that's already in progress on it (mirrors pushReadingProgress).
 *
 * Throws `EpubLibraryError` only for the two cases a caller should actually surface to the
 * user: the text is over the per-book size cap, or the library is full -- both are real limits
 * the reader can act on (delete something / this book can't be saved), unlike a transient
 * network hiccup.
 */
export async function saveEpubToLibrary(
  user: User | null,
  epub: { title: string | null; fileName: string; text: string },
): Promise<{ id: string } | null> {
  if (!user) return null

  const text = epub.text
  if (text.length > MAX_EPUB_LIBRARY_CHARS) {
    throw new EpubLibraryError(
      `This book is too long to save to your library (${text.length.toLocaleString()} characters; ` +
        `the limit is ${MAX_EPUB_LIBRARY_CHARS.toLocaleString()}). It can still be read once now, just not saved.`,
    )
  }

  const fallbackTitle = epub.fileName.replace(/\.epub$/i, "").trim() || "Untitled"
  const title = epub.title?.trim() || fallbackTitle

  const { data, error } = await supabase
    .from("user_epubs")
    .insert({
      user_id: user.id,
      title,
      file_name: epub.fileName,
      body_text: text,
      char_count: text.length,
    })
    .select("id")
    .single()

  if (error || !data) {
    // The library-full trigger raises a Postgres exception with a reader-facing message
    // (see enforce_user_epub_library_limit in the migration) -- surface that one, swallow
    // anything else (network blip, RLS edge case) as best-effort.
    if (error?.message.includes("library is full")) {
      throw new EpubLibraryError(error.message)
    }
    if (error) console.warn("[epub-library] save failed:", error.message)
    return null
  }
  return { id: (data as { id: string }).id }
}

/** Full text of one saved book, for resuming/starting a read. null if not found, not this
 *  user's (RLS), or the fetch failed. */
export async function getUserEpubText(
  user: User | null,
  id: string,
): Promise<{ title: string; text: string } | null> {
  if (!user) return null
  const { data, error } = await supabase
    .from("user_epubs")
    .select("title, body_text")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error || !data) {
    if (error) console.warn("[epub-library] fetch failed:", error.message)
    return null
  }
  return { title: data.title, text: data.body_text }
}

/** Removes a saved book. Returns false if nothing was deleted (already gone, not this user's). */
export async function deleteUserEpub(user: User | null, id: string): Promise<boolean> {
  if (!user) return false
  const { data, error } = await supabase
    .from("user_epubs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
  if (error) {
    console.warn("[epub-library] delete failed:", error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}
