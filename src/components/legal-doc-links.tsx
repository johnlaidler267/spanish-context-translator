import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

const linkClass =
  "font-medium text-primary underline underline-offset-2 hover:opacity-90"

type LegalDocLinksProps = {
  className?: string
  /** When true, links open in a new tab (e.g. inside a modal). */
  openInNewTab?: boolean
}

/**
 * Consistent Terms + Privacy Policy links for modals, footers, and checkout copy.
 */
export function LegalDocLinks({ className, openInNewTab }: LegalDocLinksProps) {
  const rel = openInNewTab ? "noopener noreferrer" : undefined
  const target = openInNewTab ? "_blank" : undefined

  return (
    <span className={cn("text-inherit", className)}>
      <Link to="/terms" className={linkClass} target={target} rel={rel}>
        Terms
      </Link>
      <span className="mx-1.5 text-border" aria-hidden>
        ·
      </span>
      <Link to="/privacy" className={linkClass} target={target} rel={rel}>
        Privacy Policy
      </Link>
    </span>
  )
}
