"use client"

/**
 * Top-level error boundary — catches render errors anywhere below it and
 * shows a friendly full-page fallback instead of a blank white screen.
 *
 * Must be a class component: React only supports error boundaries via
 * getDerivedStateFromError / componentDidCatch, there's no hook equivalent.
 */

import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error-tracking service wired up yet — at least keep it in the console.
    console.error("Uncaught error in app tree:", error, info.componentStack)
  }

  handleTryAgain = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
          <h1 className="font-serif text-2xl font-medium text-foreground">Something went wrong</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The app hit an unexpected error. Reloading usually fixes it — if it keeps happening,
            let us know what you were doing when it broke.
          </p>

          {import.meta.env.DEV && (
            <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-foreground">
              <p className="font-semibold text-amber-950 dark:text-amber-100">
                Developer-only detail (not shown in production)
              </p>
              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-muted-foreground">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ""}
              </pre>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button type="button" className="w-full" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={this.handleTryAgain}>
              Try again without reloading
            </Button>
          </div>
        </div>
      </main>
    )
  }
}
