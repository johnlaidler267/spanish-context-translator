"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, LogOut, User, Mail } from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import { SubscriptionStatus } from "@/components/subscription-status"
import { Button } from "@/components/ui/button"
import type { ReadingTheme } from "@/components/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/theme-storage"
import { useAuth } from "@/contexts/auth-context"

const TABS = ["General", "Account", "Billing"] as const
type SettingsTab = (typeof TABS)[number]

const TAB_FROM_PARAM: Record<string, SettingsTab> = {
  general: "General",
  account: "Account",
  billing: "Billing",
}

function tabFromSearchParam(raw: string | null): SettingsTab {
  if (!raw) return "General"
  return TAB_FROM_PARAM[raw.toLowerCase()] ?? "General"
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = tabFromSearchParam(searchParams.get("tab"))
  const [billingKey, setBillingKey] = useState(0)

  const goTab = (tab: SettingsTab) => {
    if (tab === "Billing") setBillingKey((k) => k + 1)
    if (tab === "General") setSearchParams({}, { replace: true })
    else setSearchParams({ tab: tab.toLowerCase() }, { replace: true })
  }
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())
  const [signingOut, setSigningOut] = useState(false)
  const { user, signOut, openAuthModal } = useAuth()

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    setStoredReadingTheme(theme)
  }, [theme])

  return (
    <div className="min-h-app bg-background max-md:min-h-0 max-md:flex max-md:flex-1 max-md:flex-col max-md:overflow-hidden">
      <div className="shrink-0">
        <MainHeader theme={theme} onThemeChange={setTheme} />
      </div>

      <main className="md:pt-20 max-md:pt-[max(5rem,calc(env(safe-area-inset-top,0px)+3.5rem))] pb-16 px-4 md:px-8 max-md:flex-1 max-md:min-h-0 max-md:overflow-y-auto overflow-x-hidden">
        <div className="max-w-5xl mx-auto">
          <BackToHomeLink className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to reading
          </BackToHomeLink>

          <div className="mb-8 md:mb-10">
            <h1 className="font-serif text-3xl md:text-4xl font-medium text-foreground">
              Settings
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage your account and preferences
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 md:gap-12 lg:gap-16">
            <nav className="settings-nav shrink-0 md:w-52" aria-label="Settings sections">
              <ul className="flex flex-col gap-1">
                {TABS.map((tab) => (
                  <li key={tab} className="w-full">
                    <button
                      type="button"
                      onClick={() => goTab(tab)}
                      className={`settings-nav-item w-full text-left px-4 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 ease-in-out ${
                        activeTab === tab
                          ? "settings-nav-item--active text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {tab}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="settings-panel flex-1 min-w-0 border border-border rounded-md bg-card/40 p-6 md:p-8">
              {activeTab === "General" && (
                <section aria-labelledby="settings-general-heading">
                  <h2 id="settings-general-heading" className="text-lg font-medium text-foreground mb-4">
                    General
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    App preferences and display options will appear here.
                  </p>
                </section>
              )}
              {activeTab === "Account" && (
                <section aria-labelledby="settings-account-heading">
                  <h2 id="settings-account-heading" className="text-lg font-medium text-foreground mb-6">
                    Account
                  </h2>

                  {user ? (
                    <div className="space-y-6">
                      {/* Email */}
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Mail className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                            Email
                          </p>
                          <p className="text-sm text-foreground font-sans break-all">
                            {user.email}
                          </p>
                        </div>
                      </div>

                      {/* User ID (helpful for support) */}
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                            Account ID
                          </p>
                          <p className="text-xs text-muted-foreground font-mono break-all">
                            {user.id}
                          </p>
                        </div>
                      </div>

                      {/* Sign out */}
                      <div className="pt-2 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 text-muted-foreground hover:text-foreground"
                          onClick={handleSignOut}
                          disabled={signingOut}
                        >
                          <LogOut className="h-4 w-4" />
                          {signingOut ? "Signing out…" : "Sign out"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        You're not signed in. Sign in to save your reading history and manage your plan.
                      </p>
                      <Button onClick={() => openAuthModal("signup")} className="gap-2">
                        Sign in / Sign up
                      </Button>
                    </div>
                  )}
                </section>
              )}
              {activeTab === "Billing" && (
                <section aria-labelledby="settings-billing-heading">
                  <h2 id="settings-billing-heading" className="text-lg font-medium text-foreground mb-6">
                    Billing
                  </h2>
                  <SubscriptionStatus key={billingKey} />
                </section>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
