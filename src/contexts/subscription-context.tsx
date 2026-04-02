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
import { useAuth } from "@/contexts/auth-context"

interface SubscriptionContextValue {
  status: SubscriptionStatus | null
  isLoading: boolean
  isLapsed: boolean
  popupDismissed: boolean
  dismissPopup: () => void
  /** Pass `{ silent: true }` to avoid full-screen loading (e.g. tab visibility refresh). */
  recheck: (opts?: { silent?: boolean }) => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [popupDismissed, setPopupDismissed] = useState(false)

  const recheck = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setIsLoading(true)
    try {
      const result = await checkSubscriptionStatus()
      setStatus(result.status)
      if (result.status === "lapsed") {
        setPopupDismissed(false) // Re-trigger popup on return
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  // After auth finishes its initial session read, and when user id changes (sign in/out).
  // Avoids a second supabase.auth.onAuthStateChange subscription (each one takes the GoTrue lock).
  useEffect(() => {
    if (authLoading) return
    void recheck()
  }, [authLoading, user?.id, recheck])

  // Re-trigger popup when user returns to app (tab focus, navigate back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && (status === "lapsed" || status === "past_due")) {
        if (status === "lapsed") setPopupDismissed(false)
        void recheck({ silent: true })
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
