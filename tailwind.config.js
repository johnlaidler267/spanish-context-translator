/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        destructive: "var(--destructive)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards",
      },
    },
  },
  plugins: [],
}
