import { useId, type ReactNode } from "react";

export interface ToggleProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, description, checked, onChange, disabled = false }: ToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex items-start justify-between gap-4 py-2 ${disabled ? "opacity-60" : "cursor-pointer"}`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          aria-hidden
          className="h-5 w-9 rounded-full bg-muted/50 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60"
        />
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"
        />
      </span>
    </label>
  );
}
