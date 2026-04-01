"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { checkSubscriptionStatus, type SubscriptionStatus } from "@/lib/subscription"
import { supabase } from "@/lib/supabase"

interface SubscriptionContextValue {
  status: SubscriptionStatus | null
  isLoading: boolean
  isLapsed: boolean
  popupDismissed: boolean
  dismissPopup: () => void
  recheck: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [popupDismissed, setPopupDismissed] = useState(false)

  const recheck = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await checkSubscriptionStatus()
      setStatus(result.status)
      if (result.status === "lapsed") {
        setPopupDismissed(false) // Re-trigger popup on return
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    recheck()
  }, [recheck])

  // Re-check when auth meaningfully changes — not on TOKEN_REFRESHED (refreshSession before
  // Edge calls would otherwise set isLoading and make App.tsx replace the whole UI with a spinner).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return
      void recheck()
    })
    return () => subscription.unsubscribe()
  }, [recheck])

  // Re-trigger popup when user returns to app (tab focus, navigate back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && status === "lapsed") {
        setPopupDismissed(false)
        recheck()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [status, recheck])

  const dismissPopup = useCallback(() => {
    setPopupDismissed(true)
  }, [])

  const value: SubscriptionContextValue = {
    status,
    isLoading,
    isLapsed: status === "lapsed",
    popupDismissed,
    dismissPopup,
    recheck,
  }

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider")
  return ctx
}
