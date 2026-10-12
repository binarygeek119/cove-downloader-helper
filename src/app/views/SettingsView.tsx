import { ExternalLink, KeyRound, Plug, Save, ShieldCheck, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { createCoveClient, describeCoveError } from "@/shared/cove/client";
import {
  ENTITY_PREFERENCES,
  QUALITY_PREFERENCES,
  type EntityPreference,
  type QualityPreference,
} from "@/shared/cove/match";
import {
  buildSettingsExport,
  DEFAULT_COVE_URL,
  parseSettingsExport,
  settingsExportFileName,
  type InPageButtonMode,
  type Settings,
} from "@/shared/settings";
import { normalizeBaseUrl } from "@/shared/url";
import { Button } from "../components/Button";
import { Card, Section } from "../components/Card";
import { Field, Select, TextInput } from "../components/Field";
import { Kbd } from "../components/Kbd";
import { StatusLine, type StatusTone } from "../components/StatusLine";
import { Toggle } from "../components/Toggle";
import type { ConnectionState } from "../hooks/useCove";
import type { useHostPermission } from "../hooks/useHostPermission";
import type { useShortcuts } from "../hooks/useShortcuts";

const ENTITY_LABELS: Record<EntityPreference, string> = {
  auto: "Auto (best match for the page)",
  Video: "Video",
  Audio: "Audio",
  Image: "Image",
  Text: "Text",
};

const QUALITY_LABELS: Record<QualityPreference, string> = {
  best: "Best available",
  "1080p": "Up to 1080p",
  "1440p": "Up to 1440p",
  "2160p": "Up to 4K (2160p)",
};

const IN_PAGE_LABELS: Record<InPageButtonMode, string> = {
  off: "Off",
  supported: "Only on supported sites",
  all: "On every page",
};

const REPO_URL = "https://github.com/binarygeek119/cove-downloader-helper";

interface Status {
  tone: StatusTone;
  text: string;
}

export interface SettingsViewProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<Settings>;
  connection: ConnectionState;
  recheck: () => Promise<void>;
  hostPermission: ReturnType<typeof useHostPermission>;
  shortcuts: ReturnType<typeof useShortcuts>;
}

export function SettingsView({ settings, update, connection, recheck, hostPermission, shortcuts }: SettingsViewProps) {
  // Unsaved edits live in a draft; once saved (or when nothing was typed) the saved values show.
  const [draft, setDraft] = useState<{ coveUrl: string; apiToken: string } | null>(null);
  const coveUrl = draft?.coveUrl ?? settings.coveUrl;
  const apiToken = draft?.apiToken ?? settings.apiToken;
  const setCoveUrl = (value: string) => setDraft({ coveUrl: value, apiToken });
  const setApiToken = (value: string) => setDraft({ coveUrl, apiToken: value });
  const [connectionStatus, setConnectionStatus] = useState<Status | null>(null);
  const [testing, setTesting] = useState(false);
  const [transferStatus, setTransferStatus] = useState<Status | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const version = chrome.runtime.getManifest().version;

  const dirty = normalizeBaseUrl(coveUrl) !== settings.coveUrl || apiToken.trim() !== settings.apiToken;

  const saveConnection = async () => {
    const normalized = normalizeBaseUrl(coveUrl);
    if (coveUrl.trim() && !normalized) {
      setConnectionStatus({ tone: "error", text: "The Cove URL must start with http:// or https://." });
      return;
    }
    if (hostPermission.granted === false) await hostPermission.grant();
    await update({ coveUrl: normalized || DEFAULT_COVE_URL, apiToken: apiToken.trim() });
    setDraft(null);
    setConnectionStatus({ tone: "ok", text: "Connection saved." });
    void recheck();
  };

  const testConnection = async () => {
    const normalized = normalizeBaseUrl(coveUrl);
    if (!normalized) {
      setConnectionStatus({ tone: "error", text: "The Cove URL must start with http:// or https://." });
      return;
    }
    setTesting(true);
    setConnectionStatus(null);
    try {
      if (hostPermission.granted === false && !(await hostPermission.grant())) {
        setConnectionStatus({ tone: "error", text: "Site access was denied. The extension needs it to reach Cove." });
        return;
      }
      const client = createCoveClient({ baseUrl: normalized, token: apiToken.trim() });
      const status = await client.status();
      const downloaders = await client.listDownloaders();
      const noun = downloaders.length === 1 ? "downloader" : "downloaders";
      setConnectionStatus({
        tone: "ok",
        text: `Connected to Cove ${status.version} with ${downloaders.length} ${noun}${status.authEnabled ? "" : ". Authentication is off"}.`,
      });
    } catch (error) {
      setConnectionStatus({ tone: "error", text: describeCoveError(error, normalized) });
    } finally {
      setTesting(false);
    }
  };

  const exportSettings = () => {
    const payload = buildSettingsExport(settings, version);
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = settingsExportFileName(version);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setTransferStatus({ tone: "ok", text: "Settings exported. The file includes your API token; keep it private." });
  };

  const importSettings = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseSettingsExport(await file.text());
    if (!parsed.ok) {
      setTransferStatus({ tone: "error", text: parsed.error });
      return;
    }
    await update(parsed.settings);
    setTransferStatus({
      tone: "ok",
      text: parsed.legacy ? "Imported settings from version 1.x and converted them." : "Settings imported.",
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Connection">
        <Card className="space-y-3 p-3">
          <Field
            label="Cove URL"
            description={`Leave as ${DEFAULT_COVE_URL} if Cove runs on this computer with its default port.`}
          >
            <TextInput
              type="url"
              value={coveUrl}
              placeholder={DEFAULT_COVE_URL}
              spellCheck={false}
              onChange={(event) => setCoveUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveConnection();
              }}
            />
          </Field>
          <Field
            label="API token"
            description="Only needed when Cove has authentication turned on. Create one under Settings → Access tokens in Cove."
          >
            <TextInput
              type="password"
              value={apiToken}
              placeholder="cove_pat_…"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setApiToken(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveConnection();
              }}
            />
          </Field>
          {connectionStatus ? (
            <StatusLine tone={connectionStatus.tone}>{connectionStatus.text}</StatusLine>
          ) : connection.phase === "offline" || connection.phase === "auth" ? (
            <StatusLine tone={connection.phase === "auth" ? "warn" : "error"}>{connection.message}</StatusLine>
          ) : connection.phase === "online" ? (
            <StatusLine tone="ok">
              Connected to Cove {connection.version}
              {connection.authEnabled ? "" : ". Authentication is off"}.
            </StatusLine>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<Save className="size-4" aria-hidden />}
              disabled={!dirty}
              onClick={() => void saveConnection()}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              icon={<Plug className="size-4" aria-hidden />}
              loading={testing}
              onClick={() => void testConnection()}
            >
              Test connection
            </Button>
          </div>
        </Card>
      </Section>

      <Section title="Site access">
        <Card className="p-3">
          {hostPermission.granted ? (
            <p className="flex items-center gap-2 text-sm text-secondary">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              Granted. The extension can reach Cove and place buttons on pages.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-secondary">Needed to reach Cove and to read the page you send.</p>
              <Button variant="primary" size="sm" onClick={() => void hostPermission.grant()}>
                Allow site access
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Sending">
        <Card className="divide-y divide-border px-3">
          <div className="py-3">
            <Field
              label="Default type"
              description="Quick actions ask Cove for this kind of media. The panel can override it per send."
            >
              <Select
                value={settings.defaultEntity}
                onChange={(event) => void update({ defaultEntity: event.target.value as EntityPreference })}
              >
                {ENTITY_PREFERENCES.map((option) => (
                  <option key={option} value={option}>
                    {ENTITY_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="py-3">
            <Field
              label="Preferred quality"
              description="The highest resolution to ask for when a downloader offers a choice. Pages without that resolution get the closest one below it."
            >
              <Select
                value={settings.preferredQuality}
                onChange={(event) => void update({ preferredQuality: event.target.value as QualityPreference })}
              >
                {QUALITY_PREFERENCES.map((option) => (
                  <option key={option} value={option}>
                    {QUALITY_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Toggle
            label="Confirm before sending"
            description="Quick actions open the panel to pick the downloader and quality instead of sending right away."
            checked={settings.confirmBeforeSend}
            onChange={(confirmBeforeSend) => void update({ confirmBeforeSend })}
          />
          <Toggle
            label="Open the panel when a download starts"
            checked={settings.openPanelOnSend}
            onChange={(openPanelOnSend) => void update({ openPanelOnSend })}
          />
          <Toggle
            label="Apply metadata automatically"
            description="Cove scrapes title, performers, and tags after the download."
            checked={settings.autoApplyMetadata}
            onChange={(autoApplyMetadata) => void update({ autoApplyMetadata })}
          />
          <Toggle
            label="Close the tab after sending"
            description="Applies to the shortcut, context menu, and in-page buttons."
            checked={settings.closeTabAfterSend}
            onChange={(closeTabAfterSend) => void update({ closeTabAfterSend })}
          />
          <Toggle
            label="Close the tab after adding it to the pool"
            description="Applies to the pool shortcut, the context menu, and in-page buttons in pool mode."
            checked={settings.closeTabAfterPool}
            onChange={(closeTabAfterPool) => void update({ closeTabAfterPool })}
          />
          <Toggle
            label="Pool mode"
            description="In-page buttons add to the pool instead of sending."
            checked={settings.poolMode}
            onChange={(poolMode) => void update({ poolMode })}
          />
        </Card>
      </Section>

      <Section title="Buttons on pages">
        <Card className="divide-y divide-border px-3">
          <div className="py-3">
            <Field
              label="Floating button"
              description="A small Cove button in the bottom-right corner, plus a chip when you hover a link."
            >
              <Select
                value={settings.inPageButton}
                onChange={(event) => void update({ inPageButton: event.target.value as InPageButtonMode })}
              >
                {(Object.keys(IN_PAGE_LABELS) as InPageButtonMode[]).map((option) => (
                  <option key={option} value={option}>
                    {IN_PAGE_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Toggle
            label="Site-styled download buttons"
            description={
              <>
                A Download button that matches the site, on pages with a{" "}
                <a
                  className="underline underline-offset-2"
                  href={`${REPO_URL}/blob/master/SUPPORTED_SITES.md`}
                  target="_blank"
                  rel="noreferrer"
                >
                  layout
                </a>
                .
              </>
            }
            checked={settings.stylizedButtons}
            onChange={(stylizedButtons) => void update({ stylizedButtons })}
          />
        </Card>
      </Section>

      <Section
        title="Keyboard shortcuts"
        action={
          <Button
            size="sm"
            variant="subtle"
            icon={<ExternalLink className="size-3.5" aria-hidden />}
            onClick={shortcuts.openShortcutSettings}
          >
            Change
          </Button>
        }
      >
        <Card className="divide-y divide-border px-3">
          {shortcuts.shortcuts.map((shortcut) => (
            <div key={shortcut.name} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-foreground">{shortcut.description}</span>
              <Kbd shortcut={shortcut.shortcut} />
            </div>
          ))}
          {shortcuts.shortcuts.length === 0 && (
            <p className="py-2 text-xs text-muted">Shortcuts are unavailable in this browser.</p>
          )}
        </Card>
        <p className="px-0.5 text-[11px] text-muted">
          Chrome assigns keys when the extension is installed and skips any another extension already uses. Set your own
          under Change.
        </p>
      </Section>

      <Section title="Backup">
        <Card className="space-y-2 p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              icon={<Upload className="size-4 rotate-180" aria-hidden />}
              onClick={exportSettings}
            >
              Export settings
            </Button>
            <Button
              variant="ghost"
              icon={<Upload className="size-4" aria-hidden />}
              onClick={() => fileInput.current?.click()}
            >
              Import settings
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                void importSettings(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          {transferStatus && <StatusLine tone={transferStatus.tone}>{transferStatus.text}</StatusLine>}
        </Card>
      </Section>

      <Section title="About">
        <Card className="space-y-1 p-3 text-xs text-secondary">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <KeyRound className="size-4 text-accent" aria-hidden />
            Cove Downloader Helper {version}
          </p>
          <p>
            Sends pages, links, and videos to your self-hosted{" "}
            <a
              className="underline underline-offset-2"
              href="https://github.com/yourcove/cove"
              target="_blank"
              rel="noreferrer"
            >
              Cove
            </a>{" "}
            server.
          </p>
          <p className="flex flex-wrap gap-x-3 pt-1">
            <a className="underline underline-offset-2" href={REPO_URL} target="_blank" rel="noreferrer">
              Source
            </a>
            <a
              className="underline underline-offset-2"
              href={`${REPO_URL}/blob/master/SUPPORTED_SITES.md`}
              target="_blank"
              rel="noreferrer"
            >
              Supported sites
            </a>
            <a
              className="underline underline-offset-2"
              href={`${REPO_URL}/issues/new/choose`}
              target="_blank"
              rel="noreferrer"
            >
              Report a problem
            </a>
            <a
              className="underline underline-offset-2"
              href={`${REPO_URL}/blob/master/PRIVACY.md`}
              target="_blank"
              rel="noreferrer"
            >
              Privacy
            </a>
          </p>
        </Card>
      </Section>
    </div>
  );
}
