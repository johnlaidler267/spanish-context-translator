import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

const linkClass =
  "font-medium text-primary underline underline-offset-2 hover:opacity-90"

type LegalDocLinksProps = {
  className?: string
  /** When true, links open in a new tab (e.g. inside a modal). */
  openInNewTab?: boolean
  /** Muted footer-style links instead of primary accent. */
  variant?: "default" | "subtle"
}

/**
 * Consistent Terms + Privacy Policy links for modals, footers, and checkout copy.
 */
export function LegalDocLinks({ className, openInNewTab, variant = "default" }: LegalDocLinksProps) {
  const rel = openInNewTab ? "noopener noreferrer" : undefined
  const target = openInNewTab ? "_blank" : undefined
  const linkClassResolved =
    variant === "subtle"
      ? "font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      : linkClass

  return (
    <span className={cn("text-inherit", className)}>
      <Link to="/terms" className={linkClassResolved} target={target} rel={rel}>
        Terms
      </Link>
      <span className="mx-1.5 text-border" aria-hidden>
        ·
      </span>
      <Link to="/privacy" className={linkClassResolved} target={target} rel={rel}>
        Privacy Policy
      </Link>
    </span>
  )
}
