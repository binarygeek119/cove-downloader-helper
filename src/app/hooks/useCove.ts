import { useCallback, useEffect, useMemo, useState } from "react";
import { CoveApiError, createCoveClient, type CoveClient } from "@/shared/cove/client";
import type { Settings } from "@/shared/settings";

export type ConnectionState =
  | { phase: "checking" }
  | { phase: "online"; version: string; authEnabled: boolean }
  | { phase: "auth"; version: string; message: string }
  | { phase: "offline"; message: string };

const RECHECK_MS = 20_000;
const CHECKING: ConnectionState = { phase: "checking" };

async function probe(client: CoveClient, hasToken: boolean): Promise<ConnectionState> {
  try {
    const status = await client.status();
    if (status.authEnabled) {
      try {
        await client.listDownloaders();
      } catch (error) {
        if (error instanceof CoveApiError && error.isAuthFailure) {
          return {
            phase: "auth",
            version: status.version,
            message: hasToken ? "Cove rejected the API token." : "Cove needs an API token.",
          };
        }
        throw error;
      }
    }
    return { phase: "online", version: status.version, authEnabled: status.authEnabled };
  } catch (error) {
    const message =
      error instanceof CoveApiError && !error.isUnreachable
        ? error.message
        : `Could not reach Cove at ${client.baseUrl}.`;
    return { phase: "offline", message };
  }
}

/** A Cove client for the saved connection, plus a periodically refreshed reachability check. */
export function useCove(settings: Settings | null) {
  const baseUrl = settings?.coveUrl ?? "";
  const token = settings?.apiToken ?? "";
  const key = `${baseUrl}\n${token}`;

  const client = useMemo<CoveClient | null>(
    () => (baseUrl ? createCoveClient({ baseUrl, token }) : null),
    [baseUrl, token],
  );
  const [result, setResult] = useState<{ key: string; state: ConnectionState } | null>(null);
  // A result for an older connection reads as "checking" until the new probe lands.
  const connection = result?.key === key ? result.state : CHECKING;

  const recheck = useCallback(() => {
    if (!client) return Promise.resolve();
    return probe(client, token.length > 0).then((state) => setResult({ key, state }));
  }, [client, key, token]);

  useEffect(() => {
    if (!client) return;
    void recheck();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void recheck();
    }, RECHECK_MS);
    return () => clearInterval(timer);
  }, [client, recheck]);

  return { client, connection, recheck };
}
