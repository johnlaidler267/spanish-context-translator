import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { RiTranslateAi } from "react-icons/ri"
import { LegalDocLinks } from "@/components/legal-doc-links"
import { cn } from "@/lib/utils"

const LEXA_LENS_WORD_GRADIENT =
  "inline-block bg-gradient-to-br from-[#2f2926] via-[#4a3f38] to-[#c97a5a] bg-clip-text text-transparent dark:from-[#e8dfd4] dark:via-[#d4a896] dark:to-[#b06b56]"

type SiteFooterProps = {
  className?: string
  /** Cancels parent horizontal padding so the footer spans edge-to-edge (match the page `<main>` padding). */
  bleedPadClassName?: string
  /** Inner content max-width + horizontal centering. */
  contentMaxClassName?: string
}

function FooterNavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  )
}

function ColumnHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-fraunces text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-foreground/90">
      {children}
    </h3>
  )
}

function BrandWordmark() {
  return (
    <Link
      to="/"
      className="pointer-events-auto inline-flex min-w-0 select-none items-center gap-px"
      aria-label="Lexa Lens — home"
    >
      <span
        className={
          "font-fraunces inline-flex items-center gap-px text-[1.05rem] font-bold leading-none tracking-[-0.03em] antialiased md:text-[1.12rem] " +
          "[font-feature-settings:'kern'_1,'liga'_1]"
        }
      >
        <RiTranslateAi
          className="h-[1rem] w-[1rem] shrink-0 text-[#4a3f38] dark:text-[#d4a896]"
          aria-hidden
        />
        <span className={`${LEXA_LENS_WORD_GRADIENT} inline-flex items-center gap-0.25`}>
          <span>Lexa</span>
          <span
            className="mx-0 mt-1 inline-block h-[3px] w-[4px] rounded-full bg-[#4a3f38] dark:bg-[#d4a896]"
            aria-hidden
          />
          <span>Lens</span>
        </span>
      </span>
    </Link>
  )
}

/**
 * Marketing-style site footer (brand, Product, Legal, Connect + copyright row).
 * Used on Settings, Upgrade, and similar full-page shells.
 */
export function SiteFooter({
  className,
  bleedPadClassName = "-mx-4 md:-mx-8 px-4 md:px-8",
  contentMaxClassName = "max-w-5xl mx-auto",
}: SiteFooterProps) {
  const year = new Date().getFullYear()

  return (
    <footer
      role="contentinfo"
      className={cn(
        "border-t border-border bg-[#f4f0ea] text-foreground dark:bg-card",
        bleedPadClassName,
        className,
      )}
    >
      <div className={cn("py-10 md:py-12", contentMaxClassName)}>
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div className="space-y-3">
            <BrandWordmark />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Read Spanish with translations and explanations grounded in the text you&apos;re reading.
            </p>
          </div>

          <div className="space-y-3">
            <ColumnHeading>Product</ColumnHeading>
            <nav className="flex flex-col gap-2.5" aria-label="Product">
              <FooterNavLink to="/">Home</FooterNavLink>
              <FooterNavLink to="/upgrade">Plans & pricing</FooterNavLink>
              <FooterNavLink to="/settings">Settings</FooterNavLink>
            </nav>
          </div>

          <div className="space-y-3">
            <ColumnHeading>Legal</ColumnHeading>
            <nav className="flex flex-col gap-2.5" aria-label="Legal">
              <FooterNavLink to="/privacy">Privacy Policy</FooterNavLink>
              <FooterNavLink to="/terms">Terms of Service</FooterNavLink>
            </nav>
          </div>

          <div className="space-y-3">
            <ColumnHeading>Connect</ColumnHeading>
            <p className="text-sm leading-relaxed text-muted-foreground">
              For account and billing help, open{" "}
              <Link
                to="/settings"
                className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
              >
                Settings
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-3 border-t border-border/70 pt-6 text-center">
          <p className="font-fraunces text-xs text-muted-foreground">
            © {year} LexaLens. All rights reserved.
          </p>
          <div className="text-xs">
            <LegalDocLinks variant="subtle" />
          </div>
        </div>
      </div>
    </footer>
  )
}
