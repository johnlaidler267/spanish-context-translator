"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, LogOut, User, Mail } from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import { SubscriptionStatus } from "@/components/subscription-status"
import { Button } from "@/components/ui/button"
import type { ReadingTheme } from "@/components/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/theme-storage"
import {
  getEffectiveDisplayName,
  sanitizeDisplayName,
  setStoredDisplayName,
} from "@/lib/display-name-storage"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { LegalDocLinks } from "@/components/legal-doc-links"
import { getTranslationLlmDisplayInfo } from "@/lib/translate"
import {
  getStoredLanguageLearningPreferences,
  languageOptionFlagEmoji,
  LEARNING_LANGUAGE_LABEL,
  NATIVE_LANGUAGE_LABEL,
  nativeOptionsForLearning,
  normalizeLanguageLearningPreferences,
  setStoredLanguageLearningPreferences,
  type LearningLanguage,
  type LanguageLearningPreferences,
  type NativeLanguage,
} from "@/lib/language-learning-preferences"

const LEARNING_ORDER: LearningLanguage[] = ["spanish", "french", "english"]

const TABS = ["General", "Account", "Billing"] as const
type SettingsTab = (typeof TABS)[number]
const IS_LOCAL_DEV = import.meta.env.DEV

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

  const goTab = (tab: SettingsTab) => {
    if (tab === "General") setSearchParams({}, { replace: true })
    else setSearchParams({ tab: tab.toLowerCase() }, { replace: true })
  }
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())
  const [signingOut, setSigningOut] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [savedName, setSavedName] = useState("")
  const [nameSavedNotice, setNameSavedNotice] = useState(false)
  const [nameSaveError, setNameSaveError] = useState<string | null>(null)
  const [nameSaving, setNameSaving] = useState(false)
  const [languagePrefs, setLanguagePrefs] = useState<LanguageLearningPreferences>(() =>
    getStoredLanguageLearningPreferences(),
  )
  const displayNameUserKeyRef = useRef<string | undefined>(undefined)
  const { user, signOut, openAuthModal } = useAuth()
  const llmInfo = getTranslationLlmDisplayInfo()
  const normalizedNameInput = sanitizeDisplayName(nameInput)
  const nameDirty = normalizedNameInput !== savedName

  const persistLanguagePrefs = (next: LanguageLearningPreferences) => {
    const saved = setStoredLanguageLearningPreferences(next)
    setLanguagePrefs(saved)
  }

  const setLearningLanguage = (learning: LearningLanguage) => {
    persistLanguagePrefs(
      normalizeLanguageLearningPreferences({ ...languagePrefs, learning }),
    )
  }

  const setNativeLanguage = (native: NativeLanguage) => {
    persistLanguagePrefs(
      normalizeLanguageLearningPreferences({ ...languagePrefs, native }),
    )
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  const handleSaveDisplayName = async () => {
    const sanitized = sanitizeDisplayName(nameInput)
    setNameSaveError(null)
    if (user) {
      setNameSaving(true)
      const { error } = await supabase.auth.updateUser({
        data: { display_name: sanitized },
      })
      setNameSaving(false)
      if (error) {
        setNameSaveError(error.message)
        return
      }
    }
    const nextName = setStoredDisplayName(sanitized)
    setSavedName(nextName)
    setNameInput(nextName)
    setNameSavedNotice(true)
  }

  useEffect(() => {
    const key = user?.id ?? "__guest__"
    if (displayNameUserKeyRef.current === undefined) {
      displayNameUserKeyRef.current = key
      const next = getEffectiveDisplayName(user)
      setNameInput(next)
      setSavedName(next)
      return
    }
    if (displayNameUserKeyRef.current !== key) {
      displayNameUserKeyRef.current = key
      const next = getEffectiveDisplayName(user)
      setNameInput(next)
      setSavedName(next)
    }
  }, [user])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    setStoredReadingTheme(theme)
  }, [theme])

  useEffect(() => {
    if (nameSavedNotice && nameDirty) setNameSavedNotice(false)
  }, [nameSavedNotice, nameDirty])

  // Mobile: same as /upgrade — global overflow:hidden traps scroll; stacked header + doc scroll fixes it.
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
                  <h2 id="settings-general-heading" className="text-lg font-medium text-foreground mb-3">
                    General
                  </h2>
                  <div className="divide-y divide-border/40">
                    <div className="pb-4">
                      <label
                        htmlFor="display-name"
                        className="block text-sm font-medium text-foreground mb-1.5"
                      >
                        What should we call you?
                      </label>

                      <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                        <input
                          id="display-name"
                          type="text"
                          value={nameInput}
                          onChange={(e) => {
                            setNameInput(e.target.value)
                            setNameSaveError(null)
                          }}
                          maxLength={40}
                          placeholder="Your name"
                          autoComplete="name"
                          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/40"
                        />
                        {nameDirty && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleSaveDisplayName()}
                            disabled={nameSaving}
                            className="h-10 shrink-0 sm:min-w-24 font-normal"
                          >
                            {nameSaving ? "Saving…" : "Save"}
                          </Button>
                        )}
                      </div>

                      {nameSaveError && (
                        <p className="mt-2 text-xs text-destructive" role="alert">
                          {nameSaveError}
                        </p>
                      )}

                      {nameSavedNotice && (
                        <div
                          className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
                          aria-live="polite"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-green-500 shrink-0"
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden
                          >
                            <path
                              d="M3 8l3.5 3.5L13 5"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          Saved
                        </div>
                      )}
                    </div>

                    <div className="py-4 space-y-5">
                      <div role="group" aria-labelledby="settings-learning-lang-label">
                        <p
                          id="settings-learning-lang-label"
                          className="text-sm font-medium text-foreground mb-1.5"
                        >
                          I&apos;m learning
                        </p>
                        <div className="flex flex-wrap gap-1.5 p-0.5 rounded-md border border-border bg-muted/20 w-full min-w-0">
                          {LEARNING_ORDER.map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setLearningLanguage(id)}
                              className={[
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors duration-200 ease-in-out shrink-0",
                                languagePrefs.learning === id
                                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                  : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                              ].join(" ")}
                            >
                              <span className="text-[1.05rem] leading-none" aria-hidden>
                                {languageOptionFlagEmoji(id)}
                              </span>
                              {LEARNING_LANGUAGE_LABEL[id]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div role="group" aria-labelledby="settings-native-lang-label">
                        <p
                          id="settings-native-lang-label"
                          className="text-sm font-medium text-foreground mb-1.5"
                        >
                          My native language is
                        </p>
                        <div className="flex flex-wrap gap-1.5 p-0.5 rounded-md border border-border bg-muted/20 w-full min-w-0">
                          {nativeOptionsForLearning(languagePrefs.learning).map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setNativeLanguage(id)}
                              className={[
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors duration-200 ease-in-out shrink-0",
                                languagePrefs.native === id
                                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                                  : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                              ].join(" ")}
                            >
                              <span className="text-[1.05rem] leading-none" aria-hidden>
                                {languageOptionFlagEmoji(id)}
                              </span>
                              {NATIVE_LANGUAGE_LABEL[id]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {IS_LOCAL_DEV && (
                      <div className="py-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Translation models
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                          Which provider and models chunk your text and power Learn-topic paragraphs. Values come from
                          this app&apos;s deployment config (not editable here).
                        </p>
                        <dl className="space-y-3 text-sm border border-border rounded-md p-4 bg-muted/20">
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                              Provider
                            </dt>
                            <dd className="font-mono text-foreground break-all">
                              {llmInfo.provider === "gemini" ? "Gemini" : "Groq"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                              Main translation
                            </dt>
                            <dd className="font-mono text-foreground break-all">{llmInfo.translateModel}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                              Learn / topic paragraph
                            </dt>
                            <dd className="font-mono text-foreground break-all">{llmInfo.learnModel}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {activeTab === "Account" && (
                <section aria-labelledby="settings-account-heading">
                  <h2 id="settings-account-heading" className="text-lg font-medium text-foreground mb-6">
                    Account
                  </h2>

                  {user ? (
                    <div className="space-y-6">
                      {user.is_anonymous === true && (
                        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">Guest session</p>
                          <p className="leading-relaxed">
                            Sign in with Google or email to attach a real account and keep your plan if you switch devices.
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="mt-3"
                            onClick={() => openAuthModal()}
                          >
                            Sign in / Sign up
                          </Button>
                        </div>
                      )}
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
                            {user.email?.trim() ? user.email : "—"}
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
                      <Button onClick={() => openAuthModal()} className="gap-2">
                        Sign in / Sign up
                      </Button>
                    </div>
                  )}
                </section>
              )}
              {/* Signed in: mount billing panel off-tab so data is often ready when user opens Billing (no remount on tab switch). */}
              {user ? (
                <section
                  aria-labelledby="settings-billing-heading"
                  hidden={activeTab !== "Billing"}
                >
                  <h2 id="settings-billing-heading" className="text-lg font-medium text-foreground mb-6">
                    Billing
                  </h2>
                  <SubscriptionStatus />
                </section>
              ) : (
                activeTab === "Billing" && (
                  <section aria-labelledby="settings-billing-heading">
                    <h2 id="settings-billing-heading" className="text-lg font-medium text-foreground mb-6">
                      Billing
                    </h2>
                    <SubscriptionStatus />
                  </section>
                )
              )}
            </div>
          </div>

          <p className="mt-12 text-center text-xs text-muted-foreground">
            <LegalDocLinks />
          </p>
        </div>
      </main>
    </div>
  )
}
