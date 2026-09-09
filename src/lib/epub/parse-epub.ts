/**
 * Client-side EPUB → plain text extraction.
 *
 * An `.epub` file is a zip archive containing:
 *   META-INF/container.xml  -- points at the OPF "package document"
 *   <opf path>               -- lists every content file (manifest) and the
 *                                reading order (spine) of the ones that are chapters
 *   <chapter files>           -- XHTML content, one (or more) per spine entry
 *
 * This module reads that chain and concatenates the spine's XHTML bodies, in
 * spine order, into one continuous plain-text string -- exactly the shape
 * `handleTextSubmit` (see src/App.tsx) already accepts for a pasted article.
 * No chapter/table-of-contents structure is preserved beyond paragraph breaks.
 *
 * Everything here runs in-memory in the browser; the raw file is never
 * uploaded or persisted anywhere.
 */

import JSZip from "jszip"

type EpubZip = JSZip

export class EpubParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EpubParseError"
  }
}

export interface ParsedEpub {
  /** Concatenated plain text of every spine chapter, in reading order. */
  text: string
  /** Book title from the OPF's <dc:title>, if present. */
  title: string | null
  /** Book author from the OPF's <dc:creator>, if present -- see `pickAuthor`'s docstring for
   *  how a multi-creator (author + illustrator + translator, etc.) OPF is disambiguated. */
  author: string | null
  /** Book synopsis/description from the OPF's optional <dc:description>, if present, cut to
   *  `MAX_DESCRIPTION_CHARS` (see `truncateForPreview`) -- most EPUBs don't carry this field
   *  at all, which is a normal "nothing to show", not an error. */
  description: string | null
  /**
   * The book's cover image, as a `data:` URL, if one was found and small enough to keep --
   * see `extractCoverImage`'s docstring. `null` for an EPUB with no cover, an unrecognized
   * image type, or a cover over `MAX_COVER_SOURCE_BYTES`.
   */
  coverImage: string | null
}

function parseXml(xml: string, sourceLabel: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const parserError = doc.getElementsByTagName("parsererror")[0]
  if (parserError) {
    throw new EpubParseError(`This doesn't look like a valid EPUB file (couldn't parse ${sourceLabel}).`)
  }
  return doc
}

/** Joins a base path's directory with a (possibly relative) href, resolving `.`/`..` segments. */
function resolveRelativePath(basePath: string, href: string): string {
  const decodedHref = href.split("#")[0] ?? href
  if (/^[a-z]+:\/\//i.test(decodedHref)) return decodedHref // absolute URL, unlikely but ignore-safe
  const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/") + 1) : ""
  const combined = `${baseDir}${decodedHref}`
  const segments = combined.split("/")
  const resolved: string[] = []
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue
    if (seg === "..") resolved.pop()
    else resolved.push(seg)
  }
  return resolved.join("/")
}

/** Finds the OPF package-document path via META-INF/container.xml. */
async function findOpfPath(zip: EpubZip): Promise<string> {
  const containerFile = zip.file("META-INF/container.xml")
  if (!containerFile) {
    throw new EpubParseError("This doesn't look like a valid EPUB file (missing META-INF/container.xml).")
  }
  const containerXml = await containerFile.async("text")
  const doc = parseXml(containerXml, "container.xml")
  const rootfile = doc.getElementsByTagName("rootfile")[0]
  const fullPath = rootfile?.getAttribute("full-path")
  if (!fullPath) {
    throw new EpubParseError("This doesn't look like a valid EPUB file (no OPF path in container.xml).")
  }
  return fullPath
}

interface SpineEntry {
  /** Path inside the zip, resolved relative to the OPF's own directory. */
  path: string
}

interface ManifestItem {
  id: string
  /** Href exactly as written in the manifest -- resolve with `resolveRelativePath` before use. */
  href: string
  mediaType: string | null
  /** EPUB3 `properties` attribute, e.g. "cover-image nav" -- space-separated, so check with a
   *  word match rather than equality. */
  properties: string | null
}

/**
 * Picks the book's primary author out of an OPF's `<dc:creator>` elements. An OPF can list
 * several -- author, illustrator, translator, etc. -- each as its own `<dc:creator>`, with the
 * role distinguished by an `opf:role` attribute (OPF2) or a plain `role` attribute (seen in the
 * wild on some EPUB2 files that skip the `opf:` namespace prefix). Prefers one explicitly marked
 * `role="aut"`; falls back to the first `<dc:creator>` when none is marked (the common case: a
 * single-author book has exactly one, unmarked). Returns null when there's no `<dc:creator>` at
 * all -- same "absent, not an error" treatment as a missing title.
 */
function pickAuthor(creators: Element[]): string | null {
  const textOf = (el: Element) => el.textContent?.trim() || null

  const primary = creators.find((el) => {
    const role = el.getAttribute("opf:role") ?? el.getAttribute("role")
    return role === "aut"
  })
  if (primary) {
    const text = textOf(primary)
    if (text) return text
  }

  for (const creator of creators) {
    const text = textOf(creator)
    if (text) return text
  }
  return null
}

/**
 * Strips HTML markup out of a `<dc:description>` value and decodes any entities (e.g.
 * `&amp;` -> `&`), so a description that embeds simple HTML -- legal, and common, in OPF
 * metadata -- renders as clean plain text instead of leaking tags into the library preview
 * modal. Never returns markup: the result is plain text only, safe to render directly (never
 * via `dangerouslySetInnerHTML`, which this deliberately avoids needing).
 *
 * Parses `raw` as HTML (lenient -- unlike the OPF's own XML parse, a stray "<" or unclosed tag
 * won't throw) and reads back `textContent`, which both drops every tag and decodes entities.
 * Block-level tags get a trailing blank line first so "<p>A</p><p>B</p>" reads as two
 * paragraphs rather than running together as "AB".
 */
function stripDescriptionHtml(raw: string): string {
  const doc = new DOMParser().parseFromString(raw, "text/html")
  doc.querySelectorAll("script, style").forEach((el) => el.remove())
  doc.querySelectorAll("br").forEach((el) => el.replaceWith("\n"))
  doc
    .querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr")
    .forEach((el) => el.append("\n\n"))

  const text = doc.body?.textContent ?? ""
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function readManifestAndSpine(
  zip: EpubZip,
  opfPath: string,
): Promise<{
  spine: SpineEntry[]
  title: string | null
  author: string | null
  description: string | null
  manifestItems: ManifestItem[]
  metaCoverId: string | null
}> {
  const opfFile = zip.file(opfPath)
  if (!opfFile) {
    throw new EpubParseError("This doesn't look like a valid EPUB file (OPF file referenced but missing).")
  }
  const opfXml = await opfFile.async("text")
  const doc = parseXml(opfXml, "the OPF package document")

  const manifestItems: ManifestItem[] = []
  const manifestById = new Map<string, string>() // id -> href
  for (const item of Array.from(doc.getElementsByTagName("item"))) {
    const id = item.getAttribute("id")
    const href = item.getAttribute("href")
    if (id && href) {
      manifestById.set(id, href)
      manifestItems.push({
        id,
        href,
        mediaType: item.getAttribute("media-type"),
        properties: item.getAttribute("properties"),
      })
    }
  }

  const spine: SpineEntry[] = []
  for (const itemref of Array.from(doc.getElementsByTagName("itemref"))) {
    const idref = itemref.getAttribute("idref")
    if (!idref) continue
    const href = manifestById.get(idref)
    if (!href) continue
    spine.push({ path: resolveRelativePath(opfPath, href) })
  }

  const titleEl = doc.getElementsByTagName("dc:title")[0] ?? doc.getElementsByTagName("title")[0]
  const title = titleEl?.textContent?.trim() || null

  const creatorEls =
    doc.getElementsByTagName("dc:creator").length > 0
      ? Array.from(doc.getElementsByTagName("dc:creator"))
      : Array.from(doc.getElementsByTagName("creator"))
  const author = pickAuthor(creatorEls)

  // Unlike dc:creator, a well-formed OPF has at most one dc:description -- no role
  // disambiguation needed, just take it (or its unprefixed EPUB2 form) if present.
  const descriptionEl =
    doc.getElementsByTagName("dc:description")[0] ?? doc.getElementsByTagName("description")[0]
  const rawDescription = descriptionEl?.textContent?.trim() || null
  // Publishers commonly embed simple HTML (<p>, <br/>, <b>, ...) in dc:description, often
  // entity-encoded (e.g. "&lt;p&gt;") so it survives the OPF's own XML parse as literal text
  // rather than nested elements -- `textContent` above then hands back that markup as plain
  // characters. Strip it back down to plain text so it never leaks into the UI as raw tags.
  const description = rawDescription ? stripDescriptionHtml(rawDescription) || null : null

  // EPUB2's way of pointing at the cover: <meta name="cover" content="<manifest id>"/>, as
  // opposed to EPUB3's `properties="cover-image"` on the manifest item itself (read in
  // findCoverItem below).
  let metaCoverId: string | null = null
  for (const meta of Array.from(doc.getElementsByTagName("meta"))) {
    if (meta.getAttribute("name") === "cover") {
      metaCoverId = meta.getAttribute("content")
      break
    }
  }

  return { spine, title, author, description, manifestItems, metaCoverId }
}

/**
 * Locates the manifest item for the book's cover image, trying (in order) the ways real-world
 * EPUBs actually mark one:
 *   1. EPUB3: the manifest item with `properties="cover-image"` (possibly among other
 *      space-separated properties).
 *   2. EPUB2: `<meta name="cover" content="some-id">` in the OPF metadata, pointing at a
 *      manifest item by id.
 *   3. A manifest item whose id or href looks like "cover" (e.g. id="cover-image",
 *      href="images/cover.jpg") and whose media-type is an image -- some EPUBs skip both of
 *      the above and just rely on this convention.
 * Returns null (no error) when none of these match -- most EPUBs *do* have a cover, but not
 * having one is a normal, unremarkable case, not something worth failing the whole parse over.
 */
function findCoverItem(manifestItems: ManifestItem[], metaCoverId: string | null): ManifestItem | null {
  const isImage = (item: ManifestItem) =>
    item.mediaType?.startsWith("image/") ?? /\.(jpe?g|png|gif|webp|svg)$/i.test(item.href)

  const byProperties = manifestItems.find((item) => item.properties?.split(/\s+/).includes("cover-image"))
  if (byProperties) return byProperties

  if (metaCoverId) {
    const byMetaId = manifestItems.find((item) => item.id === metaCoverId)
    if (byMetaId && isImage(byMetaId)) return byMetaId
  }

  const byConvention = manifestItems.find((item) => isImage(item) && /cover/i.test(`${item.id} ${item.href}`))
  return byConvention ?? null
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
}

function guessMimeType(mediaType: string | null, path: string): string | null {
  if (mediaType) return mediaType
  const ext = path.split(".").pop()?.toLowerCase()
  return (ext && MIME_BY_EXTENSION[ext]) || null
}

/** Above this many raw (pre-base64) bytes, a cover is skipped rather than stored -- keeps
 *  `user_epubs.cover_image` rows small; see supabase/migrations for the matching column cap. */
export const MAX_COVER_SOURCE_BYTES = 300_000

/** Above this many characters, a `<dc:description>` is cut down (via `truncateForPreview`,
 *  at a sentence boundary where possible) rather than stored whole -- a synopsis this modal
 *  shows in a small box has no business being thousands of characters, and this doubles as a
 *  client-side backstop against a pathological OPF; see the matching CHECK constraint in
 *  supabase/migrations for the server-side one. */
export const MAX_DESCRIPTION_CHARS = 2_000

/** btoa() only accepts a "binary string", and spreading a large Uint8Array into
 *  String.fromCharCode blows the call stack -- chunk it instead. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return btoa(binary)
}

/**
 * Extracts the book's cover image as a `data:` URL, if the EPUB has one, it's a recognizable
 * image type, and it's small enough to be worth storing (see `MAX_COVER_SOURCE_BYTES`). Never
 * throws -- a missing/oversized/unreadable cover just means no image, not a parse failure.
 */
async function extractCoverImage(
  zip: EpubZip,
  opfPath: string,
  manifestItems: ManifestItem[],
  metaCoverId: string | null,
): Promise<string | null> {
  const coverItem = findCoverItem(manifestItems, metaCoverId)
  if (!coverItem) return null

  const coverPath = resolveRelativePath(opfPath, coverItem.href)
  const coverFile = zip.file(coverPath)
  if (!coverFile) return null

  const mimeType = guessMimeType(coverItem.mediaType, coverPath)
  if (!mimeType) return null

  const bytes = await coverFile.async("uint8array").catch(() => null)
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_SOURCE_BYTES) return null

  return `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`
}

const BLOCK_SELECTOR = "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, td, br"

/** Extracts readable plain text from one chapter's XHTML, joining block-level elements with blank lines. */
function extractChapterText(xhtml: string): string {
  const doc = new DOMParser().parseFromString(xhtml, "application/xhtml+xml")
  let root: Element | null = doc.body
  if (!root || doc.getElementsByTagName("parsererror")[0]) {
    // Some EPUB chapters aren't strictly well-formed XHTML -- fall back to a
    // lenient HTML parse rather than dropping the whole chapter.
    const htmlDoc = new DOMParser().parseFromString(xhtml, "text/html")
    root = htmlDoc.body
  }
  if (!root) return ""

  const blocks = root.querySelectorAll(BLOCK_SELECTOR)
  if (blocks.length === 0) {
    return (root.textContent ?? "").replace(/\s+/g, " ").trim()
  }

  const paragraphs: string[] = []
  for (const el of Array.from(blocks)) {
    if (el.tagName.toLowerCase() === "br") continue
    // Skip a block whose own text lives entirely inside a nested block we'll already visit.
    if (el.querySelector(BLOCK_SELECTOR)) continue
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim()
    if (t) paragraphs.push(t)
  }
  return paragraphs.join("\n\n")
}

/**
 * Parses an EPUB file (as given by a browser file input) into plain text plus,
 * when easily available, its title. Throws `EpubParseError` for anything that
 * isn't a readable EPUB.
 */
export async function parseEpub(file: Blob): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(file).catch(() => {
    throw new EpubParseError("Couldn't open this file -- make sure it's a valid, uncorrupted EPUB.")
  })

  const opfPath = await findOpfPath(zip)
  const { spine, title, author, description, manifestItems, metaCoverId } = await readManifestAndSpine(
    zip,
    opfPath,
  )
  if (spine.length === 0) {
    throw new EpubParseError("This EPUB doesn't have any readable chapters.")
  }

  const chapterTexts: string[] = []
  for (const entry of spine) {
    const chapterFile = zip.file(entry.path)
    if (!chapterFile) continue
    const xhtml = await chapterFile.async("text")
    const chapterText = extractChapterText(xhtml)
    if (chapterText) chapterTexts.push(chapterText)
  }

  const text = chapterTexts.join("\n\n").trim()
  if (!text) {
    throw new EpubParseError("Couldn't find any readable text in this EPUB.")
  }

  const coverImage = await extractCoverImage(zip, opfPath, manifestItems, metaCoverId)

  return {
    text,
    title,
    author,
    description: description ? truncateForPreview(description, MAX_DESCRIPTION_CHARS) : null,
    coverImage,
  }
}

/**
 * Truncates `text` to at most `limit` characters for a free-tier preview -- used to cut a
 * whole uploaded book down to the same `charsPerSubmission` allowance a pasted article is
 * already held to (see the `freeCharLimit` check in `handleTextSubmit`, src/App.tsx).
 * Cuts at the nearest sentence end within the last ~40% of the allowance so a preview reads
 * as a clean excerpt rather than stopping mid-word; falls back to a word boundary, then a
 * hard character cut if neither is close enough to be worth preferring.
 */
export function truncateForPreview(text: string, limit: number): string {
  if (text.length <= limit) return text
  const hardCut = text.slice(0, limit)
  const minAcceptableCut = Math.floor(limit * 0.6)

  const lastSentenceEnd = Math.max(
    hardCut.lastIndexOf(". "),
    hardCut.lastIndexOf(".\n"),
    hardCut.lastIndexOf("! "),
    hardCut.lastIndexOf("!\n"),
    hardCut.lastIndexOf("? "),
    hardCut.lastIndexOf("?\n"),
  )
  if (lastSentenceEnd >= minAcceptableCut) {
    return hardCut.slice(0, lastSentenceEnd + 1).trim()
  }

  const lastWordBoundary = hardCut.lastIndexOf(" ")
  if (lastWordBoundary >= minAcceptableCut) {
    return hardCut.slice(0, lastWordBoundary).trim()
  }

  return hardCut.trim()
}
