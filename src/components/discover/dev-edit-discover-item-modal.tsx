"use client"

import { useEffect, useMemo, useState, type ChangeEvent, type ClipboardEvent } from "react"
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
import type { ContentItem, ContentType, DifficultyLevel } from "@/lib/content-data"
import { pastedImageDisplayName, readBlobAsDataUrl, readImageFileFromClipboard } from "@/lib/cover-image-clipboard"
import { discoverRowToContentItem, type DiscoverListRow } from "@/lib/discover-map"
import type { DiscoverItemRow, DiscoverItemUpdate } from "@/lib/db.types"
import { supabase } from "@/lib/supabase"

const contentTypeOptions: ContentType[] = ["book", "article", "song", "poem"]
const difficultyOptions: DifficultyLevel[] = ["beginner", "intermediate", "advanced"]

const LIST_SELECT =
  "id, title, author, type, difficulty, word_count, language, cover_image, tags, preview, estimated_time, created_at"

type DevEditDiscoverItemModalProps = {
  content: ContentItem | null
  open: boolean
  onClose: () => void
  onSaved: (item: ContentItem) => void
  onError: (message: string) => void
}

export function DevEditDiscoverItemModal({
  content,
  open,
  onClose,
  onSaved,
  onError,
}: DevEditDiscoverItemModalProps) {
  const [rowLoading, setRowLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [language, setLanguage] = useState("")
  const [type, setType] = useState<ContentType>("article")
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("beginner")
  const [tagsText, setTagsText] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState("")
  const [uploadedImageName, setUploadedImageName] = useState("")
  const [estimatedTime, setEstimatedTime] = useState("")
  const [preview, setPreview] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [rowId, setRowId] = useState<string | null>(null)

  const wordCount = useMemo(() => {
    const words = bodyText.trim().match(/\S+/g)
    return words ? words.length : 0
  }, [bodyText])

  const resetLocalState = () => {
    setLoadError(null)
    setRowId(null)
    setTitle("")
    setAuthor("")
    setLanguage("")
    setType("article")
    setDifficulty("beginner")
    setTagsText("")
    setCoverImageUrl("")
    setUploadedImageDataUrl("")
    setUploadedImageName("")
    setEstimatedTime("")
    setPreview("")
    setBodyText("")
  }

  useEffect(() => {
    if (!open || !content?.id) {
      if (!open) resetLocalState()
      return
    }

    let cancelled = false
    setRowLoading(true)
    setLoadError(null)
    setRowId(null)

    void (async () => {
      const { data, error } = await supabase
        .from("discover_items")
        .select("*")
        .eq("id", content.id)
        .maybeSingle()

      if (cancelled) return
      setRowLoading(false)

      if (error || !data) {
        setLoadError(error?.message ?? "Could not load item.")
        return
      }

      const row = data as DiscoverItemRow
      setRowId(row.id)
      setTitle(row.title)
      setAuthor(row.author)
      setLanguage(row.language)
      setType(row.type)
      setDifficulty(row.difficulty)
      setTagsText(row.tags.join(", "))
      setCoverImageUrl(row.cover_image)
      setUploadedImageDataUrl("")
      setUploadedImageName("")
      setEstimatedTime(row.estimated_time)
      setPreview(row.preview)
      setBodyText(row.body_text)
    })()

    return () => {
      cancelled = true
    }
  }, [open, content?.id])

  const applyCoverImageFile = async (file: File, displayName?: string) => {
    try {
      const dataUrl = await readBlobAsDataUrl(file)
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

  const handleDialogPasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = readImageFileFromClipboard(event.clipboardData)
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void applyCoverImageFile(file, pastedImageDisplayName(file))
  }

  const canSave =
    !!rowId &&
    title.trim().length > 0 &&
    author.trim().length > 0 &&
    language.trim().length > 0 &&
    bodyText.trim().length > 0 &&
    wordCount > 0

  const handleSave = async () => {
    if (!rowId || !canSave) return

    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)

    const cover =
      uploadedImageDataUrl ||
      coverImageUrl.trim() ||
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=600&fit=crop"

    const update: DiscoverItemUpdate = {
      title: title.trim(),
      author: author.trim(),
      language: language.trim(),
      type,
      difficulty,
      word_count: wordCount,
      cover_image: cover,
      tags: tags.length > 0 ? tags : ["Untagged"],
      preview: preview.trim().slice(0, 4000),
      estimated_time: estimatedTime.trim() || "5 min",
      body_text: bodyText.trim(),
    }

    setSaving(true)
    const { error, count } = await supabase
      .from("discover_items")
      .update(update, { count: "exact" })
      .eq("id", rowId)
    if (error) {
      setSaving(false)
      onError(
        error.message ??
          "Update failed. This item may no longer exist, or your account may not have curator access.",
      )
      return
    }

    if (!count) {
      setSaving(false)
      onError("Update failed. This item may no longer exist, or your account may not have curator access.")
      return
    }

    const { data, error: reloadError } = await supabase
      .from("discover_items")
      .select(LIST_SELECT)
      .eq("id", rowId)
      .maybeSingle()

    setSaving(false)

    if (reloadError || !data) {
      onError(reloadError?.message ?? "Saved, but could not reload the updated item.")
      return
    }

    onSaved(discoverRowToContentItem(data as DiscoverListRow))
    resetLocalState()
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
          <DialogTitle>Edit Discover item</DialogTitle>
          <DialogDescription>
            Dev-only catalog editor. Saves to Supabase (requires permission to update{" "}
            <code className="text-xs">discover_items</code>).
          </DialogDescription>
        </DialogHeader>

        {rowLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {loadError && (
          <p className="text-sm text-destructive" role="alert">
            {loadError}
          </p>
        )}

        {!rowLoading && !loadError && rowId && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="edit-title" className="text-sm font-medium text-foreground">
                  Title
                </label>
                <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-author" className="text-sm font-medium text-foreground">
                  Author
                </label>
                <Input id="edit-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="edit-language" className="text-sm font-medium text-foreground">
                  Language
                </label>
                <Input id="edit-language" value={language} onChange={(e) => setLanguage(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-type" className="text-sm font-medium text-foreground">
                  Type
                </label>
                <select
                  id="edit-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ContentType)}
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
              <label htmlFor="edit-difficulty" className="text-sm font-medium text-foreground">
                Difficulty
              </label>
              <select
                id="edit-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
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
              <label htmlFor="edit-estimated" className="text-sm font-medium text-foreground">
                Estimated time
              </label>
              <Input
                id="edit-estimated"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                placeholder="12 min"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-tags" className="text-sm font-medium text-foreground">
                Tags (comma-separated)
              </label>
              <Input id="edit-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-cover-url" className="text-sm font-medium text-foreground">
                Cover image URL
              </label>
              <Input id="edit-cover-url" value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-cover-file" className="text-sm font-medium text-foreground">
                Or replace cover (file)
              </label>
              <input
                id="edit-cover-file"
                type="file"
                accept="image/*"
                onChange={handleCoverFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Paste a copied image or screenshot anywhere in this dialog (⌘V / Ctrl+V) to replace the cover.
              </p>
              {uploadedImageName && (
                <p className="text-xs text-muted-foreground">
                  Using upload: <span className="font-medium text-foreground">{uploadedImageName}</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-preview" className="text-sm font-medium text-foreground">
                Short preview (Discover card / modal)
              </label>
              <textarea
                id="edit-preview"
                value={preview}
                onChange={(e) => setPreview(e.target.value)}
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-body" className="text-sm font-medium text-foreground">
                Full text (reading body)
              </label>
              <textarea
                id="edit-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <p className="text-sm text-muted-foreground">
              Word count: <span className="font-semibold text-foreground">{wordCount.toLocaleString()}</span>
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave || saving || rowLoading || !!loadError}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
