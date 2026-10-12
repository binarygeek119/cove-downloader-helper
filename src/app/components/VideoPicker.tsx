import { Clapperboard } from "lucide-react";
import { useMemo, useState } from "react";
import type { PageVideo } from "@/shared/models";
import { Button } from "./Button";
import { Card } from "./Card";

export interface VideoPickerProps {
  videos: PageVideo[];
  heading: string;
  loading?: boolean;
  sending?: boolean;
  onSend: (selected: PageVideo[]) => void;
}

export function VideoPicker({ videos, heading, loading = false, sending = false, onSend }: VideoPickerProps) {
  // Videos start selected; only the ones the user unticked are remembered. Stale URLs are harmless.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());

  const selected = useMemo(() => videos.filter((video) => !unchecked.has(video.url)), [videos, unchecked]);
  const allChecked = selected.length === videos.length && videos.length > 0;

  const toggleAll = () => setUnchecked(allChecked ? new Set(videos.map((video) => video.url)) : new Set());
  const toggle = (url: string, checked: boolean) =>
    setUnchecked((previous) => {
      const next = new Set(previous);
      if (checked) next.delete(url);
      else next.add(url);
      return next;
    });

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Clapperboard className="size-4 text-accent" aria-hidden />
          {heading}
        </h3>
        {videos.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-secondary">
            <input type="checkbox" className="accent-accent" checked={allChecked} onChange={toggleAll} />
            All
          </label>
        )}
      </header>
      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-muted">Reading videos…</p>
      ) : (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {videos.map((video) => {
            const checked = !unchecked.has(video.url);
            return (
              <li key={video.url}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-card-hover">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={checked}
                    onChange={(event) => toggle(video.url, event.target.checked)}
                  />
                  <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-background">
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {video.duration && (
                      <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 text-[10px] leading-4 text-white tabular-nums">
                        {video.duration}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground" title={video.title || video.url}>
                      {video.title || video.url}
                    </span>
                    <span className="block truncate text-[11px] text-muted" title={video.url}>
                      {video.url}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="text-xs text-muted">
          {selected.length} of {videos.length} selected
        </span>
        <Button
          variant="primary"
          size="sm"
          disabled={!selected.length || loading}
          loading={sending}
          onClick={() => onSend(selected)}
        >
          Send {selected.length > 1 ? `${selected.length} as one job` : "to Cove"}
        </Button>
      </footer>
    </Card>
  );
}
