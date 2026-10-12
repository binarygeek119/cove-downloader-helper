import { defaultQualityId, isYtDlpId, type Candidate } from "@/shared/cove/match";
import { Select } from "./Field";

export interface MatchPickerProps {
  candidates: Candidate[];
  selectedIndex: number;
  qualityId: string | undefined;
  onSelect: (index: number) => void;
  onQuality: (qualityId: string | undefined) => void;
}

const ENTITY_TONES: Record<string, string> = {
  Video: "bg-accent/15 text-accent",
  Audio: "bg-success/15 text-success",
  Image: "bg-warning/20 text-warning",
  Gallery: "bg-warning/20 text-warning",
  Text: "bg-muted/30 text-secondary",
};

export function MatchPicker({ candidates, selectedIndex, qualityId, onSelect, onQuality }: MatchPickerProps) {
  return (
    <ul className="space-y-1.5">
      {candidates.map((candidate, index) => {
        const selected = index === selectedIndex;
        const options = candidate.qualityOptions;
        return (
          <li key={`${candidate.downloaderId}|${candidate.url}`}>
            <label
              className={`block cursor-pointer rounded-xl border px-3 py-2 transition-colors ${
                selected ? "border-accent/70 bg-accent/5" : "border-border bg-card hover:bg-card-hover"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="match"
                  className="accent-accent"
                  checked={selected}
                  onChange={() => onSelect(index)}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{candidate.downloaderName}</span>
                <span
                  className={`rounded px-1.5 text-[10px] font-medium ${ENTITY_TONES[candidate.entity] ?? ENTITY_TONES.Text}`}
                >
                  {candidate.entity}
                </span>
              </span>
              {(candidate.isFallback || (candidate.label && candidate.label !== candidate.url)) && (
                <span className="mt-1 block truncate pl-6 text-[11px] text-muted" title={candidate.label}>
                  {candidate.isFallback
                    ? isYtDlpId(candidate.downloaderId)
                      ? "No downloader claimed this page. yt-dlp will try anyway."
                      : "No downloader claimed this page. The text downloader will try anyway."
                    : candidate.label}
                </span>
              )}
              {selected && options.length > 0 && (
                <span className="mt-2 block pl-6">
                  <Select
                    aria-label="Quality"
                    value={qualityId ?? defaultQualityId(candidate) ?? ""}
                    onChange={(event) => onQuality(event.target.value || undefined)}
                    className="py-1.5 text-xs"
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label || option.id}
                        {option.description ? ` · ${option.description}` : ""}
                      </option>
                    ))}
                  </Select>
                </span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
