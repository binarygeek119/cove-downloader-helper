import { useCallback, useEffect, useState } from "react";
import { loadSettings, onSettingsChanged, saveSettings, type Settings } from "@/shared/settings";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSettings().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    const unsubscribe = onSettingsChanged(setSettings);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, update };
}
