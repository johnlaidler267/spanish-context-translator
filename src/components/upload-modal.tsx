"use client"

import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react"
import { BookOpen, Feather, File, FileText, Music, Upload, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ContentType, DifficultyLevel } from "@/lib/content-data"

interface UploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const contentTypes: { value: ContentType; label: string; icon: ReactNode }[] = [
  { value: "book", label: "Book", icon: <BookOpen className="size-4" /> },
  { value: "article", label: "Article", icon: <FileText className="size-4" /> },
  { value: "song", label: "Song Lyrics", icon: <Music className="size-4" /> },
  { value: "poem", label: "Poem", icon: <Feather className="size-4" /> },
]

const difficultyLevels: { value: DifficultyLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
]

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [selectedType, setSelectedType] = useState<ContentType>("article")
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("beginner")
  const [language, setLanguage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const resetForm = () => {
    setSelectedFile(null)
    setTitle("")
    setAuthor("")
    setSelectedType("article")
    setSelectedDifficulty("beginner")
    setLanguage("")
  }

  const handleSubmit = () => {
    console.log({
      selectedFile,
      title,
      author,
      selectedType,
      selectedDifficulty,
      language,
    })
    onOpenChange(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border/50 bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Upload className="size-5 text-primary" />
            Upload Content
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div
            className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border/50 hover:border-primary/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.pdf,.epub,.doc,.docx"
              onChange={handleFileChange}
            />

            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <File className="size-8 text-primary" />
                <div className="text-left">
                  <p className="font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2"
                  onClick={() => setSelectedFile(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="mx-auto mb-4 size-10 text-muted-foreground" />
                <p className="mb-2 text-foreground">
                  Drag and drop your file here, or{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    browse
                  </button>
                </p>
                <p className="text-sm text-muted-foreground">Supports TXT, PDF, EPUB, DOC, DOCX</p>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Title</label>
              <Input
                placeholder="Enter title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-border/50 bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Author</label>
              <Input
                placeholder="Enter author..."
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="border-border/50 bg-secondary/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Language</label>
            <Input
              placeholder="e.g., Spanish, French, Japanese..."
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="border-border/50 bg-secondary/50"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Content Type</label>
            <div className="flex flex-wrap gap-2">
              {contentTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSelectedType(type.value)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                    selectedType === type.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/50 bg-secondary/50 text-foreground hover:border-primary/50"
                  }`}
                >
                  {type.icon}
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Difficulty Level</label>
            <div className="flex flex-wrap gap-2">
              {difficultyLevels.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setSelectedDifficulty(level.value)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    selectedDifficulty === level.value
                      ? level.value === "beginner"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : level.value === "intermediate"
                          ? "border-amber-500 bg-amber-500/20 text-amber-400"
                          : "border-rose-500 bg-rose-500/20 text-rose-400"
                      : "border-border/50 bg-secondary/50 text-foreground hover:border-primary/50"
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-border/50"
              onClick={() => {
                onOpenChange(false)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={!selectedFile || !title}>
              <Upload className="mr-2 size-4" />
              Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
