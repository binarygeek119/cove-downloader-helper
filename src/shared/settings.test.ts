import { describe, expect, it } from "vitest";
import {
  buildSettingsExport,
  DEFAULT_COVE_URL,
  DEFAULT_SETTINGS,
  loadSettings,
  migrateLegacySettings,
  parseSettingsExport,
  sanitizeSettings,
  saveSettings,
  SETTINGS_KEY,
  settingsExportFileName,
} from "./settings";

describe("sanitizeSettings", () => {
  it("fills in defaults for anything missing or invalid", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({ coveUrl: "nope", defaultEntity: "Gallery", inPageButton: "sometimes", poolMode: "yes" }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("normalizes the Cove URL and trims the token", () => {
    const settings = sanitizeSettings({ coveUrl: " https://cove.example/ ", apiToken: " cove_pat_x " });
    expect(settings.coveUrl).toBe("https://cove.example");
    expect(settings.apiToken).toBe("cove_pat_x");
  });

  it("uses the default Cove URL when the field is empty", () => {
    expect(sanitizeSettings({ coveUrl: "" }).coveUrl).toBe(DEFAULT_COVE_URL);
    expect(DEFAULT_COVE_URL).toBe("http://localhost:5073");
  });
});

describe("migrateLegacySettings", () => {
  it("preserves what each 1.x toggle did", () => {
    const migrated = migrateLegacySettings({
      coveUrl: "http://127.0.0.1:5000/",
      apiToken: "cove_pat_abc",
      preferredMode: "Audio",
      showInPageButtons: false,
      showOnSupportedSites: true,
      showStylizedDownloadButton: true,
      autoSend: true,
      openQueueOnDownload: true,
      autoApplyMetadata: false,
      closeTabAfterCapture: true,
      poolDownloader: true,
    });
    expect(migrated).toEqual({
      coveUrl: "http://127.0.0.1:5000",
      apiToken: "cove_pat_abc",
      defaultEntity: "Audio",
      preferredQuality: "best",
      confirmBeforeSend: false,
      inPageButton: "supported",
      stylizedButtons: true,
      openPanelOnSend: true,
      autoApplyMetadata: false,
      closeTabAfterSend: true,
      closeTabAfterPool: true,
      poolMode: true,
    });
  });

  it("maps the old Video default to auto and the old picker default to confirm", () => {
    const migrated = migrateLegacySettings({ preferredMode: "Video", showInPageButtons: true });
    expect(migrated.defaultEntity).toBe("auto");
    expect(migrated.confirmBeforeSend).toBe(true);
    expect(migrated.inPageButton).toBe("all");
  });
});

describe("loadSettings and saveSettings", () => {
  it("migrates flat 1.x keys once and removes them", async () => {
    await chrome.storage.sync.set({ coveUrl: "http://nas:5073", autoSend: true, poolDownloader: false });
    const loaded = await loadSettings();
    expect(loaded.coveUrl).toBe("http://nas:5073");
    expect(loaded.confirmBeforeSend).toBe(false);
    const stored = await chrome.storage.sync.get(null);
    expect(stored[SETTINGS_KEY]).toEqual(loaded);
    expect(stored.autoSend).toBeUndefined();
    expect(stored.coveUrl).toBeUndefined();
  });

  it("returns defaults on a fresh install without writing anything", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await chrome.storage.sync.get(null)).toEqual({});
  });

  it("merges a patch over the saved settings", async () => {
    await saveSettings({ poolMode: true });
    const next = await saveSettings({ apiToken: "cove_pat_x" });
    expect(next.poolMode).toBe(true);
    expect(next.apiToken).toBe("cove_pat_x");
    expect(next.coveUrl).toBe(DEFAULT_COVE_URL);
  });
});

describe("settings export and import", () => {
  const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, apiToken: "cove_pat_123", poolMode: true });

  it("round-trips a 2.x export", () => {
    const exported = buildSettingsExport(settings, "2.0.0", new Date("2026-10-12T00:00:00Z"));
    expect(exported.format).toBe("cove-downloader-helper-settings");
    expect(exported.exportedAt).toBe("2026-10-12T00:00:00.000Z");
    const parsed = parseSettingsExport(JSON.stringify(exported));
    expect(parsed).toEqual({ ok: true, settings, legacy: false });
  });

  it("imports a 1.x export and converts it", () => {
    const legacy = JSON.stringify({
      version: "1.0.8",
      settings: { coveUrl: "http://nas:5073", preferredMode: "Text", showInPageButtons: true, autoSend: false },
    });
    expect(parseSettingsExport(legacy)).toMatchObject({
      ok: true,
      legacy: true,
      settings: { defaultEntity: "Text", inPageButton: "all", confirmBeforeSend: true, coveUrl: "http://nas:5073" },
    });
  });

  it("rejects garbage and newer formats with a clear message", () => {
    expect(parseSettingsExport("")).toMatchObject({ ok: false, error: expect.stringContaining("empty") });
    expect(parseSettingsExport("{nope")).toMatchObject({ ok: false, error: expect.stringContaining("JSON") });
    expect(parseSettingsExport("[]")).toMatchObject({ ok: false });
    expect(
      parseSettingsExport(JSON.stringify({ format: "cove-downloader-helper-settings", version: 99, settings: {} })),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("newer"),
    });
    expect(parseSettingsExport("x".repeat(200 * 1024))).toMatchObject({
      ok: false,
      error: expect.stringContaining("large"),
    });
  });

  it("names the file after the extension version", () => {
    expect(settingsExportFileName("2.0.0")).toBe("cove-downloader-helper-settings-2.0.0.json");
    expect(settingsExportFileName("../x")).toBe("cove-downloader-helper-settings-..x.json");
  });
});
