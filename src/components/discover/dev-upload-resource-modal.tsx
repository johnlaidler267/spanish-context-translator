"use client"

import { useMemo, useState, type ChangeEvent } from "react"
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
import type { ContentType } from "@/lib/content-data"

const contentTypeOptions: ContentType[] = ["book", "article", "song", "poem"]

export type DevResourceUpload = {
  title: string
  author: string
  language: string
  type: ContentType
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
  const [language, setLanguage] = useState("")
  const [type, setType] = useState<ContentType>("article")
  const [tagsText, setTagsText] = useState("")
  const [text, setText] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState("")
  const [uploadedImageName, setUploadedImageName] = useState("")

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
    setLanguage("")
    setType("article")
    setTagsText("")
    setText("")
    setCoverImageUrl("")
    setUploadedImageDataUrl("")
    setUploadedImageName("")
  }

  const handleCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ""))
        reader.onerror = () => reject(new Error("Failed to read image file"))
        reader.readAsDataURL(file)
      })
      setUploadedImageDataUrl(dataUrl)
      setUploadedImageName(file.name)
    } catch {
      setUploadedImageDataUrl("")
      setUploadedImageName("")
    }
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
      text: text.trim(),
      tags,
      wordCount,
      coverImage: uploadedImageDataUrl || coverImageUrl.trim() || undefined,
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
              <Input
                id="upload-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="Spanish"
              />
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
            <label htmlFor="upload-tags" className="text-sm font-medium text-foreground">
              Tags
            </label>
            <Input
              id="upload-tags"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="history, beginner, short story"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="upload-image-url" className="text-sm font-medium text-foreground">
              Cover Image URL
            </label>
            <Input
              id="upload-image-url"
              value={coverImageUrl}
              onChange={(event) => setCoverImageUrl(event.target.value)}
              placeholder="https://example.com/cover.jpg"
            />
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
            {uploadedImageName && (
              <p className="text-xs text-muted-foreground">
                Using uploaded image: <span className="font-medium text-foreground">{uploadedImageName}</span>
              </p>
            )}
          </div>

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
