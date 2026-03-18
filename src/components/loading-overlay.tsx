"use client"

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        <div className="flex items-center justify-center gap-1.5 mb-4">
          <span className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="h-2 w-2 bg-primary rounded-full animate-bounce" />
        </div>
        <p className="text-muted-foreground font-sans text-sm">
          Analyzing your text...
        </p>
      </div>
    </div>
  )
}
