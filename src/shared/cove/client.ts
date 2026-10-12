import type {
  DownloaderBatchStartRequest,
  DownloaderBatchStartResponse,
  DownloaderDescriptor,
  DownloaderMatch,
  DownloaderStartRequest,
  JobInfo,
  SystemStatus,
} from "./types";

export interface CoveConnection {
  baseUrl: string;
  token: string;
}

export class CoveApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "CoveApiError";
    this.status = status;
    this.body = body;
  }

  /** Cove answers 409 when the URL is already in the library. */
  get isDuplicate(): boolean {
    return this.status === 409;
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** No HTTP status: DNS failure, refused connection, or a blocked request. */
  get isUnreachable(): boolean {
    return this.status === 0;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body.trim();
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["error", "message", "title", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CoveClient {
  readonly baseUrl: string;
  status(): Promise<SystemStatus>;
  listDownloaders(): Promise<DownloaderDescriptor[]>;
  match(url: string): Promise<DownloaderMatch[]>;
  startDownload(request: DownloaderStartRequest): Promise<{ jobId: string }>;
  startBatch(request: DownloaderBatchStartRequest): Promise<DownloaderBatchStartResponse>;
  listJobs(): Promise<JobInfo[]>;
  listJobHistory(): Promise<JobInfo[]>;
  getJob(id: string): Promise<JobInfo>;
  cancelJob(id: string): Promise<void>;
}

export function createCoveClient(connection: CoveConnection, fetchImpl: FetchLike = fetch): CoveClient {
  const baseUrl = connection.baseUrl.replace(/\/+$/, "");

  async function call<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (connection.token) headers.Authorization = `Bearer ${connection.token}`;
    let body: string | undefined;
    if (init?.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    }
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api${path}`, { method: init?.method ?? "GET", headers, body });
    } catch (error) {
      throw new CoveApiError(`Could not reach Cove at ${baseUrl}.`, 0, error);
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const fallback = `Cove returned ${response.status} ${response.statusText}`.trim();
      throw new CoveApiError(messageFromBody(parsed, fallback), response.status, parsed);
    }
    return parsed as T;
  }

  const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

  return {
    baseUrl,
    status: () => call<SystemStatus>("/system/status"),
    listDownloaders: async () => asList<DownloaderDescriptor>(await call("/system/downloaders")),
    match: async (url) =>
      asList<DownloaderMatch>(await call("/system/downloaders/match", { method: "POST", json: { url } })),
    startDownload: (request) => call("/system/downloaders/download", { method: "POST", json: request }),
    startBatch: (request) => call("/system/downloaders/download-batch", { method: "POST", json: request }),
    listJobs: async () => asList<JobInfo>(await call("/jobs")),
    listJobHistory: async () => asList<JobInfo>(await call("/jobs/history")),
    getJob: (id) => call(`/jobs/${encodeURIComponent(id)}`),
    cancelJob: async (id) => {
      await call(`/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

/** Short, user-facing text for a failed Cove call. */
export function describeCoveError(error: unknown, baseUrl: string): string {
  if (error instanceof CoveApiError) {
    if (error.isUnreachable) return `Could not reach Cove at ${baseUrl}.`;
    if (error.isAuthFailure) return "Cove rejected the API token. Check the token in Settings.";
    return error.message.replace(/\s+/g, " ").slice(0, 200);
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
