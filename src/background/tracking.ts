import { isActiveJob, type JobInfo } from "../shared/cove/types";
import { broadcast } from "../shared/messaging";
import type { JobFinished, TrackedJob } from "../shared/models";
import { setActiveJobCount, updateBadge } from "./badge";
import { clientFor } from "./cove";
import { addToPool } from "./pool";
import { settingsCache } from "./settings-cache";

/**
 * Duplicate protection for downloads that are still in progress, and the list of jobs this
 * extension started. Cove rejects a URL that is already in the library, but it does not know
 * about a second click while the first download is still running. State lives in
 * `chrome.storage.session` so it survives the service worker being suspended.
 */
const STATE_KEY = "tracking";
const RESERVATION_TTL = 90 * 1000;
const POLL_INTERVAL = 2000;
const ALARM_NAME = "cove-tracking";

interface Reservation {
  at: number;
  jobId?: string;
}

interface TrackingState {
  reservations: Record<string, Reservation>;
  jobs: TrackedJob[];
}

let writeChain: Promise<void> = Promise.resolve();

async function readState(): Promise<TrackingState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  const state = stored[STATE_KEY] as TrackingState | undefined;
  return state ? { reservations: state.reservations ?? {}, jobs: state.jobs ?? [] } : { reservations: {}, jobs: [] };
}

/** Serialize read-modify-write cycles; several sends can land at once. */
function mutate<T>(fn: (state: TrackingState) => T | Promise<T>): Promise<T> {
  const run = writeChain.then(async () => {
    const state = await readState();
    const result = await fn(state);
    await chrome.storage.session.set({ [STATE_KEY]: state });
    return result;
  });
  writeChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

function pruneReservations(state: TrackingState, now: number): void {
  for (const [key, reservation] of Object.entries(state.reservations)) {
    if (!reservation.jobId && now - reservation.at > RESERVATION_TTL) delete state.reservations[key];
  }
}

/** Reserve URL keys. Returns the keys that were already reserved (still downloading). */
export function reserveKeys(keys: readonly string[]): Promise<string[]> {
  return mutate((state) => {
    const now = Date.now();
    pruneReservations(state, now);
    const busy: string[] = [];
    for (const key of keys) {
      if (state.reservations[key]) busy.push(key);
      else state.reservations[key] = { at: now };
    }
    return busy;
  });
}

export function releaseKeys(keys: readonly string[]): Promise<void> {
  return mutate((state) => {
    for (const key of keys) delete state.reservations[key];
  });
}

/** Tie reserved keys to the job Cove created, and start watching that job. */
export async function trackJob(job: TrackedJob, keys: readonly string[]): Promise<void> {
  await mutate((state) => {
    for (const key of keys) state.reservations[key] = { at: Date.now(), jobId: job.jobId };
    state.jobs = [...state.jobs.filter((existing) => existing.jobId !== job.jobId), job];
  });
  await publishJobs();
  ensurePolling();
}

export async function listTrackedJobs(): Promise<TrackedJob[]> {
  return (await readState()).jobs;
}

async function publishJobs(): Promise<void> {
  const state = await readState();
  setActiveJobCount(state.jobs.length);
  await updateBadge();
  broadcast({ kind: "tracked-jobs-changed", jobs: state.jobs });
}

/** "Downloaded 3 of 5 items." as Cove phrases a finished batch; null for single downloads. */
export function parseBatchSummary(message: string): { succeeded: number; total: number } | null {
  const match = /Downloaded (\d+) of (\d+) item/i.exec(message);
  return match ? { succeeded: Number(match[1]), total: Number(match[2]) } : null;
}

/**
 * Report a finished job to the panel. A pool batch where nothing downloaded puts its URLs back in
 * the pool, so a server-side problem does not lose the list. Partial failures stay in Cove's job
 * history, which names the URLs that were skipped.
 */
async function finishJob(job: TrackedJob, info: JobInfo | null): Promise<void> {
  const status = info?.status === "completed" || info?.status === "cancelled" ? info.status : "failed";
  const message = (info?.error || info?.subTask || "").replace(/\s+/g, " ").trim();
  const summary = parseBatchSummary(message);
  let restoredToPool = false;
  if (job.source === "pool" && summary && summary.total > 0 && summary.succeeded === 0 && job.urls.length) {
    const result = await addToPool(job.urls.map((url) => ({ url })));
    restoredToPool = result.added > 0;
  }
  const result: JobFinished = {
    job,
    status,
    message,
    succeeded: summary?.succeeded ?? null,
    total: summary?.total ?? null,
    restoredToPool,
  };
  broadcast({ kind: "job-finished", result });
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let polling = false;

function ensurePolling(): void {
  if (pollTimer || polling) return;
  pollTimer = setTimeout(() => void poll(), POLL_INTERVAL);
  // Safety net: if Chrome suspends this worker mid-poll, the alarm resumes tracking.
  void chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

async function poll(): Promise<void> {
  pollTimer = null;
  if (polling) return;
  polling = true;
  try {
    const state = await readState();
    if (!state.jobs.length) {
      await chrome.alarms.clear(ALARM_NAME);
      return;
    }
    const settings = await settingsCache.get();
    const client = clientFor(settings);
    const finished: { job: TrackedJob; info: JobInfo | null }[] = [];
    await Promise.all(
      state.jobs.map(async (job) => {
        try {
          const info = await client.getJob(job.jobId);
          if (!isActiveJob(info)) finished.push({ job, info });
        } catch {
          // A 404 means Cove dropped the job from its queue; anything else is a transient failure.
          if (Date.now() - job.startedAt > 24 * 60 * 60 * 1000) finished.push({ job, info: null });
        }
      }),
    );
    if (finished.length) {
      const finishedIds = new Set(finished.map((entry) => entry.job.jobId));
      await mutate((current) => {
        current.jobs = current.jobs.filter((job) => !finishedIds.has(job.jobId));
        for (const [key, reservation] of Object.entries(current.reservations)) {
          if (reservation.jobId && finishedIds.has(reservation.jobId)) delete current.reservations[key];
        }
      });
      await publishJobs();
      for (const entry of finished) await finishJob(entry.job, entry.info);
    }
    const remaining = await readState();
    if (remaining.jobs.length) pollTimer = setTimeout(() => void poll(), POLL_INTERVAL);
    else await chrome.alarms.clear(ALARM_NAME);
  } finally {
    polling = false;
  }
}

/** Called at startup and from the safety-net alarm: pick up where a suspended worker left off. */
export async function resumeTracking(): Promise<void> {
  const state = await readState();
  setActiveJobCount(state.jobs.length);
  await updateBadge();
  if (state.jobs.length) ensurePolling();
}

export { ALARM_NAME as TRACKING_ALARM };
