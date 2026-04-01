"use client"

import { useState, type ReactNode } from "react"
import { Mail, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export interface AuthSignInOptionsProps {
  /** Shown under the primary buttons when not in "sent" state (e.g. dev-only bypass). */
  extraActions?: ReactNode
}

/**
 * Magic link + Google OAuth block shared by {@link AuthModal} and {@link GuestSignupModal}.
 */
export function AuthSignInOptions({ extraActions }: AuthSignInOptionsProps) {
  const { signInWithMagicLink, signInWithOAuth } = useAuth()
  const [email, setEmail] = useState("")
  const [stage, setStage] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [errMsg, setErrMsg] = useState("")
  const [oauthLoading, setOAuthLoading] = useState(false)

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStage("sending")
    setErrMsg("")
    const { error } = await signInWithMagicLink(email.trim())
    if (error) {
      setErrMsg(error)
      setStage("error")
    } else {
      setStage("sent")
    }
  }

  const handleGoogle = async () => {
    setOAuthLoading(true)
    try {
      await signInWithOAuth("google")
    } catch {
      setOAuthLoading(false)
    }
  }

  if (stage === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="font-medium text-foreground">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a magic link to <span className="font-medium text-foreground">{email}</span>. Click it to sign in
          instantly.
        </p>
        <button
          type="button"
          onClick={() => setStage("idle")}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        className="w-full gap-2 mb-4"
        onClick={handleGoogle}
        disabled={oauthLoading || stage === "sending"}
      >
        {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-2 text-xs text-muted-foreground">or</span>
        </div>
      </div>

      <form onSubmit={handleSendLink} className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full pl-9 pr-3 py-2.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
            style={{ fontSize: "16px" }}
          />
        </div>

        {stage === "error" && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {errMsg || "Something went wrong. Please try again."}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={stage === "sending" || !email.trim()}>
          {stage === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Sending…
            </>
          ) : (
            "Send magic link"
          )}
        </Button>
      </form>

      {extraActions}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        By signing up you agree to our{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </a>
        .
      </p>
    </>
  )
}
