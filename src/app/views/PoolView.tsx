import { FileDown, Layers, Send, Trash2, X } from "lucide-react";
import { useState } from "react";
import { request } from "@/shared/messaging";
import type { PoolEntry } from "@/shared/models";
import { describeOutcome } from "@/shared/outcome";
import type { Settings } from "@/shared/settings";
import { Button } from "../components/Button";
import { Card, EmptyState } from "../components/Card";
import { Kbd } from "../components/Kbd";
import { StatusLine, type StatusTone } from "../components/StatusLine";
import { Toggle } from "../components/Toggle";
import type { ConnectionState } from "../hooks/useCove";
import type { usePool } from "../hooks/usePool";
import type { Shortcut } from "../hooks/useShortcuts";

export interface PoolViewProps {
  pool: ReturnType<typeof usePool>;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<Settings>;
  shortcuts: Shortcut[];
  connection: ConnectionState;
  onViewQueue: () => void;
}

function PoolRow({ entry, onRemove }: { entry: PoolEntry; onRemove: (key: string) => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 hover:bg-card-hover">
      <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-background">
        {entry.thumbnail ? (
          <img src={entry.thumbnail} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : entry.favicon ? (
          <img
            src={entry.favicon}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute top-1/2 left-1/2 size-5 -translate-1/2"
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground" title={entry.title}>
          {entry.title || entry.url}
        </span>
        <span className="block truncate text-[11px] text-muted" title={entry.url}>
          {entry.url}
        </span>
      </span>
      <Button
        size="sm"
        variant="subtle"
        aria-label="Remove from pool"
        title="Remove"
        onClick={() => onRemove(entry.key)}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}

export function PoolView({ pool, settings, update, shortcuts, connection, onViewQueue }: PoolViewProps) {
  const [busy, setBusy] = useState<"send" | "export" | null>(null);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string; queued?: boolean } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const poolShortcut = shortcuts.find((shortcut) => shortcut.name === "pool-page");
  const sendShortcut = shortcuts.find((shortcut) => shortcut.name === "send-pool");
  const offline = connection.phase === "offline" || connection.phase === "auth";

  const sendAll = async () => {
    setBusy("send");
    setStatus(null);
    try {
      const outcome = await request("pool:send", {});
      const summary = describeOutcome(outcome);
      setStatus({ ...summary, queued: outcome.kind === "queued" });
      await pool.refresh();
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const exportText = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const { saved } = await request("pool:export", {});
      setStatus(
        saved
          ? { tone: "ok", text: "Choose where to save the list. The pool clears once the file is saved." }
          : { tone: "info", text: "Nothing was saved." },
      );
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    await pool.clear();
    setStatus({ tone: "info", text: "Pool cleared." });
  };

  return (
    <div className="space-y-4">
      <Card className="px-3">
        <Toggle
          label="Pool mode"
          description="In-page buttons add to the pool instead of sending. Menus and shortcuts always offer both."
          checked={settings.poolMode}
          onChange={(poolMode) => void update({ poolMode })}
        />
      </Card>

      {status && (
        <StatusLine
          tone={status.tone}
          action={
            status.queued ? (
              <button
                type="button"
                className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                onClick={onViewQueue}
              >
                View queue
              </button>
            ) : undefined
          }
        >
          {status.text}
        </StatusLine>
      )}

      {pool.loaded && pool.entries.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-6" aria-hidden />}
          title="The pool is empty"
          hint={
            <>
              Collect pages here and send them to Cove as one job. Right-click a page or link and choose{" "}
              <em>Add to Cove pool</em>
              {poolShortcut?.shortcut ? (
                <>
                  , or press <Kbd shortcut={poolShortcut.shortcut} />
                </>
              ) : null}
              .
            </>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <header className="flex items-center justify-between border-b border-border px-3 py-2">
            <h3 className="text-sm font-medium text-foreground">{pool.entries.length} waiting</h3>
            <Button
              size="sm"
              variant={confirmClear ? "danger" : "subtle"}
              icon={<Trash2 className="size-3.5" aria-hidden />}
              onClick={() => void clear()}
            >
              {confirmClear ? "Really clear?" : "Clear"}
            </Button>
          </header>
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
            {pool.entries.map((entry) => (
              <PoolRow key={entry.key} entry={entry} onRemove={(key) => void pool.remove(key)} />
            ))}
          </ul>
          <footer className="flex items-center gap-2 border-t border-border px-3 py-2">
            <Button
              variant="primary"
              className="flex-1"
              icon={<Send className="size-4" aria-hidden />}
              loading={busy === "send"}
              disabled={offline || busy !== null}
              onClick={() => void sendAll()}
            >
              Send {pool.entries.length > 1 ? `${pool.entries.length} as one job` : "to Cove"}
            </Button>
            <Button
              variant="ghost"
              icon={<FileDown className="size-4" aria-hidden />}
              loading={busy === "export"}
              disabled={busy !== null}
              onClick={() => void exportText()}
              title="Save the URLs as a text file"
            >
              .txt
            </Button>
          </footer>
        </Card>
      )}

      <p className="px-0.5 text-[11px] text-muted">
        The pool is kept on this device until you send or clear it, including across browser restarts and closed
        incognito windows.
        {sendShortcut?.shortcut ? (
          <>
            {" "}
            Press <Kbd shortcut={sendShortcut.shortcut} /> on any page to send it.
          </>
        ) : null}
      </p>
    </div>
  );
}
