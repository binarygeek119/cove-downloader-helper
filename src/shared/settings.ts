import { isEntityPreference, isQualityPreference, type EntityPreference, type QualityPreference } from "./cove/match";
import { normalizeBaseUrl } from "./url";

/** Cove listens here out of the box, so a fresh install works without any setup. */
export const DEFAULT_COVE_URL = "http://localhost:5073";

export type InPageButtonMode = "off" | "supported" | "all";

export interface Settings {
  /** Base URL of the Cove server, without a trailing slash. */
  coveUrl: string;
  /** Personal access token. Empty when Cove runs without authentication. */
  apiToken: string;
  /** Which media type quick actions ask for. `auto` lets the ranking decide per page. */
  defaultEntity: EntityPreference;
  /** Highest resolution to request when a downloader offers a choice. */
  preferredQuality: QualityPreference;
  /** Open the panel to review the match instead of sending immediately. */
  confirmBeforeSend: boolean;
  /** Where the floating download button appears. */
  inPageButton: InPageButtonMode;
  /** Draw site-styled buttons where a layout file matches. */
  stylizedButtons: boolean;
  /** Open the side panel on the queue when a download starts. */
  openPanelOnSend: boolean;
  /** Ask Cove to scrape metadata after a download. */
  autoApplyMetadata: boolean;
  /** Close the tab after its page is sent by a quick action. */
  closeTabAfterSend: boolean;
  /** Close the tab after its page is added to the pool. */
  closeTabAfterPool: boolean;
  /** Quick actions add to the pool instead of sending. */
  poolMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  coveUrl: DEFAULT_COVE_URL,
  apiToken: "",
  defaultEntity: "auto",
  preferredQuality: "best",
  confirmBeforeSend: false,
  inPageButton: "supported",
  stylizedButtons: true,
  openPanelOnSend: false,
  autoApplyMetadata: true,
  closeTabAfterSend: false,
  closeTabAfterPool: false,
  poolMode: false,
};

export const SETTINGS_KEY = "settings";

const IN_PAGE_MODES: readonly InPageButtonMode[] = ["off", "supported", "all"];
const MAX_VALUE_CHARS = 8000;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Coerce anything into a complete, valid Settings object. Unknown or invalid fields take defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const coveUrl = normalizeBaseUrl(source.coveUrl);
  const apiToken = typeof source.apiToken === "string" ? source.apiToken.trim().slice(0, MAX_VALUE_CHARS) : "";
  return {
    coveUrl: coveUrl || DEFAULT_COVE_URL,
    apiToken,
    defaultEntity: isEntityPreference(source.defaultEntity) ? source.defaultEntity : DEFAULT_SETTINGS.defaultEntity,
    preferredQuality: isQualityPreference(source.preferredQuality)
      ? source.preferredQuality
      : DEFAULT_SETTINGS.preferredQuality,
    confirmBeforeSend: bool(source.confirmBeforeSend, DEFAULT_SETTINGS.confirmBeforeSend),
    inPageButton: IN_PAGE_MODES.includes(source.inPageButton as InPageButtonMode)
      ? (source.inPageButton as InPageButtonMode)
      : DEFAULT_SETTINGS.inPageButton,
    stylizedButtons: bool(source.stylizedButtons, DEFAULT_SETTINGS.stylizedButtons),
    openPanelOnSend: bool(source.openPanelOnSend, DEFAULT_SETTINGS.openPanelOnSend),
    autoApplyMetadata: bool(source.autoApplyMetadata, DEFAULT_SETTINGS.autoApplyMetadata),
    closeTabAfterSend: bool(source.closeTabAfterSend, DEFAULT_SETTINGS.closeTabAfterSend),
    closeTabAfterPool: bool(source.closeTabAfterPool, DEFAULT_SETTINGS.closeTabAfterPool),
    poolMode: bool(source.poolMode, DEFAULT_SETTINGS.poolMode),
  };
}

/** Flat keys the 1.x extension stored in `chrome.storage.sync`. */
export const LEGACY_SETTING_KEYS = [
  "coveUrl",
  "apiToken",
  "preferredMode",
  "showInPageButtons",
  "showOnSupportedSites",
  "showStylizedDownloadButton",
  "autoSend",
  "openQueueOnDownload",
  "queueAllMatches",
  "autoApplyMetadata",
  "closeTabAfterCapture",
  "poolDownloader",
  "poolMode",
] as const;

export function hasLegacySettings(raw: Record<string, unknown>): boolean {
  return LEGACY_SETTING_KEYS.some((key) => key !== "coveUrl" && key !== "apiToken" && raw[key] !== undefined);
}

/** Map 1.x keys onto the 2.x shape, preserving what each toggle did. */
export function migrateLegacySettings(raw: Record<string, unknown>): Settings {
  const preferredMode = raw.preferredMode;
  const defaultEntity: EntityPreference =
    preferredMode === "Audio" || preferredMode === "Text" ? (preferredMode as EntityPreference) : "auto";
  const inPageButton: InPageButtonMode =
    raw.showInPageButtons === true ? "all" : raw.showOnSupportedSites === true ? "supported" : "off";
  return sanitizeSettings({
    coveUrl: raw.coveUrl,
    apiToken: raw.apiToken,
    defaultEntity,
    preferredQuality: "best",
    // 1.x opened the picker unless auto-send was on.
    confirmBeforeSend: raw.autoSend !== true,
    inPageButton,
    stylizedButtons: raw.showStylizedDownloadButton === true,
    openPanelOnSend: raw.openQueueOnDownload === true,
    autoApplyMetadata: raw.autoApplyMetadata !== false,
    closeTabAfterSend: raw.closeTabAfterCapture === true,
    closeTabAfterPool: raw.closeTabAfterCapture === true,
    poolMode: raw.poolDownloader === true,
  });
}

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get(null)) as Record<string, unknown>;
  if (stored[SETTINGS_KEY] !== undefined) return sanitizeSettings(stored[SETTINGS_KEY]);
  if (hasLegacySettings(stored) || stored.coveUrl !== undefined) {
    const migrated = migrateLegacySettings(stored);
    await chrome.storage.sync.set({ [SETTINGS_KEY]: migrated });
    await chrome.storage.sync.remove([...LEGACY_SETTING_KEYS]);
    return migrated;
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = sanitizeSettings({ ...current, ...patch });
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Subscribe to settings changes from any extension context. Returns an unsubscribe function. */
export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "sync") return;
    const change = changes[SETTINGS_KEY];
    if (change) listener(sanitizeSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export const SETTINGS_EXPORT_FORMAT = "cove-downloader-helper-settings";
export const SETTINGS_EXPORT_VERSION = 2;
export const SETTINGS_EXPORT_MAX_BYTES = 100 * 1024;

export interface SettingsExport {
  format: typeof SETTINGS_EXPORT_FORMAT;
  version: typeof SETTINGS_EXPORT_VERSION;
  extensionVersion: string;
  exportedAt: string;
  settings: Settings;
}

export function buildSettingsExport(settings: Settings, extensionVersion: string, now = new Date()): SettingsExport {
  return {
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    extensionVersion,
    exportedAt: now.toISOString(),
    settings: sanitizeSettings(settings),
  };
}

export function settingsExportFileName(extensionVersion: string): string {
  const safe = extensionVersion.replace(/[^0-9A-Za-z._-]/g, "");
  return `cove-downloader-helper-settings-${safe || "unknown"}.json`;
}

export type ParsedSettingsExport = { ok: true; settings: Settings; legacy: boolean } | { ok: false; error: string };

/** Accepts 2.x exports and the flat 1.x export (`{ version, settings: { preferredMode, ... } }`). */
export function parseSettingsExport(text: string): ParsedSettingsExport {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "The settings file is empty." };
  if (text.length > SETTINGS_EXPORT_MAX_BYTES) return { ok: false, error: "The settings file is too large." };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "The settings file is not valid JSON." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "The settings file is not recognized." };
  }
  const record = data as Record<string, unknown>;
  const settings = record.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ok: false, error: "The settings file has no settings." };
  }
  if (record.format === SETTINGS_EXPORT_FORMAT) {
    if (typeof record.version !== "number" || record.version > SETTINGS_EXPORT_VERSION) {
      return { ok: false, error: "The settings file comes from a newer version. Update the extension first." };
    }
    return { ok: true, settings: sanitizeSettings(settings), legacy: false };
  }
  if (typeof record.version === "string" && /^\d+\.\d+/.test(record.version)) {
    return { ok: true, settings: migrateLegacySettings(settings as Record<string, unknown>), legacy: true };
  }
  return { ok: false, error: "The settings file is not recognized." };
}
