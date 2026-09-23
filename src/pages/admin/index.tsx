"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Trash2 } from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ReadingTheme } from "@/components/reading/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/storage/theme-storage"
import { checkIsDiscoverCurator } from "@/lib/discover/discover-curator"
import {
  grantBetaPro,
  listBetaProGrants,
  revokeBetaPro,
  type BetaProGrant,
} from "@/lib/admin/beta-pro-grants"

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

const DISCOVER_DEV_EDIT = import.meta.env.DEV

export default function AdminPage() {
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    setStoredReadingTheme(theme)
  }, [theme])

  const [authorized, setAuthorized] = useState(DISCOVER_DEV_EDIT)
  const [checkingAuth, setCheckingAuth] = useState(!DISCOVER_DEV_EDIT)
  useEffect(() => {
    if (DISCOVER_DEV_EDIT) return
    let cancelled = false
    void checkIsDiscoverCurator().then((curator) => {
      if (cancelled) return
      setAuthorized(curator)
      setCheckingAuth(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const [grants, setGrants] = useState<BetaProGrant[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const loadGrants = async () => {
    setListError(null)
    try {
      setGrants(await listBetaProGrants())
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load grants")
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    if (!authorized) return
    void loadGrants()
  }, [authorized])

  const [emailInput, setEmailInput] = useState("")
  const [noteInput, setNoteInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [revokingEmail, setRevokingEmail] = useState<string | null>(null)

  const handleAddGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = emailInput.trim()
    if (!email) return
    setSaving(true)
    setFormError(null)
    try {
      await grantBetaPro(email, noteInput.trim() || undefined)
      setEmailInput("")
      setNoteInput("")
      await loadGrants()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to add grant")
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async (email: string) => {
    setRevokingEmail(email)
    setListError(null)
    try {
      await revokeBetaPro(email)
      setGrants((current) => current.filter((g) => g.email !== email))
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to revoke grant")
    } finally {
      setRevokingEmail(null)
    }
  }

  return (
    <div className="min-h-app bg-background relative">
      <div className="shrink-0 relative z-[1]">
        <MainHeader theme={theme} onThemeChange={setTheme} variant="stacked" />
      </div>

      <main className="relative z-[1] overflow-x-hidden px-3 sm:px-4 md:px-8">
        <div className="mx-auto max-w-2xl font-sans antialiased">
          <BackToHomeLink
            className={cn(
              "mb-6 inline-flex items-center rounded-md text-sm text-muted-foreground md:mb-8",
              "transition-colors duration-200 ease-out hover:text-foreground",
              focusRing,
            )}
          >
            <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.65} />
            Back to reading
          </BackToHomeLink>

          <header className="mb-6 md:mb-10">
            <h1 className="font-display text-display-lg font-medium text-foreground md:text-display-xl">
              Beta Pro access
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground md:mt-2 md:text-base">
              Comp specific people to Pro tier, with no usage cap. Works before they&apos;ve signed
              up -- add their email now and they&apos;re activated the moment they create an account.
            </p>
          </header>

          {checkingAuth ? (
            <p className="text-sm text-muted-foreground">Checking access…</p>
          ) : !authorized ? (
            <p className="text-sm text-muted-foreground">
              You don&apos;t have access to this page.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              <form
                onSubmit={handleAddGrant}
                className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-6 dark:shadow-none"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="beta-grant-email" className="mb-1.5 block text-sm font-medium text-foreground">
                      Email
                    </label>
                    <input
                      id="beta-grant-email"
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="friend@example.com"
                      className={cn(
                        "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
                        focusRing,
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="beta-grant-note" className="mb-1.5 block text-sm font-medium text-foreground">
                      Note (optional)
                    </label>
                    <input
                      id="beta-grant-note"
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="e.g. college roommate"
                      className={cn(
                        "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
                        focusRing,
                      )}
                    />
                  </div>
                  <Button type="submit" disabled={saving || !emailInput.trim()}>
                    {saving ? "Adding…" : "Grant Pro"}
                  </Button>
                </div>
                {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
              </form>

              <div className="rounded-xl border border-border/60 bg-card/40 shadow-sm dark:shadow-none">
                {listLoading ? (
                  <p className="p-4 text-sm text-muted-foreground sm:p-6">Loading…</p>
                ) : listError ? (
                  <p className="p-4 text-sm text-destructive sm:p-6">{listError}</p>
                ) : grants.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground sm:p-6">No grants yet.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {grants.map((grant) => (
                      <li key={grant.email} className="flex items-center justify-between gap-3 p-4 sm:p-6">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{grant.email}</p>
                          {grant.note && (
                            <p className="mt-0.5 truncate text-sm text-muted-foreground">{grant.note}</p>
                          )}
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {grant.claimedAt
                              ? `Active since ${new Date(grant.claimedAt).toLocaleDateString()}`
                              : "Pending -- activates on signup"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 gap-1.5 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRevoke(grant.email)}
                          disabled={revokingEmail === grant.email}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.65} aria-hidden />
                          {revokingEmail === grant.email ? "Removing…" : "Revoke"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
