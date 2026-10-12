import { useCallback, useEffect, useState } from "react";
import { request } from "@/shared/messaging";
import type { PoolEntry } from "@/shared/models";
import { usePanelEvents } from "./usePanelEvents";

export function usePool() {
  const [entries, setEntries] = useState<PoolEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(
    () =>
      request("pool:list", {})
        .then(
          (result) => setEntries(result.entries),
          () => setEntries([]),
        )
        .finally(() => setLoaded(true)),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePanelEvents((event) => {
    if (event.kind === "pool-changed") void refresh();
  });

  const remove = useCallback((key: string) => request("pool:remove", { keys: [key] }).then(() => refresh()), [refresh]);
  const clear = useCallback(() => request("pool:clear", {}).then(() => refresh()), [refresh]);

  return { entries, loaded, refresh, remove, clear };
}
