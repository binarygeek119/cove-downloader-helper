import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { request } from "@/shared/messaging";
import type { EromeSelectorState, PanelTab, SendItem, TrackedJob } from "@/shared/models";
import { describeOutcome } from "@/shared/outcome";
import { clearEromeSelector, readEromeSelector, takePanelIntent } from "@/shared/panel-intent";
import { Button } from "./components/Button";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { StatusLine, type StatusTone } from "./components/StatusLine";
import { Tabs } from "./components/Tabs";
import { useActiveTab } from "./hooks/useActiveTab";
import { useCove } from "./hooks/useCove";
import { useHostPermission } from "./hooks/useHostPermission";
import { useJobs } from "./hooks/useJobs";
import { usePanelEvents } from "./hooks/usePanelEvents";
import { usePool } from "./hooks/usePool";
import { useSettings } from "./hooks/useSettings";
import { useShortcuts } from "./hooks/useShortcuts";
import { DownloadView } from "./views/DownloadView";
import { PoolView } from "./views/PoolView";
import { QueueView } from "./views/QueueView";
import { SettingsView } from "./views/SettingsView";

export interface AppProps {
  mode: "panel" | "options";
  welcome?: boolean;
}

interface Flash {
  tone: StatusTone;
  text: string;
}

export function App({ mode, welcome = false }: AppProps) {
  const { settings, update } = useSettings();
  const { client, connection, recheck } = useCove(settings);
  const hostPermission = useHostPermission();
  const shortcuts = useShortcuts();
  const activeTab = useActiveTab(mode === "panel");
  const pool = usePool();
  const jobs = useJobs(client, settings?.apiToken ?? "", !!settings);

  const [tab, setTab] = useState<PanelTab>(mode === "options" ? "settings" : "download");
  const [review, setReview] = useState<SendItem | null>(null);
  const [erome, setErome] = useState<EromeSelectorState | null>(null);
  const [tracked, setTracked] = useState<TrackedJob[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);

  // What the service worker wanted this panel to show when it opened it.
  useEffect(() => {
    if (mode !== "panel") return;
    void takePanelIntent().then((intent) => {
      if (!intent) return;
      setTab(intent.tab);
      if (intent.review) setReview(intent.review);
    });
    void readEromeSelector().then((state) => {
      if (state) {
        setErome(state);
        setTab("download");
      }
    });
    void request("tracked-jobs:list", {})
      .then(({ jobs: list }) => setTracked(list))
      .catch(() => {});
  }, [mode]);

  usePanelEvents((event) => {
    switch (event.kind) {
      case "show-tab":
        if (mode === "panel") setTab(event.tab);
        break;
      case "erome-selector":
        if (mode === "panel") {
          setErome(event.state);
          setTab("download");
        }
        break;
      case "tracked-jobs-changed":
        setTracked(event.jobs);
        break;
      case "job-finished": {
        const { result } = event;
        const failed =
          result.status !== "completed" || (result.succeeded !== null && result.succeeded < (result.total ?? 0));
        setFlash({
          tone: failed ? "warn" : "ok",
          text: result.restoredToPool
            ? `${result.message} The URLs are back in the pool.`
            : result.message || (failed ? "A download failed." : "Download finished."),
        });
        break;
      }
      case "send-result":
        if (
          event.source !== "panel" &&
          event.source !== "videos" &&
          event.source !== "erome" &&
          event.source !== "pool"
        ) {
          const summary = describeOutcome(event.outcome);
          setFlash({ tone: summary.tone, text: summary.text });
        }
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  // The first probe runs before site access exists and fails; probe again as soon as it is granted.
  useEffect(() => {
    if (hostPermission.granted) void recheck();
  }, [hostPermission.granted, recheck]);

  const mine = useMemo(() => new Set(tracked.map((job) => job.jobId)), [tracked]);

  if (!settings) {
    return <div className="p-4 text-sm text-muted">Loading…</div>;
  }

  const tabs = [
    { id: "download" as const, label: "Download" },
    { id: "queue" as const, label: "Queue", count: jobs.active.length },
    { id: "pool" as const, label: "Pool", count: pool.entries.length },
    { id: "settings" as const, label: "Settings" },
  ];

  const closeErome = () => {
    setErome(null);
    void clearEromeSelector();
  };

  const content = (
    <>
      {tab === "download" && (
        <DownloadView
          mode={mode}
          settings={settings}
          client={client}
          connection={connection}
          activeTab={activeTab}
          review={review}
          onReviewHandled={() => setReview(null)}
          erome={erome}
          onEromeClose={closeErome}
          onViewQueue={() => setTab("queue")}
        />
      )}
      {tab === "queue" && <QueueView jobs={jobs} mine={mine} connection={connection} />}
      {tab === "pool" && (
        <PoolView
          pool={pool}
          settings={settings}
          update={update}
          shortcuts={shortcuts.shortcuts}
          connection={connection}
          onViewQueue={() => setTab("queue")}
        />
      )}
      {tab === "settings" && (
        <SettingsView
          settings={settings}
          update={update}
          connection={connection}
          recheck={recheck}
          hostPermission={hostPermission}
          shortcuts={shortcuts}
        />
      )}
    </>
  );

  return (
    <div className={mode === "options" ? "mx-auto max-w-2xl px-6 py-8" : "flex min-h-screen flex-col"}>
      <header
        className={
          mode === "panel"
            ? "sticky top-0 z-10 space-y-2 border-b border-border bg-background/95 px-3 pt-3 pb-2 backdrop-blur"
            : "mb-6 space-y-3"
        }
      >
        <div className="flex items-center gap-2">
          <img
            src={chrome.runtime.getURL("icons/cove-icon-32.png")}
            alt=""
            width={24}
            height={24}
            className="size-6 rounded-md"
          />
          <h1
            className={`min-w-0 flex-1 truncate font-semibold text-foreground ${mode === "options" ? "text-xl" : "text-sm"}`}
          >
            {mode === "options" ? "Cove Downloader Helper" : "Cove"}
          </h1>
          <ConnectionBadge connection={connection} onClick={() => void recheck()} />
          {connection.phase === "online" && (
            <a
              href={settings.coveUrl}
              target="_blank"
              rel="noreferrer"
              title="Open Cove"
              aria-label="Open Cove"
              className="rounded-md p-1 text-secondary hover:bg-card-hover hover:text-foreground"
            >
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
        </div>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </header>

      <main className={mode === "panel" ? "flex-1 space-y-3 px-3 py-3" : "space-y-3"}>
        {welcome && mode === "options" && tab === "settings" && (
          <StatusLine tone="info">
            Welcome. If Cove runs on this computer with its default port, you are already set: open any supported page
            and use the Cove button, the right-click menu, or the keyboard shortcut.
          </StatusLine>
        )}
        {hostPermission.granted === false && (
          <StatusLine
            tone="warn"
            action={
              <Button size="sm" variant="primary" onClick={() => void hostPermission.grant()}>
                Allow
              </Button>
            }
          >
            Allow site access so the extension can reach Cove and read the page you send.
          </StatusLine>
        )}
        {flash && <StatusLine tone={flash.tone}>{flash.text}</StatusLine>}
        {content}
      </main>
    </div>
  );
}
