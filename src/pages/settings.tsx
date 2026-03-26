"use client"

import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import { SubscriptionStatus } from "@/components/subscription-status"
import type { ReadingTheme } from "@/components/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/theme-storage"

const TABS = ["General", "Account", "Billing"] as const
type SettingsTab = (typeof TABS)[number]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("General")
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())

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
                      onClick={() => setActiveTab(tab)}
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
                  <h2 id="settings-account-heading" className="text-lg font-medium text-foreground mb-4">
                    Account
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Email, password, and profile details will appear here.
                  </p>
                </section>
              )}
              {activeTab === "Billing" && (
                <section aria-labelledby="settings-billing-heading">
                  <h2 id="settings-billing-heading" className="text-lg font-medium text-foreground mb-6">
                    Billing
                  </h2>
                  <SubscriptionStatus />
                </section>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
