"use client";

import { RadioTower } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useTroubleshooter } from "@/lib/troubleshooter/TroubleshooterProvider";

/**
 * RT-002D-R1: an always-available way to report an urgent broadcast problem,
 * independent of whatever the language classifier understands. One press
 * records a confirmed report (from the button, not inferred) and opens the
 * troubleshooter's urgent guidance. It does not prescribe any repair.
 */
export function UrgentBroadcastButton({ className }: { className?: string }) {
  const { reportBroadcast } = useTroubleshooter();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button
      type="button"
      onClick={() => {
        if (reportBroadcast("off-air") && pathname !== "/troubleshooter") router.push("/troubleshooter");
      }}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-alert-400/60 bg-alert-900/50 px-3.5 text-sm font-semibold text-alert-300 transition-colors hover:bg-alert-900/80 hover:text-ink-50",
        className,
      )}
    >
      <RadioTower aria-hidden className="size-4 shrink-0" />
      We&apos;re off air / urgent broadcast problem
    </button>
  );
}
