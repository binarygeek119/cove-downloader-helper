import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { useCallback, useEffect, useState } from "react";
import type { CoveClient } from "@/shared/cove/client";
import { isActiveJob, type JobInfo } from "@/shared/cove/types";

const LIVE_POLL_MS = 10_000;
const FALLBACK_POLL_MS = 2_000;

export interface JobsState {
  active: JobInfo[];
  history: JobInfo[];
  /** True while the SignalR hub streams updates; false means the list is polled. */
  live: boolean;
  loaded: boolean;
  error: string | null;
}

const INITIAL: JobsState = { active: [], history: [], live: false, loaded: false, error: null };

function sortNewest(jobs: JobInfo[]): JobInfo[] {
  return [...jobs].sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt));
}

/**
 * Cove's job list. Subscribes to the `/hubs/jobs` SignalR hub for live progress and falls back to
 * polling when the hub is unavailable (auth disabled, proxy without WebSockets, older Cove).
 */
export function useJobs(client: CoveClient | null, token: string, enabled: boolean) {
  const [state, setState] = useState<JobsState>(INITIAL);

  const refresh = useCallback(() => {
    if (!client) return Promise.resolve();
    return Promise.all([client.listJobs(), client.listJobHistory()]).then(
      ([active, history]) =>
        setState((previous) => ({
          ...previous,
          active: active.filter(isActiveJob),
          history: sortNewest(history.filter((job) => !isActiveJob(job))),
          loaded: true,
          error: null,
        })),
      (error: unknown) =>
        setState((previous) => ({
          ...previous,
          loaded: true,
          error: error instanceof Error ? error.message : String(error),
        })),
    );
  }, [client]);

  useEffect(() => {
    if (!client || !enabled) return;
    let disposed = false;
    void refresh();

    const connection = new HubConnectionBuilder()
      .withUrl(`${client.baseUrl}/hubs/jobs`, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.None)
      .build();

    connection.on("JobUpdated", (job: JobInfo) => {
      setState((previous) => {
        const active = previous.active.filter((item) => item.id !== job.id);
        const history = previous.history.filter((item) => item.id !== job.id);
        if (isActiveJob(job)) active.push(job);
        else history.unshift(job);
        return { ...previous, active, history: sortNewest(history) };
      });
    });
    connection.onreconnected(() => void refresh());
    connection.onclose(() => {
      if (!disposed) setState((previous) => ({ ...previous, live: false }));
    });

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPolling = (interval: number) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, interval);
    };

    connection.start().then(
      () => {
        if (disposed) return;
        setState((previous) => ({ ...previous, live: true }));
        // Low-frequency safety net for updates missed during a reconnect.
        startPolling(LIVE_POLL_MS);
      },
      () => {
        if (disposed) return;
        setState((previous) => ({ ...previous, live: false }));
        startPolling(FALLBACK_POLL_MS);
      },
    );

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (connection.state !== HubConnectionState.Disconnected) void connection.stop();
    };
  }, [client, token, enabled, refresh]);

  const cancel = useCallback(
    (id: string) => (client ? client.cancelJob(id).then(() => refresh()) : Promise.resolve()),
    [client, refresh],
  );

  return { ...state, refresh, cancel };
}
