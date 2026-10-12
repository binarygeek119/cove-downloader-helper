/**
 * A small in-memory stand-in for the parts of the `chrome.*` API the extension uses in tests.
 * Storage areas behave like the real ones (promise API, change events); everything else records
 * calls so tests can assert on them.
 */
import { vi } from "vitest";

type Listener = (...args: unknown[]) => void;

export function createEvent() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    hasListener: (listener: Listener) => listeners.has(listener),
    emit: (...args: unknown[]) => {
      // Snapshot first: a listener may unsubscribe itself while we iterate.
      const snapshot = Array.from(listeners);
      for (const listener of snapshot) listener(...args);
    },
    clear: () => listeners.clear(),
  };
}

export function createStorageArea(areaName: string, onChanged: ReturnType<typeof createEvent>) {
  let data: Record<string, unknown> = {};
  const clone = (value: unknown) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const emit = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
    if (Object.keys(changes).length) onChanged.emit(changes, areaName);
  };
  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (keys === null || keys === undefined) return clone(data);
      const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out: Record<string, unknown> = {};
      for (const key of list) if (key in data) out[key] = clone(data[key]);
      if (keys && typeof keys === "object" && !Array.isArray(keys)) {
        for (const [key, fallback] of Object.entries(keys)) if (!(key in out)) out[key] = fallback;
      }
      return out;
    },
    async set(values: Record<string, unknown>) {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: clone(data[key]), newValue: clone(value) };
        data[key] = clone(value);
      }
      emit(changes);
    },
    async remove(keys: string | string[]) {
      const changes: Record<string, { oldValue?: unknown }> = {};
      for (const key of typeof keys === "string" ? [keys] : keys) {
        if (key in data) {
          changes[key] = { oldValue: clone(data[key]) };
          delete data[key];
        }
      }
      emit(changes);
    },
    async clear() {
      const changes: Record<string, { oldValue?: unknown }> = {};
      for (const key of Object.keys(data)) changes[key] = { oldValue: clone(data[key]) };
      data = {};
      emit(changes);
    },
    /** Test helper: peek at the raw contents. */
    _dump: () => clone(data) as Record<string, unknown>,
  };
}

export function installChromeMock() {
  const storageChanged = createEvent();
  const runtimeMessage = createEvent();
  const chromeMock = {
    runtime: {
      id: "test-extension",
      getURL: (file: string) => `chrome-extension://test-extension/${file}`,
      getManifest: () => ({ version: "2.0.0", name: "Cove Downloader Helper" }),
      sendMessage: vi.fn(async () => undefined),
      onMessage: runtimeMessage,
      onInstalled: createEvent(),
      onStartup: createEvent(),
      lastError: undefined,
    },
    storage: {
      sync: createStorageArea("sync", storageChanged),
      local: createStorageArea("local", storageChanged),
      session: createStorageArea("session", storageChanged),
      onChanged: storageChanged,
    },
    tabs: {
      query: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      create: vi.fn(async () => ({ id: 1 })),
      remove: vi.fn(async () => undefined),
      sendMessage: vi.fn(async () => undefined),
      onUpdated: createEvent(),
      onActivated: createEvent(),
      onRemoved: createEvent(),
    },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      onClicked: createEvent(),
    },
    permissions: {
      contains: vi.fn(async () => true),
      request: vi.fn(async () => true),
      onAdded: createEvent(),
      onRemoved: createEvent(),
    },
    commands: {
      getAll: vi.fn(async () => [
        { name: "send-page", shortcut: "Alt+Shift+C", description: "Send the current page to Cove" },
      ]),
      onCommand: createEvent(),
    },
    sidePanel: {
      open: vi.fn(async () => undefined),
      setOptions: vi.fn(async () => undefined),
    },
    scripting: {
      executeScript: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      getRegisteredContentScripts: vi.fn(async () => []),
    },
    contextMenus: { removeAll: vi.fn((cb?: () => void) => cb?.()), create: vi.fn(), onClicked: createEvent() },
    downloads: { download: vi.fn(async () => 1), onChanged: createEvent() },
    alarms: { create: vi.fn(async () => undefined), clear: vi.fn(async () => true), onAlarm: createEvent() },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  return chromeMock;
}

export type ChromeMock = ReturnType<typeof installChromeMock>;
