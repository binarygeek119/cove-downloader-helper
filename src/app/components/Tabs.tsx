import type { PanelTab } from "@/shared/models";

export interface TabSpec {
  id: PanelTab;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabSpec[];
  active: PanelTab;
  onChange: (tab: PanelTab) => void;
}) {
  return (
    <nav role="tablist" aria-label="Sections" className="flex gap-1 rounded-xl bg-surface p-1">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none ${
              selected ? "bg-card text-foreground shadow-sm" : "text-secondary hover:text-foreground"
            }`}
          >
            <span className="truncate">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] leading-4 tabular-nums ${selected ? "bg-accent text-white" : "bg-border text-secondary"}`}
              >
                {tab.count > 99 ? "99+" : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
