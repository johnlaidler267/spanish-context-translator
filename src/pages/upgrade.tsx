"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Check, BookOpen, Zap, Crown } from "lucide-react"
import { BackToHomeLink } from "@/components/back-to-home-link"
import { MainHeader } from "@/components/main-header"
import type { ReadingTheme } from "@/components/theme-toggle"
import { getStoredReadingTheme, setStoredReadingTheme } from "@/lib/theme-storage"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  TIER_IDS,
  getTier,
  formatPrice,
  type TierId,
  type TierConfig,
} from "@/lib/tiers"

// ─── UI-only: icons don't belong in the data config ──────────────────────────

const TIER_ICONS: Record<TierId, React.ReactNode> = {
  free:      <BookOpen className="h-5 w-5" />,
  pro:       <Zap className="h-5 w-5" />,
  unlimited: <Crown className="h-5 w-5" />,
}

/** Derive human-readable bullet points from a tier's limits + feature flags. */
function tierBullets(tier: TierConfig): string[] {
  const { limits, features } = tier
  const bullets: string[] = []

  // Limits
  bullets.push(
    limits.textsPerMonth === null
      ? "Unlimited texts per month"
      : `${limits.textsPerMonth} texts per month`,
  )

  if (limits.charsPerSubmission !== null) {
    bullets.push(
      `Up to ${limits.charsPerSubmission.toLocaleString()} characters per submission`,
    )
  }

  if (limits.savedTranslations === null) {
    bullets.push("Unlimited saved translations")
  } else if (limits.savedTranslations > 0) {
    bullets.push(`${limits.savedTranslations} saved translations`)
  }

  // Feature flags — only list enabled ones
  if (features.articleMode)        bullets.push("Article mode")
  if (features.readMode)           bullets.push("Read mode")
  if (features.voiceInput)         bullets.push("Voice input")
  if (features.exportTranslations) bullets.push("Export translations")
  if (features.apiAccess)          bullets.push("API access")
  if (features.prioritySupport)    bullets.push("Priority support")
  if (features.dedicatedSupport)   bullets.push("Dedicated support")

  return bullets
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UpgradePage() {
  const [currentPlan] = useState<TierId>("free")
  const [isProcessing, setIsProcessing] = useState<TierId | null>(null)
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    setStoredReadingTheme(theme)
  }, [theme])

  /* Mobile shell locks overflow:hidden on html — must opt out so this page can scroll (see index.css). */
  useEffect(() => {
    document.documentElement.classList.add("mobile-scroll-upgrade")
    return () => document.documentElement.classList.remove("mobile-scroll-upgrade")
  }, [])

  const handleSelectPlan = (planId: TierId) => {
    if (planId === currentPlan) return
    setIsProcessing(planId)
    setTimeout(() => {
      setIsProcessing(null)
      alert(`Redirecting to checkout for ${planId} plan...`)
    }, 1000)
  }

  return (
    <div className="min-h-app bg-background relative">
      <img
        src={theme === "dark" ? "/upgrade-bg-dark.png" : "/upgrade-bg.png"}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          opacity: theme === "dark" ? 0.28 : 0.15,
          filter: theme === "dark" ? "blur(2.3px)" : "none",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div className="shrink-0 relative z-[1]">
        <MainHeader theme={theme} onThemeChange={setTheme} variant="stacked" />
      </div>
      <main className="relative z-[1] overflow-x-hidden pb-16 px-4 md:px-6">
        <div className="max-w-4xl mx-auto overflow-x-hidden">
          <BackToHomeLink className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </BackToHomeLink>

          <div className="mb-10 text-center">
            <h1 className="font-serif text-3xl md:text-4xl font-medium text-foreground">
              Choose your plan
            </h1>
            <p className="mt-2 text-muted-foreground">
              All plans include a 7-day free trial. Cancel anytime.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {TIER_IDS.map((id) => {
              const tier = getTier(id)
              const price = formatPrice(tier.pricing.monthly.amountCents)
              const bullets = tierBullets(tier)
              const isCurrent = id === currentPlan

              return (
                <Card
                  key={id}
                  className={`relative bg-card border transition-all duration-200 ease-in-out ${
                    tier.highlighted
                      ? "border-primary shadow-sm"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  {tier.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                        {tier.badge}
                      </span>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      {TIER_ICONS[id]}
                      <span className="text-sm font-medium">{tier.name}</span>
                    </div>
                    <CardTitle className="flex items-baseline gap-1">
                      <span className="text-3xl font-serif text-foreground">{price}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {tier.tagline}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-2.5 mb-6">
                      {bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span className="text-foreground">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => handleSelectPlan(id)}
                      disabled={isCurrent || isProcessing !== null}
                      variant={isCurrent ? "outline" : tier.highlighted ? "default" : "secondary"}
                      className="w-full"
                    >
                      {isProcessing === id ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : isCurrent ? (
                        "Current plan"
                      ) : (
                        `Upgrade to ${tier.name}`
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
