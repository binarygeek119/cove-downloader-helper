import { useCallback, useEffect, useState } from "react";

export interface Shortcut {
  name: string;
  description: string;
  shortcut: string;
}

const SHORTCUTS_PAGE = "chrome://extensions/shortcuts";

function toShortcuts(commands: chrome.commands.Command[]): Shortcut[] {
  return commands
    .filter((command) => command.name && !command.name.startsWith("_"))
    .map((command) => ({
      name: command.name ?? "",
      description: command.description ?? command.name ?? "",
      shortcut: command.shortcut ?? "",
    }));
}

/**
 * The keyboard shortcuts Chrome has bound for this extension. Chrome applies `suggested_key`
 * only at install time and drops it when another extension owns the key, so the live binding is
 * the only truthful thing to show.
 */
export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

  const refresh = useCallback(
    () =>
      chrome.commands.getAll().then(
        (commands) => setShortcuts(toShortcuts(commands)),
        () => setShortcuts([]),
      ),
    [],
  );

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const openShortcutSettings = useCallback(() => {
    void chrome.tabs.create({ url: SHORTCUTS_PAGE });
  }, []);

  return { shortcuts, refresh, openShortcutSettings };
}
