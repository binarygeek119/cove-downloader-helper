import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`rounded-xl border border-border bg-card ${className}`}>
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-xs font-semibold tracking-wide text-secondary uppercase">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <span className="text-muted">{icon}</span>}
      <p className="text-sm text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted">{hint}</p>}
    </Card>
  );
}
