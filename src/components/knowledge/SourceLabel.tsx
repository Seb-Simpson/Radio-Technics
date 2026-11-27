import { BookOpen } from "lucide-react";
import { manualLabel } from "@/lib/knowledge/manual-label";
import type { SourceReference } from "@/types";

/** "From the Myriad 6 manual" chip. Renders nothing unless the source is a read manufacturer source. */
export function SourceLabel({ source }: { source: SourceReference }) {
  const label = manualLabel(source);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-500/40 bg-signal-900/40 px-2.5 py-0.5 text-[13px] font-medium text-signal-200">
      <BookOpen aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
