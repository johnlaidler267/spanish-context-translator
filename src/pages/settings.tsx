"use client"

import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Check, BookOpen, Zap, Crown } from "lucide-react"
import { MainHeader } from "@/components/main-header"
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

export default function SettingsPage() {
  const [currentPlan] = useState<PlanType>("free")
  const [isProcessing, setIsProcessing] = useState<PlanType | null>(null)

  const handleSelectPlan = (planId: PlanType) => {
    if (planId === currentPlan) return

    setIsProcessing(planId)
    setTimeout(() => {
      setIsProcessing(null)
      alert(`Redirecting to checkout for ${planId} plan...`)
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-background">
      <MainHeader />

      <main className="pt-20 pb-16 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to reading
          </Link>

          <div className="mb-10">
            <h1 className="font-serif text-3xl md:text-4xl font-medium text-foreground">
              Settings
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage your subscription and account preferences
            </p>
          </div>

          <section className="mb-12">
            <h2 className="text-lg font-medium text-foreground mb-4">
              Current Subscription
            </h2>
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
                      {plans.find((p) => p.id === currentPlan)?.icon}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {plans.find((p) => p.id === currentPlan)?.name} Plan
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {currentPlan === "free"
                          ? "5 texts remaining this month"
                          : "Renews on April 18, 2026"}
                      </p>
                    </div>
                  </div>
                  {currentPlan !== "free" && (
                    <Button variant="outline" size="sm" className="text-muted-foreground">
                      Manage billing
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-4">
              Available Plans
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={`relative bg-card border transition-all ${
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
                      <span className="text-3xl font-serif text-foreground">
                        {plan.price}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {plan.period}
                      </span>
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
                        plan.id === currentPlan
                          ? "outline"
                          : plan.popular
                            ? "default"
                            : "secondary"
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
          </section>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            All plans include a 7-day free trial. Cancel anytime.
          </p>
        </div>
      </main>
    </div>
  )
}
