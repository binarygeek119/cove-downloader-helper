import { Download, Globe, ListPlus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CoveClient } from "@/shared/cove/client";
import { describeCoveError } from "@/shared/cove/client";
import {
  ENTITY_PREFERENCES,
  pickQualityId,
  rankCandidates,
  type Candidate,
  type EntityPreference,
} from "@/shared/cove/match";
import { request } from "@/shared/messaging";
import type { EromeSelectorState, PageVideo, SendItem } from "@/shared/models";
import { describeOutcome } from "@/shared/outcome";
import type { Settings } from "@/shared/settings";
import { isHttpUrl, parseHttpUrl } from "@/shared/url";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Field, Select, TextInput } from "../components/Field";
import { MatchPicker } from "../components/MatchPicker";
import { StatusLine, type StatusTone } from "../components/StatusLine";
import { VideoPicker } from "../components/VideoPicker";
import type { ActiveTab } from "../hooks/useActiveTab";
import type { ConnectionState } from "../hooks/useCove";
import { usePageVideos } from "../hooks/usePageVideos";

const ENTITY_LABELS: Record<EntityPreference, string> = {
  auto: "Auto",
  Video: "Video",
  Audio: "Audio",
  Image: "Image",
  Text: "Text",
};

interface Status {
  tone: StatusTone;
  text: string;
}

interface MatchResult {
  /** `url + entity` the result belongs to; results for another key are ignored. */
  key: string;
  candidates: Candidate[];
  error: string | null;
}

export interface DownloadViewProps {
  mode: "panel" | "options";
  settings: Settings;
  client: CoveClient | null;
  connection: ConnectionState;
  activeTab: ActiveTab | null;
  review: SendItem | null;
  onReviewHandled: () => void;
  erome: EromeSelectorState | null;
  onEromeClose: () => void;
  onViewQueue: () => void;
}

export function DownloadView({
  mode,
  settings,
  client,
  connection,
  activeTab,
  review,
  onReviewHandled,
  erome,
  onEromeClose,
  onViewQueue,
}: DownloadViewProps) {
  // The address comes from the review item, then from what the user typed, then from the active tab.
  const [typedUrl, setTypedUrl] = useState<string | null>(null);
  const url = review ? review.url : (typedUrl ?? activeTab?.url ?? "");
  const pinned = typedUrl !== null;

  const [entityChoice, setEntityChoice] = useState<EntityPreference | null>(null);
  const entity: EntityPreference = entityChoice ?? review?.entity ?? settings.defaultEntity;

  const matchKey = `${url}\n${entity}`;
  const [result, setResult] = useState<MatchResult | null>(null);
  const candidates = result?.key === matchKey ? result.candidates : [];
  const matchError = result?.key === matchKey ? result.error : null;
  const [matching, setMatching] = useState(false);
  const [choice, setChoice] = useState<{ key: string; index: number; qualityId: string | undefined } | null>(null);
  const selected = choice?.key === matchKey ? choice.index : 0;
  const candidate = candidates[selected];
  const qualityId =
    choice?.key === matchKey
      ? choice.qualityId
      : candidate
        ? pickQualityId(candidate, settings.preferredQuality)
        : undefined;

  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<(Status & { key: string; queued?: boolean }) | null>(null);
  const visibleStatus = status?.key === url ? status : null;
  const matchGeneration = useRef(0);

  const runMatch = useCallback(() => {
    if (!client || !isHttpUrl(url)) return;
    const generation = ++matchGeneration.current;
    const key = matchKey;
    setMatching(true);
    client
      .match(url)
      .then(
        (matches) => {
          if (generation !== matchGeneration.current) return;
          setResult({ key, candidates: rankCandidates(matches, entity, url), error: null });
        },
        (error: unknown) => {
          if (generation !== matchGeneration.current) return;
          setResult({ key, candidates: [], error: describeCoveError(error, client.baseUrl) });
        },
      )
      .finally(() => {
        if (generation === matchGeneration.current) setMatching(false);
      });
  }, [client, url, entity, matchKey]);

  useEffect(() => {
    if (!isHttpUrl(url)) return;
    const timer = setTimeout(runMatch, 250);
    return () => clearTimeout(timer);
  }, [url, runMatch]);

  const send = async () => {
    if (!candidate) return;
    setSending(true);
    try {
      const fromTab = activeTab?.url === url;
      const outcome = await request("send", {
        items: [
          {
            url,
            downloaderId: candidate.downloaderId,
            downloaderEntity: candidate.entity,
            qualityId: qualityId ?? pickQualityId(candidate, settings.preferredQuality),
            sourceUrl: candidate.sourceUrl,
            title: fromTab ? activeTab.title : undefined,
          },
        ],
        source: "panel",
        tabId: fromTab ? activeTab.id : undefined,
      });
      const summary = describeOutcome(outcome);
      setStatus({ key: url, tone: summary.tone, text: summary.text, queued: outcome.kind === "queued" });
      if (review) onReviewHandled();
    } catch (error) {
      setStatus({ key: url, tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSending(false);
    }
  };

  const addToPool = async () => {
    if (!isHttpUrl(url)) return;
    try {
      const fromTab = activeTab?.url === url;
      const added = await request("pool:add", {
        items: [{ url, title: fromTab ? activeTab.title : undefined }],
        tabId: fromTab ? activeTab.id : undefined,
      });
      setStatus(
        added.added
          ? { key: url, tone: "ok", text: `Added to pool · ${added.total} waiting` }
          : { key: url, tone: "info", text: "Already in the pool." },
      );
    } catch (error) {
      setStatus({ key: url, tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const usePage = () => {
    setTypedUrl(null);
    setEntityChoice(null);
    if (review) onReviewHandled();
  };

  const pageVideos = usePageVideos(mode === "panel" && !erome && activeTab ? activeTab.id : null, activeTab?.url ?? "");
  const [sendingVideos, setSendingVideos] = useState(false);
  const [videoStatus, setVideoStatus] = useState<Status | null>(null);

  const sendVideos = async (videos: PageVideo[]) => {
    setSendingVideos(true);
    setVideoStatus(null);
    try {
      const pageUrl = erome ? erome.albumUrl : pageVideos.pageUrl || activeTab?.url || "";
      const outcome = await request("send", {
        items: videos.map((video) => ({ url: video.url, sourceUrl: pageUrl, title: video.title })),
        source: erome ? "erome" : "videos",
        tabId: activeTab?.id,
      });
      const summary = describeOutcome(outcome);
      setVideoStatus({ tone: summary.tone, text: summary.text });
    } catch (error) {
      setVideoStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSendingVideos(false);
    }
  };

  const host = parseHttpUrl(url)?.hostname.replace(/^www\./, "");
  const offline = connection.phase === "offline" || connection.phase === "auth";
  const showVideos = !!erome || pageVideos.videos.length > 1;
  const fieldLabel = review ? "Confirm this download" : pinned || mode === "options" ? "Address" : "This page";

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-3">
        <div className="flex items-start gap-2">
          <Field label={fieldLabel}>
            <TextInput
              type="url"
              value={url}
              placeholder="https://"
              spellCheck={false}
              onChange={(event) => {
                if (review) onReviewHandled();
                setTypedUrl(event.target.value.trim());
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") runMatch();
              }}
            />
          </Field>
          {(pinned || review) && activeTab && mode === "panel" && (
            <Button
              variant="subtle"
              size="sm"
              className="mt-5"
              title="Use the current page"
              aria-label="Use the current page"
              onClick={usePage}
            >
              <Globe className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        {activeTab?.url === url && activeTab.title && (
          <p className="-mt-1 truncate text-xs text-muted" title={activeTab.title}>
            {activeTab.title}
          </p>
        )}

        <div className="flex items-end gap-2">
          <Field label="Type">
            <Select value={entity} onChange={(event) => setEntityChoice(event.target.value as EntityPreference)}>
              {ENTITY_PREFERENCES.map((option) => (
                <option key={option} value={option}>
                  {ENTITY_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="ghost"
            title="Match again"
            aria-label="Match again"
            disabled={!isHttpUrl(url) || matching}
            onClick={runMatch}
          >
            <RefreshCw className={`size-4 ${matching ? "animate-spin" : ""}`} aria-hidden />
          </Button>
        </div>

        {visibleStatus ? (
          <StatusLine
            tone={visibleStatus.tone}
            action={
              visibleStatus.queued ? (
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
            {visibleStatus.text}
          </StatusLine>
        ) : matchError ? (
          <StatusLine tone="error">{matchError}</StatusLine>
        ) : offline ? (
          <StatusLine tone="error">{connection.message}</StatusLine>
        ) : review ? (
          <StatusLine tone="info">Pick the downloader and quality, then send.</StatusLine>
        ) : result?.key === matchKey && !candidates.length ? (
          <StatusLine tone="warn">{ENTITY_LABELS[entity]} is not supported for this page. Try another type.</StatusLine>
        ) : null}

        {matching && !candidates.length && <p className="text-xs text-muted">Matching downloaders for {host}…</p>}

        {candidates.length > 0 && (
          <MatchPicker
            candidates={candidates}
            selectedIndex={selected}
            qualityId={qualityId}
            onSelect={(index) => {
              const next = candidates[index];
              setChoice({
                key: matchKey,
                index,
                qualityId: next ? pickQualityId(next, settings.preferredQuality) : undefined,
              });
            }}
            onQuality={(next) => setChoice({ key: matchKey, index: selected, qualityId: next })}
          />
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            className="flex-1"
            icon={<Download className="size-4" aria-hidden />}
            disabled={!candidate || offline}
            loading={sending}
            onClick={() => void send()}
          >
            Send to Cove
          </Button>
          <Button
            variant="ghost"
            title="Add to pool"
            icon={<ListPlus className="size-4" aria-hidden />}
            disabled={!isHttpUrl(url)}
            onClick={() => void addToPool()}
          >
            Pool
          </Button>
        </div>
      </Card>

      {showVideos && (
        <div className="space-y-2">
          {erome && (
            <div className="flex items-center justify-between px-0.5">
              <p className="truncate text-xs text-muted" title={erome.albumUrl}>
                {erome.albumUrl}
              </p>
              <Button variant="subtle" size="sm" onClick={onEromeClose} aria-label="Close album">
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          )}
          <VideoPicker
            heading={
              erome
                ? erome.loading
                  ? "Videos in this album"
                  : `${erome.videos.length} video${erome.videos.length === 1 ? "" : "s"} in this album`
                : `${pageVideos.videos.length} videos on this page`
            }
            videos={erome ? erome.videos : pageVideos.videos}
            loading={!!erome?.loading}
            sending={sendingVideos}
            onSend={(selectedVideos) => void sendVideos(selectedVideos)}
          />
          {erome?.error && <StatusLine tone="error">{erome.error}</StatusLine>}
          {videoStatus && <StatusLine tone={videoStatus.tone}>{videoStatus.text}</StatusLine>}
        </div>
      )}
    </div>
  );
}
