import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-signal-500 text-ink-950 hover:bg-signal-400 active:bg-signal-600",
  secondary: "border border-ink-600 bg-ink-800 text-ink-100 hover:border-ink-500 hover:bg-ink-750",
  ghost: "text-ink-200 hover:bg-ink-800 hover:text-ink-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

/** Shared button classes so <button> and <Link> look identical. */
export function buttonStyles({ variant = "secondary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}
