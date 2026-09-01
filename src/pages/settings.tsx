"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, Check, CreditCard, LogOut, SlidersHorizontal, UserRound } from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import { SubscriptionStatus } from "@/components/subscription/subscription-status"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ReadingTheme } from "@/components/reading/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/storage/theme-storage"
import {
  getEffectiveDisplayName,
  sanitizeDisplayName,
  setStoredDisplayName,
} from "@/lib/storage/display-name-storage"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { SiteFooter } from "@/components/site-footer"
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
} from "@/lib/storage/language-learning-preferences"

const LEARNING_ORDER: LearningLanguage[] = ["spanish", "french", "english"]

const TABS = [
  { id: "General", Icon: SlidersHorizontal },
  { id: "Account", Icon: UserRound },
  { id: "Billing", Icon: CreditCard },
] as const

type SettingsTab = (typeof TABS)[number]["id"]
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

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const id = `settings-${title.toLowerCase()}-heading`
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="font-display text-lg font-medium tracking-[-0.015em] text-foreground sm:text-xl"
      >
        {title}
      </h2>
      <div className="mt-5 divide-y divide-border/50 border-t border-border/50">{children}</div>
    </section>
  )
}

function SettingsRow({
  label,
  description,
  htmlFor,
  labelAs = "label",
  children,
}: {
  label: string
  description?: string
  htmlFor?: string
  labelAs?: "label" | "p"
  children: ReactNode
}) {
  const labelClass = "block text-sm font-semibold text-foreground"
  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
      <div className="min-w-0 sm:max-w-[19rem] sm:pt-1.5">
        {labelAs === "label" ? (
          <label htmlFor={htmlFor} className={labelClass}>
            {label}
          </label>
        ) : (
          <p id={htmlFor} className={labelClass}>
            {label}
          </p>
        )}
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 sm:flex sm:max-w-[22rem] sm:flex-1 sm:justify-end">{children}</div>
    </div>
  )
}

function LanguageSegmentedControl<T extends LearningLanguage | NativeLanguage>({
  options,
  value,
  labels,
  onSelect,
  labelledBy,
}: {
  options: readonly T[]
  value: T
  labels: Record<T, string>
  onSelect: (next: T) => void
  labelledBy: string
}) {
  // Single-option groups shouldn't stretch into one full-width segment.
  const stretch = options.length > 1
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={cn(
        "flex max-w-full flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1",
        stretch ? "w-full sm:w-auto" : "w-fit",
      )}
    >
      {options.map((id) => {
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
              "transition-[color,background-color,box-shadow] duration-200 ease-out",
              stretch && "flex-1 sm:flex-none",
              focusRing,
              active
                ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border"
                : "font-normal text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <span className="text-[1.05rem] leading-none" aria-hidden>
              {languageOptionFlagEmoji(id)}
            </span>
            {labels[id]}
          </button>
        )
      })}
    </div>
  )
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="font-sans text-label-xs font-bold uppercase text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 break-all text-sm text-foreground",
          mono && "font-mono text-xs text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  )
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

      <main className="relative z-[1] overflow-x-hidden px-3 sm:px-4 md:px-8">
        <div className="mx-auto max-w-5xl font-sans [font-feature-settings:'kern'_1,'liga'_1] [text-rendering:optimizeLegibility] antialiased">
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
              Settings
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground md:mt-2 md:text-base">
              Manage your account and preferences
            </p>
          </header>

          <div className="flex flex-col gap-5 md:flex-row md:gap-12 lg:gap-14">
            <nav className="shrink-0 md:w-52" aria-label="Settings sections">
              <ul className="-mx-1 flex snap-x snap-mandatory flex-row gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
                {TABS.map(({ id, Icon }) => {
                  const active = activeTab === id
                  return (
                    <li key={id} className="flex-none snap-start md:w-full">
                      <button
                        type="button"
                        onClick={() => goTab(id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm",
                          "transition-colors duration-200 ease-out",
                          focusRing,
                          active
                            ? "bg-secondary font-medium text-foreground"
                            : "font-normal text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors duration-200 ease-out",
                            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                          )}
                          strokeWidth={1.65}
                          aria-hidden
                        />
                        {id}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="min-w-0 flex-1 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm sm:p-6 md:p-8 dark:shadow-none">
              {activeTab === "General" && (
                <SettingsSection title="General">
                  <SettingsRow
                    label="Display name"
                    description="What we call you around the app."
                    htmlFor="display-name"
                  >
                    <div className="w-full">
                      <div className="flex flex-col gap-2 sm:flex-row">
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
                          className={cn(
                            "h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground shadow-sm",
                            "transition-colors duration-200 ease-out placeholder:text-muted-foreground/40",
                            "outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
                          )}
                        />
                        {nameDirty && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleSaveDisplayName()}
                            disabled={nameSaving}
                            className="h-10 shrink-0 font-normal sm:min-w-[5rem]"
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
                        <p
                          className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
                          aria-live="polite"
                        >
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                          Saved
                        </p>
                      )}
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    label="I'm learning"
                    description="The language your articles are written in."
                    htmlFor="settings-learning-lang-label"
                    labelAs="p"
                  >
                    <LanguageSegmentedControl
                      options={LEARNING_ORDER}
                      value={languagePrefs.learning}
                      labels={LEARNING_LANGUAGE_LABEL}
                      onSelect={setLearningLanguage}
                      labelledBy="settings-learning-lang-label"
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="My native language"
                    description="Translations and explanations use this language."
                    htmlFor="settings-native-lang-label"
                    labelAs="p"
                  >
                    <LanguageSegmentedControl
                      options={nativeOptionsForLearning(languagePrefs.learning)}
                      value={languagePrefs.native}
                      labels={NATIVE_LANGUAGE_LABEL}
                      onSelect={setNativeLanguage}
                      labelledBy="settings-native-lang-label"
                    />
                  </SettingsRow>

                  {IS_LOCAL_DEV && (
                    <SettingsRow
                      label="Translation models"
                      description="Set by this deployment's config — not editable here."
                      labelAs="p"
                    >
                      <dl className="w-full space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                        <ReadOnlyField
                          label="Provider"
                          value={llmInfo.provider === "gemini" ? "Gemini" : "Groq"}
                          mono
                        />
                        <ReadOnlyField label="Main translation" value={llmInfo.translateModel} mono />
                        <ReadOnlyField label="Learn / topic paragraph" value={llmInfo.learnModel} mono />
                      </dl>
                    </SettingsRow>
                  )}
                </SettingsSection>
              )}

              {activeTab === "Account" && (
                <SettingsSection title="Account">
                  {user ? (
                    <>
                      {user.is_anonymous === true && (
                        <div className="py-5">
                          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3.5">
                            <p className="text-sm font-semibold text-foreground">Guest session</p>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                              Sign in with Google or email to attach a real account and keep your plan if you
                              switch devices.
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
                        </div>
                      )}

                      <SettingsRow label="Email" description="Where account notices are sent." labelAs="p">
                        <p className="w-full break-all text-sm text-foreground sm:pt-1.5 sm:text-right">
                          {user.email?.trim() ? user.email : "—"}
                        </p>
                      </SettingsRow>

                      <SettingsRow
                        label="Account ID"
                        description="Share this if you contact support."
                        labelAs="p"
                      >
                        <p className="w-full break-all font-mono text-xs text-muted-foreground sm:pt-2 sm:text-right">
                          {user.id}
                        </p>
                      </SettingsRow>

                      {user.is_anonymous !== true && (
                        <SettingsRow
                          label="Sign out"
                          description="End this session on this device."
                          labelAs="p"
                        >
                          <Button
                            variant="outline"
                            className="h-10 gap-2 font-normal text-muted-foreground hover:text-foreground"
                            onClick={handleSignOut}
                            disabled={signingOut}
                          >
                            <LogOut className="h-4 w-4" strokeWidth={1.65} aria-hidden />
                            {signingOut ? "Signing out…" : "Sign out"}
                          </Button>
                        </SettingsRow>
                      )}
                    </>
                  ) : (
                    <div className="py-5">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        You&apos;re not signed in. Sign in to save your reading history and manage your plan.
                      </p>
                      <Button onClick={() => openAuthModal()} className="mt-4">
                        Sign in / Sign up
                      </Button>
                    </div>
                  )}
                </SettingsSection>
              )}

              {/* Signed in: mount billing panel off-tab so data is often ready when user opens Billing (no remount on tab switch). */}
              {user ? (
                <div hidden={activeTab !== "Billing"}>
                  <SettingsSection title="Billing">
                    <div className="py-5">
                      <SubscriptionStatus />
                    </div>
                  </SettingsSection>
                </div>
              ) : (
                activeTab === "Billing" && (
                  <SettingsSection title="Billing">
                    <div className="py-5">
                      <SubscriptionStatus />
                    </div>
                  </SettingsSection>
                )
              )}
            </div>
          </div>
        </div>

        <SiteFooter className="mt-12" />
      </main>
    </div>
  )
}
