"use client"

import { useMemo, useState, type ChangeEvent, type ClipboardEvent } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ContentType, DifficultyLevel } from "@/lib/content-data"
import {
  CoverImageCropPanel,
  type DiscoverCoverAspect,
} from "@/components/discover/cover-image-crop-panel"
import { pastedImageDisplayName, readBlobAsDataUrl, readImageFileFromClipboard } from "@/lib/cover-image-clipboard"
import { fetchGroqChatViaEdge } from "@/lib/groq-edge"

const contentTypeOptions: ContentType[] = ["book", "article", "song", "poem"]
const difficultyOptions: DifficultyLevel[] = ["beginner", "intermediate", "advanced"]

/** Smallest / fastest Groq model allowed by `groq-chat` — used only for tag suggestions. */
const TAGS_GROQ_MODEL = "llama-3.1-8b-instant" as const
const TAGS_EXCERPT_CHAR_CAP = 8000

function firstTwoParagraphs(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) return ""
  const parts = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.slice(0, 2).join("\n\n")
}

function assistantTextFromChatResponse(data: unknown): string {
  const choice = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
  const content = choice?.message?.content
  if (typeof content === "string" && content.trim()) return content.trim()
  if (Array.isArray(content)) {
    const texts = content.map((part: unknown) => {
      if (part !== null && typeof part === "object" && "text" in part) {
        const t = (part as { text?: unknown }).text
        return typeof t === "string" ? t : ""
      }
      return ""
    })
    const joined = texts.join("")
    if (joined.trim()) return joined.trim()
  }
  return ""
}

/** Model sometimes returns one string with commas or overly long phrases; fix shape and length. */
function normalizeAiDiscoverTags(raw: string[]): string[] {
  const expanded = raw
    .flatMap((t) => {
      const s = t.trim()
      if (!s) return []
      if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean)
      return [s]
    })
    .filter(Boolean)
  return expanded.slice(0, 3).map((tag) => {
    const words = tag.split(/\s+/).filter(Boolean)
    return words.slice(0, 4).join(" ")
  })
}

function normalizeDifficulty(raw: unknown): DifficultyLevel | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().toLowerCase()
  if (s === "beginner" || s === "intermediate" || s === "advanced") return s
  return null
}

/** Legacy: model returned only a JSON array of tags. */
function parseTagsOnlyPayload(raw: string): string[] {
  let t = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im
  const fenceMatch = t.match(fence)
  if (fenceMatch) t = fenceMatch[1].trim()
  const arrayMatch = t.match(/\[[\s\S]*\]/)
  const jsonSlice = arrayMatch ? arrayMatch[0] : t
  try {
    const parsed = JSON.parse(jsonSlice) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 3)
    }
  } catch {
    /* fall through */
  }
  return t
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, 3)
}

function parseDiscoverAiPayload(raw: string): { tags: string[]; difficulty: DifficultyLevel | null } {
  let t = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im
  const fenceMatch = t.match(fence)
  if (fenceMatch) t = fenceMatch[1].trim()
  const objMatch = t.match(/\{[\s\S]*\}/)
  const jsonSlice = objMatch ? objMatch[0] : t
  try {
    const parsed = JSON.parse(jsonSlice) as { tags?: unknown; difficulty?: unknown }
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
        : []
      const difficulty = normalizeDifficulty(parsed.difficulty)
      return { tags, difficulty }
    }
  } catch {
    /* fall through */
  }
  const tags = parseTagsOnlyPayload(raw)
  return { tags, difficulty: null }
}

const languageOptions = [
  "Spanish",
  "English",
  "Portuguese",
  "French",
  "Italian",
  "German",
  "Other",
] as const

export type DevResourceUpload = {
  title: string
  author: string
  language: string
  type: ContentType
  difficulty: DifficultyLevel
  text: string
  tags: string[]
  wordCount: number
  coverImage?: string
}

type DevUploadResourceModalProps = {
  open: boolean
  onClose: () => void
  onPublish: (resource: DevResourceUpload) => void
}

export function DevUploadResourceModal({ open, onClose, onPublish }: DevUploadResourceModalProps) {
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [language, setLanguage] = useState<string>("Spanish")
  const [type, setType] = useState<ContentType>("article")
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("beginner")
  const [tagsText, setTagsText] = useState("")
  const [text, setText] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState("")
  const [uploadedImageName, setUploadedImageName] = useState("")
  const [useUrlForCropWorkbench, setUseUrlForCropWorkbench] = useState(false)
  const [coverCropAspect, setCoverCropAspect] = useState<DiscoverCoverAspect>("card")
  const [croppedCoverJpeg, setCroppedCoverJpeg] = useState<string | null>(null)
  const [tagsAiBusy, setTagsAiBusy] = useState(false)
  const [tagsAiError, setTagsAiError] = useState<string | null>(null)

  const wordCount = useMemo(() => {
    const words = text.trim().match(/\S+/g)
    return words ? words.length : 0
  }, [text])

  const canPublish =
    title.trim().length > 0 &&
    author.trim().length > 0 &&
    language.trim().length > 0 &&
    text.trim().length > 0 &&
    wordCount > 0

  const resetForm = () => {
    setTitle("")
    setAuthor("")
    setLanguage("Spanish")
    setType("article")
    setDifficulty("beginner")
    setTagsText("")
    setText("")
    setCoverImageUrl("")
    setUploadedImageDataUrl("")
    setUploadedImageName("")
    setUseUrlForCropWorkbench(false)
    setCoverCropAspect("card")
    setCroppedCoverJpeg(null)
    setTagsAiError(null)
  }

  const cropWorkbenchSrc =
    uploadedImageDataUrl ||
    (useUrlForCropWorkbench && coverImageUrl.trim().length > 0 ? coverImageUrl.trim() : null)

  const excerptForTags = useMemo(() => firstTwoParagraphs(text), [text])
  const canAutoFillTags = excerptForTags.length > 0 && !tagsAiBusy

  const handleAutoFillTags = async () => {
    if (!excerptForTags) {
      setTagsAiError("Add at least one paragraph of text first.")
      return
    }
    setTagsAiBusy(true)
    setTagsAiError(null)
    try {
      const capped =
        excerptForTags.length > TAGS_EXCERPT_CHAR_CAP
          ? excerptForTags.slice(0, TAGS_EXCERPT_CHAR_CAP)
          : excerptForTags
      const res = await fetchGroqChatViaEdge({
        model: TAGS_GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              'Reply with only one JSON object (no markdown). Keys: "tags" and "difficulty". ' +
              '"tags": a JSON array of exactly 3 strings (three separate elements). Each tag: 1–3 words, no commas inside a tag, lowercase except proper nouns. ' +
              "Use concrete shelf-style topics only: genre, place, era, culture, subject matter, or audience. " +
              'Never tag prose technique or structure (e.g. no "description of setting", "imagery", "narrative", "tone", "voice"). ' +
              '"difficulty": exactly one of beginner, intermediate, advanced — for a language learner reading this excerpt (vocabulary, sentence complexity, abstraction). ' +
              "No other keys or text.",
          },
          {
            role: "user",
            content: `First paragraphs of a longer work:\n\n${capped}`,
          },
        ],
        temperature: 0.35,
        max_tokens: 200,
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        let msg = errText || `Request failed (${res.status})`
        try {
          const j = JSON.parse(errText) as { error?: { message?: string } }
          if (j?.error?.message) msg = j.error.message
        } catch {
          /* use msg as-is */
        }
        throw new Error(msg)
      }
      const data = (await res.json()) as unknown
      const content = assistantTextFromChatResponse(data)
      if (!content) throw new Error("Empty model response")
      const { tags: parsedTags, difficulty: suggested } = parseDiscoverAiPayload(content)
      const tags = normalizeAiDiscoverTags(parsedTags)
      if (tags.length === 0) throw new Error("Could not parse tags from the model response")
      setTagsText(tags.join(", "))
      if (suggested) setDifficulty(suggested)
    } catch (e) {
      setTagsAiError(e instanceof Error ? e.message : "Tag generation failed")
    } finally {
      setTagsAiBusy(false)
    }
  }

  const applyCoverImageFile = async (file: File, displayName?: string) => {
    setCroppedCoverJpeg(null)
    try {
      const dataUrl = await readBlobAsDataUrl(file)
      setUseUrlForCropWorkbench(false)
      setUploadedImageDataUrl(dataUrl)
      setUploadedImageName(displayName ?? file.name)
    } catch {
      setUploadedImageDataUrl("")
      setUploadedImageName("")
    }
  }

  const handleCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await applyCoverImageFile(file)
    event.target.value = ""
  }

  /** Capture: if clipboard holds an image, use it as cover without blocking text paste. */
  const handleDialogPasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = readImageFileFromClipboard(event.clipboardData)
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void applyCoverImageFile(file, pastedImageDisplayName(file))
  }

  const handlePublish = () => {
    if (!canPublish) return

    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)

    onPublish({
      title: title.trim(),
      author: author.trim(),
      language: language.trim(),
      type,
      difficulty,
      text: text.trim(),
      tags,
      wordCount,
      coverImage: croppedCoverJpeg ?? (uploadedImageDataUrl || coverImageUrl.trim() || undefined),
    })
    resetForm()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onPasteCapture={handleDialogPasteCapture}
      >
        <DialogHeader>
          <DialogTitle>Upload Resource</DialogTitle>
          <DialogDescription>
            Add a custom text resource for Discover (dev only). Word count updates automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="upload-title" className="text-sm font-medium text-foreground">
                Title
              </label>
              <Input
                id="upload-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="The House on Mango Street"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="upload-author" className="text-sm font-medium text-foreground">
                Author
              </label>
              <Input
                id="upload-author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Sandra Cisneros"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="upload-language" className="text-sm font-medium text-foreground">
                Language
              </label>
              <select
                id="upload-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {languageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="upload-type" className="text-sm font-medium text-foreground">
                Text Type
              </label>
              <select
                id="upload-type"
                value={type}
                onChange={(event) => setType(event.target.value as ContentType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {contentTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="upload-difficulty" className="text-sm font-medium text-foreground">
              Difficulty
            </label>
            <select
              id="upload-difficulty"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as DifficultyLevel)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {difficultyOptions.map((option) => (
                <option key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="upload-tags" className="text-sm font-medium text-foreground">
                Tags
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={!canAutoFillTags}
                onClick={() => void handleAutoFillTags()}
              >
                {tagsAiBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                AI auto-fill
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses the first two paragraphs to suggest tags and difficulty.
            </p>
            <Input
              id="upload-tags"
              value={tagsText}
              onChange={(event) => {
                setTagsText(event.target.value)
                if (tagsAiError) setTagsAiError(null)
              }}
              placeholder="history, beginner, short story"
            />
            {tagsAiError ? <p className="text-xs text-destructive">{tagsAiError}</p> : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="upload-image-url" className="text-sm font-medium text-foreground">
              Cover Image URL
            </label>
            <Input
              id="upload-image-url"
              value={coverImageUrl}
              onChange={(event) => {
                setCoverImageUrl(event.target.value)
                setUseUrlForCropWorkbench(false)
              }}
              placeholder="https://example.com/cover.jpg"
            />
            {coverImageUrl.trim().length > 0 && !uploadedImageDataUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setCroppedCoverJpeg(null)
                  setUseUrlForCropWorkbench(true)
                }}
              >
                Preview & crop this URL
              </Button>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="upload-image-file" className="text-sm font-medium text-foreground">
              Or Upload Cover Image
            </label>
            <input
              id="upload-image-file"
              type="file"
              accept="image/*"
              onChange={handleCoverFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Paste a copied image or screenshot anywhere in this dialog (⌘V / Ctrl+V) to set the cover.
            </p>
            {uploadedImageName && (
              <p className="text-xs text-muted-foreground">
                Using uploaded image: <span className="font-medium text-foreground">{uploadedImageName}</span>
              </p>
            )}
          </div>

          {cropWorkbenchSrc ? (
            <CoverImageCropPanel
              key={cropWorkbenchSrc}
              imageSrc={cropWorkbenchSrc}
              aspect={coverCropAspect}
              onAspectChange={setCoverCropAspect}
              onCroppedJpeg={setCroppedCoverJpeg}
            />
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="upload-text" className="text-sm font-medium text-foreground">
              Text
            </label>
            <textarea
              id="upload-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste or write the full text here..."
              className="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Word count: <span className="font-semibold text-foreground">{wordCount.toLocaleString()}</span>
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={!canPublish}>
            Publish to Discover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
