import { ChevronDown, Inbox, Radio, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { JobInfo } from "@/shared/cove/types";
import { Button } from "../components/Button";
import { EmptyState, Section } from "../components/Card";
import { JobCard } from "../components/JobCard";
import { StatusLine } from "../components/StatusLine";
import type { ConnectionState } from "../hooks/useCove";
import type { useJobs } from "../hooks/useJobs";

const HIDDEN_KEY = "hiddenJobs";
const HIDDEN_LIMIT = 300;
const HISTORY_SHOWN = 25;

/** Cove keeps job history itself; the panel only remembers which finished jobs the user dismissed. */
function useHiddenJobs() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void chrome.storage.local.get(HIDDEN_KEY).then((stored) => {
      if (cancelled) return;
      const ids = stored[HIDDEN_KEY];
      setHidden(new Set(Array.isArray(ids) ? (ids as string[]) : []));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hide = useCallback(async (ids: string[]) => {
    setHidden((previous) => {
      const next = new Set(previous);
      for (const id of ids) next.add(id);
      const list = [...next].slice(-HIDDEN_LIMIT);
      void chrome.storage.local.set({ [HIDDEN_KEY]: list });
      return new Set(list);
    });
  }, []);

  return { hidden, hide };
}

export interface QueueViewProps {
  jobs: ReturnType<typeof useJobs>;
  mine: Set<string>;
  connection: ConnectionState;
}

export function QueueView({ jobs, mine, connection }: QueueViewProps) {
  const { hidden, hide } = useHiddenJobs();
  const [historyOpen, setHistoryOpen] = useState(true);
  const history = jobs.history.filter((job: JobInfo) => !hidden.has(job.id)).slice(0, HISTORY_SHOWN);

  if (connection.phase === "offline" || connection.phase === "auth") {
    return <StatusLine tone="error">{connection.message}</StatusLine>;
  }

  return (
    <div className="space-y-5">
      <Section
        title={`Active${jobs.active.length ? ` · ${jobs.active.length}` : ""}`}
        action={
          <span className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-[11px] text-muted"
              title={jobs.live ? "Live updates from Cove" : "Refreshing every two seconds"}
            >
              <Radio className={`size-3 ${jobs.live ? "text-success" : "text-muted"}`} aria-hidden />
              {jobs.live ? "Live" : "Polling"}
            </span>
            <Button size="sm" variant="subtle" aria-label="Refresh" title="Refresh" onClick={() => void jobs.refresh()}>
              <RefreshCw className="size-3.5" aria-hidden />
            </Button>
          </span>
        }
      >
        {jobs.error && <StatusLine tone="error">{jobs.error}</StatusLine>}
        {jobs.loaded && !jobs.active.length && !jobs.error && (
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title="No active jobs"
            hint="Downloads you start show up here with live progress."
          />
        )}
        <div className="space-y-2">
          {jobs.active.map((job) => (
            <JobCard key={job.id} job={job} mine={mine.has(job.id)} onCancel={jobs.cancel} />
          ))}
        </div>
      </Section>

      <Section
        title="Recent"
        action={
          <span className="flex items-center gap-1">
            {history.length > 0 && (
              <Button size="sm" variant="subtle" onClick={() => void hide(history.map((job) => job.id))}>
                Clear list
              </Button>
            )}
            <Button
              size="sm"
              variant="subtle"
              aria-expanded={historyOpen}
              aria-label="Toggle recent jobs"
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <ChevronDown className={`size-4 transition-transform ${historyOpen ? "" : "-rotate-90"}`} aria-hidden />
            </Button>
          </span>
        }
      >
        {historyOpen && (
          <div className="space-y-2">
            {history.length === 0 && jobs.loaded && <p className="px-0.5 text-xs text-muted">Nothing finished yet.</p>}
            {history.map((job) => (
              <JobCard key={job.id} job={job} mine={mine.has(job.id)} onHide={(id) => void hide([id])} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
