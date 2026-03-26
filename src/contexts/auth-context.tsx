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
import { clearGuestUses } from "@/lib/guest-usage"

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthModalReason = "limit" | "signup"

interface AuthContextValue {
  user:            User | null
  isLoading:       boolean
  signOut:         () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithOAuth: (provider: "google") => Promise<void>
  /** Open the sign-up/in modal. reason = 'limit' shows "you've hit your limit" copy. */
  openAuthModal:   (reason?: AuthModalReason) => void
  closeAuthModal:  () => void
  authModalOpen:   boolean
  authModalReason: AuthModalReason
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser   ] = useState<User | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [authModalOpen,   setAuthModalOpen  ] = useState(false)
  const [authModalReason, setAuthModalReason] = useState<AuthModalReason>("signup")

  // ── Session restore ────────────────────────────────────────────────────────
  useEffect(() => {
    // getSession resolves immediately from localStorage in Supabase JS v2
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const nextUser = session?.user ?? null
        setUser(nextUser)
        setLoading(false)

        if (nextUser) {
          // User just signed in — clear the guest counter and close the modal
          clearGuestUses()
          setAuthModalOpen(false)
        }
      },
    )

    return () => subscription.unsubscribe()
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

  const openAuthModal = useCallback((reason: AuthModalReason = "signup") => {
    setAuthModalReason(reason)
    setAuthModalOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), [])

  // ── Value ──────────────────────────────────────────────────────────────────

  const value: AuthContextValue = {
    user,
    isLoading,
    signOut,
    signInWithMagicLink,
    signInWithOAuth,
    openAuthModal,
    closeAuthModal,
    authModalOpen,
    authModalReason,
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
