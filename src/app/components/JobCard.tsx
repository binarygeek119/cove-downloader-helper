import { Ban, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { isActiveJob, type JobInfo } from "@/shared/cove/types";
import { Button } from "./Button";

function percent(job: JobInfo): number {
  const value = typeof job.progress === "number" ? job.progress : 0;
  return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
}

function title(job: JobInfo): string {
  const text = job.description || job.type || job.id;
  return text.replace(/^Downloading\s+/i, "");
}

function statusLabel(job: JobInfo): string {
  switch (job.status) {
    case "pending":
      return "Waiting";
    case "running":
      return job.subTask || "Running";
    case "completed":
      return job.subTask || "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function StatusIcon({ job }: { job: JobInfo }) {
  if (job.status === "running") return <Loader2 className="size-4 animate-spin text-accent" aria-hidden />;
  if (job.status === "pending") return <Loader2 className="size-4 text-muted" aria-hidden />;
  if (job.status === "completed") return <CheckCircle2 className="size-4 text-success" aria-hidden />;
  if (job.status === "cancelled") return <Ban className="size-4 text-muted" aria-hidden />;
  return <XCircle className="size-4 text-danger" aria-hidden />;
}

export interface JobCardProps {
  job: JobInfo;
  /** This extension started the job. */
  mine?: boolean;
  onCancel?: (id: string) => Promise<void> | void;
  onHide?: (id: string) => void;
}

export function JobCard({ job, mine = false, onCancel, onHide }: JobCardProps) {
  const active = isActiveJob(job);
  const pct = percent(job);
  const units = job.unitsTotal && job.unitsTotal > 1 ? `${job.unitsCompleted ?? 0}/${job.unitsTotal}` : "";
  return (
    <article className="rounded-xl border border-border bg-card px-3 py-2.5">
      <header className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">
          <StatusIcon job={job} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground" title={job.description}>
            {title(job)}
          </p>
          <p className="truncate text-xs text-muted" title={job.subTask}>
            {statusLabel(job)}
            {units && <span className="ml-1 tabular-nums">· {units}</span>}
            {mine && <span className="ml-1 rounded bg-accent/15 px-1 text-[10px] text-accent">from this browser</span>}
          </p>
        </div>
        {active && <span className="shrink-0 text-xs tabular-nums text-secondary">{pct}%</span>}
        {active && onCancel && (
          <Button
            size="sm"
            variant="subtle"
            aria-label="Cancel job"
            title="Cancel"
            onClick={() => void onCancel(job.id)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        )}
        {!active && onHide && (
          <Button size="sm" variant="subtle" aria-label="Hide from list" title="Hide" onClick={() => onHide(job.id)}>
            <X className="size-3.5" aria-hidden />
          </Button>
        )}
      </header>
      {active && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {pct > 0 ? (
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="progress-indeterminate h-full w-full" />
          )}
        </div>
      )}
      {job.error && <p className="mt-2 text-xs break-words text-danger">{job.error}</p>}
    </article>
  );
}
