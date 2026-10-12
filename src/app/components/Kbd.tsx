/** Render "Alt+Shift+C" as key caps. An empty shortcut renders as a muted "Not set". */
export function Kbd({ shortcut }: { shortcut: string }) {
  if (!shortcut) return <span className="text-xs text-muted italic">Not set</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {shortcut.split("+").map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="rounded-md border border-border bg-background px-1.5 py-0.5 font-sans text-[11px] leading-none text-secondary shadow-[inset_0_-1px_0_var(--color-border)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
