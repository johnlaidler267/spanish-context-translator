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

function lapsedModalSessionKey(userId: string | undefined) {
  return userId ? `lapsed_modal_ack_${userId}` : "lapsed_modal_ack"
}

function readLapsedModalAckSession(userId: string | undefined): boolean {
  if (typeof window === "undefined") return false
  return sessionStorage.getItem(lapsedModalSessionKey(userId)) === "1"
}

function writeLapsedModalAckSession(userId: string | undefined) {
  if (typeof window === "undefined" || !userId) return
  sessionStorage.setItem(lapsedModalSessionKey(userId), "1")
}

/**
 * Survives React Strict Mode remounts (useRef resets; component state resets isLoading to true).
 * After the first completed check in this tab, default rechecks do not toggle the global spinner.
 */
let subscriptionBlockingCheckDone = false

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [popupDismissed, setPopupDismissed] = useState(false)

  useEffect(() => {
    subscriptionBlockingCheckDone = false
  }, [user?.id])

  const recheck = useCallback(async (opts?: { silent?: boolean }) => {
    const silent =
      opts?.silent === true
        ? true
        : opts?.silent === false
          ? false
          : subscriptionBlockingCheckDone
    if (!silent) setIsLoading(true)
    try {
      const result = await checkSubscriptionStatus()
      setStatus(result.status)
      if (result.status === "lapsed") {
        setPopupDismissed(readLapsedModalAckSession(user?.id))
      }
    } finally {
      setIsLoading(false)
      subscriptionBlockingCheckDone = true
    }
  }, [user?.id])

  // After auth finishes its initial session read, and when user id changes (sign in/out).
  // Avoids a second supabase.auth.onAuthStateChange subscription (each one takes the GoTrue lock).
  useEffect(() => {
    if (authLoading) return
    void recheck()
  }, [authLoading, user?.id, recheck])

  // Refresh status when user returns to the tab (do not re-open lapsed modal if dismissed this session).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && (status === "lapsed" || status === "past_due")) {
        void recheck({ silent: true })
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [status, recheck])

  const dismissPopup = useCallback(() => {
    writeLapsedModalAckSession(user?.id)
    setPopupDismissed(true)
  }, [user?.id])

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
