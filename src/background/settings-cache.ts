import { loadSettings, onSettingsChanged, type Settings } from "../shared/settings";

/**
 * Settings kept in memory so click handlers can read them synchronously. Chrome drops the user
 * gesture at the first `await`, and `sidePanel.open` needs that gesture.
 */
let current: Settings | null = null;
const ready: Promise<Settings> = loadSettings().then((settings) => {
  current = settings;
  return settings;
});

onSettingsChanged((settings) => {
  current = settings;
});

export const settingsCache = {
  /** Null until the first load finishes. */
  get current(): Settings | null {
    return current;
  },
  get(): Promise<Settings> {
    return current ? Promise.resolve(current) : ready;
  },
};
