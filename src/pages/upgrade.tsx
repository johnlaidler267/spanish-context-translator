"use client"

import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Check, BookOpen, Zap, Crown } from "lucide-react"
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

type PlanType = "free" | "pro" | "unlimited"

const plans = [
  {
    id: "free" as PlanType,
    name: "Free",
    icon: <BookOpen className="h-5 w-5" />,
    price: "$0",
    period: "/month",
    description: "Perfect for getting started",
    features: ["5 texts per month", "Basic chunk translations", "Article mode"],
    popular: false,
  },
  {
    id: "pro" as PlanType,
    name: "Pro",
    icon: <Zap className="h-5 w-5" />,
    price: "$9",
    period: "/month",
    description: "For regular readers",
    features: ["50 texts per month", "Full translations", "Article & Read modes", "Priority support"],
    popular: true,
  },
  {
    id: "unlimited" as PlanType,
    name: "Unlimited",
    icon: <Crown className="h-5 w-5" />,
    price: "$29",
    period: "/month",
    description: "For power users",
    features: ["Unlimited texts", "All Pro features", "API access", "Dedicated support"],
    popular: false,
  },
]

export default function UpgradePage() {
  const [currentPlan] = useState<PlanType>("free")
  const [isProcessing, setIsProcessing] = useState<PlanType | null>(null)
  const [theme, setTheme] = useState<ReadingTheme>(() => getStoredReadingTheme())

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    setStoredReadingTheme(theme)
  }, [theme])

  const handleSelectPlan = (planId: PlanType) => {
    if (planId === currentPlan) return
    setIsProcessing(planId)
    setTimeout(() => {
      setIsProcessing(null)
      alert(`Redirecting to checkout for ${planId} plan...`)
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-background relative">
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
          /* Same subtle blur as landing page dark mode */
          filter: theme === "dark" ? "blur(2.3px)" : "none",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <MainHeader theme={theme} onThemeChange={setTheme} />
      <main className="relative z-[1] pt-20 pb-16 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out mb-8"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>

          <div className="mb-10 text-center">
            <h1 className="font-serif text-3xl md:text-4xl font-medium text-foreground">
              Choose your plan
            </h1>
            <p className="mt-2 text-muted-foreground">
              All plans include a 7-day free trial. Cancel anytime.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`relative bg-card border transition-all duration-200 ease-in-out ${
                  plan.popular
                    ? "border-primary shadow-sm"
                    : "border-border hover:border-border/80"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    {plan.icon}
                    <span className="text-sm font-medium">{plan.name}</span>
                  </div>
                  <CardTitle className="flex items-baseline gap-1">
                    <span className="text-3xl font-serif text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={plan.id === currentPlan || isProcessing !== null}
                    variant={
                      plan.id === currentPlan ? "outline" : plan.popular ? "default" : "secondary"
                    }
                    className="w-full"
                  >
                    {isProcessing === plan.id ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        Processing...
                      </span>
                    ) : plan.id === currentPlan ? (
                      "Current plan"
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
