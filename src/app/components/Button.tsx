import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm",
  ghost: "border border-border bg-card text-secondary hover:border-accent/50 hover:bg-card-hover hover:text-foreground",
  danger: "border border-danger/40 bg-card text-danger hover:bg-danger/10",
  subtle: "text-secondary hover:bg-card-hover hover:text-foreground",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-7 px-2.5 py-1 text-xs gap-1.5",
  md: "min-h-9 px-3 py-1.5 text-sm gap-2",
};

export function Button({
  variant = "ghost",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
