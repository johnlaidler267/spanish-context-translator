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

async function readManifestAndSpine(
  zip: EpubZip,
  opfPath: string,
): Promise<{ spine: SpineEntry[]; title: string | null }> {
  const opfFile = zip.file(opfPath)
  if (!opfFile) {
    throw new EpubParseError("This doesn't look like a valid EPUB file (OPF file referenced but missing).")
  }
  const opfXml = await opfFile.async("text")
  const doc = parseXml(opfXml, "the OPF package document")

  const manifestById = new Map<string, string>() // id -> href
  for (const item of Array.from(doc.getElementsByTagName("item"))) {
    const id = item.getAttribute("id")
    const href = item.getAttribute("href")
    if (id && href) manifestById.set(id, href)
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

  return { spine, title }
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
  const { spine, title } = await readManifestAndSpine(zip, opfPath)
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

  return { text, title }
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
