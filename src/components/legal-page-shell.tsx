"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import type { ReadingTheme } from "@/components/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/theme-storage"

type LegalPageShellProps = {
  title: string
  lastUpdated: string
  children: ReactNode
}

export function LegalPageShell({ title, lastUpdated, children }: LegalPageShellProps) {
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    setStoredReadingTheme(theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.add("mobile-scroll-upgrade")
    return () => document.documentElement.classList.remove("mobile-scroll-upgrade")
  }, [])

  return (
    <div className="min-h-app bg-background relative">
      <div className="shrink-0 relative z-[1]">
        <MainHeader theme={theme} onThemeChange={setTheme} variant="stacked" />
      </div>

      <main className="relative z-[1] pb-16 px-4 md:px-8 overflow-x-hidden">
        <div className="max-w-3xl mx-auto">
          <BackToHomeLink className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to reading
          </BackToHomeLink>

          <header className="mb-10">
            <h1 className="font-serif text-3xl md:text-4xl font-medium text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
          </header>

          <article className="space-y-8 text-sm text-foreground leading-relaxed font-sans">
            {children}
          </article>
        </div>
      </main>
    </div>
  )
}
