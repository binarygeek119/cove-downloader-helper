import { isLayoutFile, matchLayoutTargets } from "../shared/layouts/schema";
import type { LayoutFile, LayoutTarget } from "../shared/layouts/types";

let cached: Promise<LayoutFile[]> | null = null;

/** Every bundled `.lay` file that passes validation. Invalid files are logged and skipped. */
export function loadLayouts(): Promise<LayoutFile[]> {
  cached ??= (async () => {
    const layouts: LayoutFile[] = [];
    try {
      const index = await fetch(chrome.runtime.getURL("layouts/index.json"));
      const names: unknown = await index.json();
      if (!Array.isArray(names)) return layouts;
      for (const name of names) {
        if (typeof name !== "string" || !/^[a-z0-9-]+\.lay$/i.test(name)) continue;
        try {
          const response = await fetch(chrome.runtime.getURL(`layouts/${name}`));
          const data: unknown = await response.json();
          if (isLayoutFile(data)) layouts.push(data);
          else console.warn("Ignoring invalid layout", name);
        } catch (error) {
          console.warn("Ignoring unreadable layout", name, error);
        }
      }
    } catch (error) {
      console.warn("Layout index unavailable", error);
    }
    return layouts;
  })();
  return cached;
}

export async function layoutTargetsFor(pageUrl: string): Promise<LayoutTarget[]> {
  return matchLayoutTargets(await loadLayouts(), pageUrl);
}
