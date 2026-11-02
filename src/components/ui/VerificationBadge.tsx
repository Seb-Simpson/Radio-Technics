import { BadgeCheck, CircleDashed, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/cn";
import type { VerificationStatus } from "@/types";

export const verificationLabels: Record<VerificationStatus, { label: string; description: string }> = {
  verified: { label: "Engineer verified", description: "Confirmed by the station engineer." },
  "station-reported": {
    label: "Station reported",
    description: "Reported by station staff. Not yet confirmed by the engineer.",
  },
  draft: { label: "Unverified draft", description: "Written by the development team. Not an official procedure." },
};

const styles: Record<VerificationStatus, string> = {
  verified: "border-signal-500/40 bg-signal-900/60 text-signal-300",
  "station-reported": "border-ink-500/60 bg-ink-750 text-ink-200",
  draft: "border-caution-400/35 bg-caution-900/50 text-caution-300",
};

const icons = { verified: BadgeCheck, "station-reported": MessageSquareQuote, draft: CircleDashed };

export function VerificationBadge({
  status,
  compact = false,
  className,
}: {
  status: VerificationStatus;
  compact?: boolean;
  className?: string;
}) {
  const Icon = icons[status];
  const { label, description } = verificationLabels[status];
  return (
    <span
      title={description}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap",
        styles[status],
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
