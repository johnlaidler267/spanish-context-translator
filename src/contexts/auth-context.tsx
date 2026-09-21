"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import type { User } from "@supabase/supabase-js"
import { supabase, getCachedSupabaseUser } from "@/lib/supabase"
import { clearGuestUses } from "@/lib/subscription/guest-usage"
import { invalidateLibraryCache } from "@/lib/storage/library-catalog"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Which door the user came through. Sign-in and sign-up are the *same* operation here
 * (magic link and Google OAuth both create the account on first use), so this only
 * selects the modal's framing — a returning user shouldn't be told to "create an
 * account", and a new one shouldn't have to guess that "Sign in" will also register them.
 */
export type AuthIntent = "signin" | "signup"

interface AuthContextValue {
  user:            User | null
  isLoading:       boolean
  /** True only while an actual sign-in is completing (OAuth/magic-link callback), never on a plain page refresh of an existing session. */
  isSigningIn:     boolean
  signOut:         () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithOAuth: (provider: "google") => Promise<void>
  openAuthModal:   (intent?: AuthIntent) => void
  closeAuthModal:  () => void
  authModalOpen:   boolean
  authModalIntent: AuthIntent
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

/**
 * Where Supabase should send the browser back to once a sign-in (OAuth or magic-link)
 * completes: the current page's path + query, not just the site origin. Without this,
 * a user who opens sign-in mid-checkout (e.g. from `/upgrade`) gets dropped back on the
 * home page instead of staying in the flow they started.
 */
export function currentPageRedirectUrl(): string {
  return window.location.origin + window.location.pathname + window.location.search
}

/**
 * Strips the OAuth/magic-link callback params (`code`, `state`, `error`, `error_description`,
 * or an implicit-flow `#access_token=...` hash) from the address bar in place, without a
 * navigation or reload. Supabase-js's PKCE exchange consumes `code` exactly once; if it's left
 * sitting in the URL and the tab is later reloaded (a plain refresh, or the browser restoring
 * the tab's last URL on relaunch — Chrome's "continue where you left off", Safari's "reopen all
 * windows"), GoTrue tries to redeem the same, now-already-used code again. That exchange fails,
 * and critically its failure short-circuits `_initialize()` before it ever falls back to
 * restoring the perfectly valid session already sitting in localStorage — so the user reads as
 * signed out even though their token was never touched. Called once the first post-callback
 * auth event lands (success or failure), so the URL is clean before any later reload can hit
 * this path.
 */
export function clearAuthCallbackParamsFromUrl(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return
  try {
    const url = new URL(window.location.href)
    let changed = false
    for (const key of ["code", "state", "error", "error_description"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key)
        changed = true
      }
    }
    if (/(?:^#|[&#])access_token=/.test(url.hash)) {
      url.hash = ""
      changed = true
    }
    if (changed) {
      window.history.replaceState(window.history.state, "", url.toString())
    }
  } catch {
    // Best-effort — never let URL cleanup break sign-in.
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seeded from the URL so the very first render already knows; onAuthStateChange's event type
  // (SIGNED_IN vs INITIAL_SESSION) then confirms or corrects it once the real answer is known,
  // before isLoading flips to false — see the effect below.
  const [isSigningIn, setIsSigningIn] = useState(() => isAuthCallbackInUrl())
  // Seeded synchronously from the session supabase-js already persisted to localStorage (skipped
  // mid-callback, where any stored session predates the sign-in now completing), so a returning
  // user's very first render already shows signed-in instead of a guaranteed-wrong "signed out"
  // that flips a few hundred ms later once the real session restores. Best-effort — see
  // getCachedSupabaseUser — and onAuthStateChange below still runs and corrects it either way.
  const [user, setUser] = useState<User | null>(() =>
    isSigningIn ? null : getCachedSupabaseUser(),
  )
  // Same idea: skip the manufactured wait when the seed above is already trustworthy (a cached
  // user, or no session in storage at all — both known synchronously). Only an actual callback
  // in progress still needs to block on the real exchange completing.
  const [isLoading, setLoading] = useState(isSigningIn)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalIntent, setAuthModalIntent] = useState<AuthIntent>("signin")
  // Snapshot of whether THIS page load started mid-callback, captured once (useRef's initial
  // value is only used on first render) — unlike `isSigningIn`, which the effect below
  // reassigns as real events land, this stays put so the effect knows whether to clean the
  // callback params out of the URL once it's handled them. See clearAuthCallbackParamsFromUrl.
  const hadAuthCallbackParamsRef = useRef(isSigningIn)

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

        // The first event after a callback URL is the app's one chance to consume it — clear
        // it whether the callback resolved to a session or not, so a later reload/tab-restore
        // never re-presents an already-used code to GoTrue (see the function's docstring).
        if (hadAuthCallbackParamsRef.current) {
          hadAuthCallbackParamsRef.current = false
          clearAuthCallbackParamsFromUrl()
        }

        if (nextUser) {
          // Signed-in session (initial restore, OAuth return, or sign-in) — clear guest tries, close modal
          clearGuestUses()
          setAuthModalOpen(false)
        } else {
          // No session (explicit sign-out, or one that expired/was revoked elsewhere) — drop
          // the in-memory library cache (library-catalog.ts) so a next sign-in on this same
          // device/browser, by this user or a different one, never briefly shows the prior
          // session's cached books before its own fetch resolves.
          invalidateLibraryCache()
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
          emailRedirectTo: currentPageRedirectUrl(),
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
      options: { redirectTo: currentPageRedirectUrl() },
    })
  }, [])

  const openAuthModal = useCallback((intent: AuthIntent = "signin") => {
    setAuthModalIntent(intent)
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
    authModalIntent,
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
