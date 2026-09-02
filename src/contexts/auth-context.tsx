"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { clearGuestUses } from "@/lib/subscription/guest-usage"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:            User | null
  isLoading:       boolean
  /** True only while an actual sign-in is completing (OAuth/magic-link callback), never on a plain page refresh of an existing session. */
  isSigningIn:     boolean
  signOut:         () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithOAuth: (provider: "google") => Promise<void>
  openAuthModal:   () => void
  closeAuthModal:  () => void
  authModalOpen:   boolean
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * True only while the current page load looks like it's completing an OAuth or magic-link
 * sign-in (i.e. the browser was just redirected back from the provider/email link), not a
 * plain refresh of a page that already has a session. Supabase's browser client defaults to
 * the PKCE flow, which returns with "?code=..." (or "?error=..." on a failed attempt); the
 * older implicit flow returns tokens in the "#access_token=..." hash. Either marks an
 * in-progress sign-in attempt, distinct from onAuthStateChange's INITIAL_SESSION (a restore
 * of an existing session, which carries no such URL).
 */
export function isAuthCallbackInUrl(): boolean {
  if (typeof window === "undefined") return false
  const { search, hash } = window.location
  return (
    /[?&]code=/.test(search) ||
    /[?&]error(_description)?=/.test(search) ||
    /(?:^#|[&#])access_token=/.test(hash)
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser   ] = useState<User | null>(null)
  const [isLoading, setLoading] = useState(true)
  // Seeded from the URL so the very first render already knows; onAuthStateChange's event type
  // (SIGNED_IN vs INITIAL_SESSION) then confirms or corrects it once the real answer is known,
  // before isLoading flips to false — see the effect below.
  const [isSigningIn, setIsSigningIn] = useState(() => isAuthCallbackInUrl())
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // ── Session restore ────────────────────────────────────────────────────────
  // Single path: onAuthStateChange emits INITIAL_SESSION (and later events) under the
  // same lock as other GoTrue work. Avoid also calling getSession() here — parallel
  // calls + a second onAuthStateChange in SubscriptionProvider fight the Web Lock and
  // trigger Strict Mode "orphaned lock" warnings in dev.
  useEffect(() => {
    const fallback = window.setTimeout(() => setLoading(false), 3000)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        window.clearTimeout(fallback)
        const nextUser = session?.user ?? null
        setUser(nextUser)
        // INITIAL_SESSION is just a restore of an already-established session (e.g. a plain
        // refresh) — never an active login, whatever the URL looked like on first paint.
        // SIGNED_IN is a genuine sign-in completing (OAuth/magic-link callback or otherwise).
        setIsSigningIn(event === "SIGNED_IN")
        setLoading(false)

        if (nextUser) {
          // Signed-in session (initial restore, OAuth return, or sign-in) — clear guest tries, close modal
          clearGuestUses()
          setAuthModalOpen(false)
        }
      },
    )

    return () => {
      window.clearTimeout(fallback)
      subscription.unsubscribe()
    }
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  const signInWithMagicLink = useCallback(
    async (email: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: true,
        },
      })
      if (error) return { error: error.message }
      return { error: null }
    },
    [],
  )

  const signInWithOAuth = useCallback(async (provider: "google") => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }, [])

  const openAuthModal = useCallback(() => {
    setAuthModalOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), [])

  // ── Value ──────────────────────────────────────────────────────────────────

  const value: AuthContextValue = {
    user,
    isLoading,
    isSigningIn,
    signOut,
    signInWithMagicLink,
    signInWithOAuth,
    openAuthModal,
    closeAuthModal,
    authModalOpen,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
