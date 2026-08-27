"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import { checkSubscriptionStatus, type SubscriptionStatus } from "@/lib/subscription"
import { useAuth } from "@/contexts/auth-context"

export interface SubscriptionContextValue {
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

/** Cap on how long the status check may block the app shell (supabase.auth.getUser can stall on the GoTrue lock). */
const STATUS_CHECK_TIMEOUT_MS = 3000

const TIMED_OUT = Symbol("subscription-status-timeout")

/** Same-module imperative handle so pages can refresh coarse status without `useContext` (avoids duplicate Vite chunks from mixed import specifiers). */
let subscriptionRecheckImpl: ((opts?: { silent?: boolean }) => Promise<void>) | null = null

export function invokeSubscriptionRecheck(opts?: { silent?: boolean }): Promise<void> {
  return subscriptionRecheckImpl?.(opts) ?? Promise.resolve()
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [popupDismissed, setPopupDismissed] = useState(false)
  /** Invalidates in-flight checks so a late result cannot apply to a newer user or newer request. */
  const requestSeqRef = useRef(0)

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

    const seq = ++requestSeqRef.current
    // The timeout only stops the check from blocking the shell — a slow check still applies its
    // result when it lands, so a paid user is never left asserted as "free".
    const pending = checkSubscriptionStatus().then((result) => {
      if (requestSeqRef.current !== seq) return
      setStatus(result.status)
      if (result.status === "lapsed") {
        setPopupDismissed(readLapsedModalAckSession(user?.id))
      }
    })

    let timer: number | undefined
    try {
      await Promise.race([
        pending,
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = window.setTimeout(() => resolve(TIMED_OUT), STATUS_CHECK_TIMEOUT_MS)
        }),
      ])
    } finally {
      window.clearTimeout(timer)
      setIsLoading(false)
      subscriptionBlockingCheckDone = true
    }
  }, [user?.id])

  useLayoutEffect(() => {
    subscriptionRecheckImpl = recheck
    return () => {
      subscriptionRecheckImpl = null
    }
  }, [recheck])

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

export function useSubscriptionOptional(): SubscriptionContextValue | null {
  return useContext(SubscriptionContext)
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider")
  return ctx
}
