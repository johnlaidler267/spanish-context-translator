import type { ReactNode } from "react"

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </section>
  )
}
