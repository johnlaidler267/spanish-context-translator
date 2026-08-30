"use client"

import { useCallback, useState } from "react"
import { devMachineTranslatePageEsToEn } from "@/lib/dev-machine-translate-google"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Props = {
  pageText: string
  disabled?: boolean
}

/**
 * Dev-only: full-page Spanish → English via Google’s public translate JSON API (proxied).
 */
export default function DevArticleMachineTranslate({ pageText, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(async () => {
    const src = pageText.trim()
    if (!src) {
      setErr("No page text.")
      setOpen(true)
      return
    }
    setOpen(true)
    setLoading(true)
    setErr(null)
    setResult(null)
    try {
      setResult(await devMachineTranslatePageEsToEn(src))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [pageText])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pointer-events-auto fixed bottom-4 left-4 z-[60] h-auto border-dashed border-amber-500/70 bg-background/95 px-2 py-1 font-mono text-[11px] text-amber-700 shadow-md hover:bg-muted/90 dark:text-amber-400 max-md:bottom-[max(5.5rem,env(safe-area-inset-bottom,0px)+4rem)]"
        disabled={disabled || loading}
        onClick={(e) => {
          e.stopPropagation()
          void run()
        }}
      >
        Dev: MT page
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-border/60 bg-card font-sans">
          <DialogHeader>
            <DialogTitle className="text-base">Machine translation (dev)</DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed">
              Spanish → English via Google’s public <code className="rounded bg-muted px-1 py-0.5">gtx</code>{" "}
              JSON endpoint, fetched through the Vite dev proxy (<code className="rounded bg-muted px-1">/__gtx</code>
              ). Not the product LLM; for comparison only. Requires <code className="rounded bg-muted px-1">npm run dev</code>
              .
            </DialogDescription>
          </DialogHeader>
          {loading && <p className="text-sm text-muted-foreground">Translating…</p>}
          {err && (
            <p className="whitespace-pre-wrap rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {err}
            </p>
          )}
          {result != null && !loading && (
            <pre className="whitespace-pre-wrap font-reading text-[0.95rem] leading-relaxed text-foreground">
              {result}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
