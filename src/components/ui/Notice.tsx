import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "caution";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "caution" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed",
        tone === "caution"
          ? "border-caution-400/30 bg-caution-900/30 text-caution-300"
          : "border-ink-700 bg-ink-850 text-ink-200",
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone === "caution" ? "text-caution-400" : "text-signal-400")} />
      <div className="min-w-0">
        {title && <p className="font-medium text-ink-50">{title}</p>}
        <div className={cn(title && "mt-0.5", tone === "caution" ? "text-caution-300/90" : "text-ink-300")}>{children}</div>
      </div>
    </div>
  );
}
