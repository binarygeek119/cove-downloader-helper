import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

export type StatusTone = "ok" | "info" | "error" | "warn";

const TONES: Record<StatusTone, { className: string; Icon: typeof Info }> = {
  ok: { className: "border-success/40 bg-success/10 text-success", Icon: CheckCircle2 },
  info: { className: "border-accent/40 bg-accent/10 text-foreground", Icon: Info },
  warn: { className: "border-warning/50 bg-warning/10 text-foreground", Icon: AlertCircle },
  error: { className: "border-danger/40 bg-danger/10 text-danger", Icon: AlertCircle },
};

export function StatusLine({ tone, children, action }: { tone: StatusTone; children: ReactNode; action?: ReactNode }) {
  const { className, Icon } = TONES[tone];
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${className}`}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {action}
    </div>
  );
}
