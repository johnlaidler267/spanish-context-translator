/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      /**
       * Colours go through color-mix() rather than a bare var() so Tailwind's
       * /opacity modifiers actually compile: `bg-primary/90` needs an
       * <alpha-value> placeholder to substitute into, and a plain hex custom
       * property gives it nowhere to put one — so the utility silently emitted
       * no CSS at all (the same cause as the Discover CTA hover fix, d5226f4).
       * The custom properties themselves stay plain hex, so every var(--x)
       * already written in index.css keeps working unchanged.
       */
      colors: {
        background: "color-mix(in srgb, var(--background) calc(<alpha-value> * 100%), transparent)",
        foreground: "color-mix(in srgb, var(--foreground) calc(<alpha-value> * 100%), transparent)",
        card: "color-mix(in srgb, var(--card) calc(<alpha-value> * 100%), transparent)",
        "card-foreground": "color-mix(in srgb, var(--card-foreground) calc(<alpha-value> * 100%), transparent)",
        popover: "color-mix(in srgb, var(--popover) calc(<alpha-value> * 100%), transparent)",
        "popover-foreground": "color-mix(in srgb, var(--popover-foreground) calc(<alpha-value> * 100%), transparent)",
        primary: "color-mix(in srgb, var(--primary) calc(<alpha-value> * 100%), transparent)",
        "primary-foreground": "color-mix(in srgb, var(--primary-foreground) calc(<alpha-value> * 100%), transparent)",
        secondary: "color-mix(in srgb, var(--secondary) calc(<alpha-value> * 100%), transparent)",
        "secondary-foreground": "color-mix(in srgb, var(--secondary-foreground) calc(<alpha-value> * 100%), transparent)",
        muted: "color-mix(in srgb, var(--muted) calc(<alpha-value> * 100%), transparent)",
        "muted-foreground": "color-mix(in srgb, var(--muted-foreground) calc(<alpha-value> * 100%), transparent)",
        accent: "color-mix(in srgb, var(--accent) calc(<alpha-value> * 100%), transparent)",
        "accent-foreground": "color-mix(in srgb, var(--accent-foreground) calc(<alpha-value> * 100%), transparent)",
        destructive: "color-mix(in srgb, var(--destructive) calc(<alpha-value> * 100%), transparent)",
        "destructive-foreground": "color-mix(in srgb, var(--destructive-foreground) calc(<alpha-value> * 100%), transparent)",
        border: "color-mix(in srgb, var(--border) calc(<alpha-value> * 100%), transparent)",
        input: "color-mix(in srgb, var(--input) calc(<alpha-value> * 100%), transparent)",
        ring: "color-mix(in srgb, var(--ring) calc(<alpha-value> * 100%), transparent)",

        /* Lifted out of hard-coded .tsx literals — see the "Literal palette"
           block in src/index.css. */
        "brand-ink": "color-mix(in srgb, var(--brand-ink) calc(<alpha-value> * 100%), transparent)",
        "brand-ink-mid": "color-mix(in srgb, var(--brand-ink-mid) calc(<alpha-value> * 100%), transparent)",
        "brand-warm": "color-mix(in srgb, var(--brand-warm) calc(<alpha-value> * 100%), transparent)",
        "brand-ground": "color-mix(in srgb, var(--brand-ground) calc(<alpha-value> * 100%), transparent)",
        "plan-accent": "color-mix(in srgb, var(--plan-accent) calc(<alpha-value> * 100%), transparent)",
        "plan-accent-hover": "color-mix(in srgb, var(--plan-accent-hover) calc(<alpha-value> * 100%), transparent)",
        "plan-accent-fg": "color-mix(in srgb, var(--plan-accent-fg) calc(<alpha-value> * 100%), transparent)",
        "plan-quiet": "color-mix(in srgb, var(--plan-quiet) calc(<alpha-value> * 100%), transparent)",
        "plan-border": "color-mix(in srgb, var(--plan-border) calc(<alpha-value> * 100%), transparent)",
        "plan-tint": "color-mix(in srgb, var(--plan-tint) calc(<alpha-value> * 100%), transparent)",
        "plan-ink": "color-mix(in srgb, var(--plan-ink) calc(<alpha-value> * 100%), transparent)",
        "plan-ink-soft": "color-mix(in srgb, var(--plan-ink-soft) calc(<alpha-value> * 100%), transparent)",
        "plan-ink-dim": "color-mix(in srgb, var(--plan-ink-dim) calc(<alpha-value> * 100%), transparent)",
        "plan-ink-dim-hover": "color-mix(in srgb, var(--plan-ink-dim-hover) calc(<alpha-value> * 100%), transparent)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "var(--radius-sm)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        /** Long-form Spanish reading (article + read mode) */
        reading: ["var(--font-reading)", "Georgia", "serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      /**
       * Type scale — values live in :root in src/index.css so CSS and JSX
       * can never drift. Each token pairs a size with its tracking; use
       * these instead of arbitrary `text-[1.05rem] tracking-[-0.015em]`.
       */
      fontSize: {
        "display-3xl": ["var(--text-display-3xl)", { lineHeight: "0.94", letterSpacing: "var(--track-display-3xl)" }],
        "display-2xl": ["var(--text-display-2xl)", { lineHeight: "0.96", letterSpacing: "var(--track-display-2xl)" }],
        "display-xl": ["var(--text-display-xl)", { lineHeight: "1", letterSpacing: "var(--track-display-xl)" }],
        "display-lg": ["var(--text-display-lg)", { lineHeight: "1.1", letterSpacing: "var(--track-display-lg)" }],
        "display-md": ["var(--text-display-md)", { lineHeight: "1.2", letterSpacing: "var(--track-display-md)" }],
        "display-sm": ["var(--text-display-sm)", { lineHeight: "1.25", letterSpacing: "var(--track-display-sm)" }],
        "display-xs": ["var(--text-display-xs)", { lineHeight: "1.35", letterSpacing: "var(--track-display-xs)" }],
        "ui-lg": ["var(--text-ui-lg)", { lineHeight: "1.5", letterSpacing: "var(--track-ui-lg)" }],
        "ui-base": ["var(--text-ui-base)", { lineHeight: "1.55", letterSpacing: "var(--track-ui-base)" }],
        "ui-sm": ["var(--text-ui-sm)", { lineHeight: "1.5", letterSpacing: "var(--track-ui-sm)" }],
        "ui-xs": ["var(--text-ui-xs)", { lineHeight: "1.45", letterSpacing: "var(--track-ui-xs)" }],
        "ui-2xs": ["var(--text-ui-2xs)", { lineHeight: "1.4", letterSpacing: "var(--track-ui-2xs)" }],
        "label-sm": ["var(--text-label-sm)", { lineHeight: "1", letterSpacing: "var(--track-label-sm)" }],
        "label-xs": ["var(--text-label-xs)", { lineHeight: "1", letterSpacing: "var(--track-label-xs)" }],
        "label-2xs": ["var(--text-label-2xs)", { lineHeight: "1", letterSpacing: "var(--track-label-2xs)" }],
        "meta-sm": ["var(--text-meta-sm)", { lineHeight: "1.2", letterSpacing: "var(--track-meta-sm)" }],
        "meta-xs": ["var(--text-meta-xs)", { lineHeight: "1.2", letterSpacing: "var(--track-meta-xs)" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        /**
         * Modal open "bubble pop" — deliberately never scales past 1. The mobile shell
         * locks html/body to overflow:hidden (see .mobile-scroll-discover etc.) so the
         * page doesn't jitter; overflow:hidden on both root and body propagates to the
         * viewport itself, which hard-clips position:fixed elements at its exact edge.
         * An overshoot (scaling briefly past 100%) would get sliced off there and read
         * as a glitch, so the "pop" comes only from the fast-start/soft-landing easing.
         */
        "modal-pop-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.75)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "modal-pop-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.85)" },
        },
        "overlay-fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "overlay-fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "modal-pop-in": "modal-pop-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        "modal-pop-out": "modal-pop-out 0.16s cubic-bezier(0.4, 0, 1, 1) both",
        "overlay-fade-in": "overlay-fade-in 0.25s ease-out both",
        "overlay-fade-out": "overlay-fade-out 0.15s ease-in both",
      },
    },
  },
  plugins: [],
}
