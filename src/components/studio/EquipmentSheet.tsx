"use client";

import { ArrowLeft, ChevronDown, ChevronUp, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { buttonStyles } from "@/components/ui/button-styles";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { getCategory, getEquipmentById } from "@/lib/content/equipment";

/**
 * Phone/tablet presentation of the selected equipment: a bottom sheet that
 * starts compact (so most of the studio photo stays visible) and expands to
 * the full details on request. Non-modal: the photo stays usable behind it.
 */
export function EquipmentSheet({
  equipmentId,
  onClose,
  onTroubleshoot,
  conversationActive,
  details,
}: {
  equipmentId: string;
  onClose: () => void;
  onTroubleshoot: (equipmentId: string) => void;
  conversationActive: boolean;
  /** The full EquipmentPanel, shown when expanded. */
  details: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const record = getEquipmentById(equipmentId);
  if (!record) return null;
  const category = getCategory(record.category);

  return (
    <aside
      aria-label="Selected equipment"
      data-testid="equipment-sheet"
      data-expanded={expanded || undefined}
      className="animate-fade-up fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-ink-600 bg-ink-900 pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgba(0,0,0,0.55)] lg:left-60"
    >
      <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-600" />
      {expanded ? (
        <>
          <div className="flex shrink-0 justify-end px-3 pt-1">
            <button type="button" aria-expanded onClick={() => setExpanded(false)} className={buttonStyles({ variant: "ghost", size: "sm" })}>
              <ChevronDown aria-hidden className="size-4" />
              Show less
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">{details}</div>
        </>
      ) : (
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-signal-400 uppercase">{category?.name}</p>
              <h2 className="mt-0.5 text-[17px] leading-snug font-semibold text-ink-50">{record.name}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close equipment details"
              className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-800 hover:text-ink-50"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[15px] text-ink-100">{record.primaryFunction.text}</p>
            <VerificationBadge status={record.primaryFunction.status} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onTroubleshoot(record.id)} className={buttonStyles({ variant: "primary", className: "h-11" })}>
              <Wrench aria-hidden className="size-4" />
              Troubleshoot this
            </button>
            <button type="button" aria-expanded={false} onClick={() => setExpanded(true)} className={buttonStyles({ className: "h-11" })}>
              <ChevronUp aria-hidden className="size-4" />
              More details
            </button>
            {conversationActive && (
              <Link href="/troubleshooter" className={buttonStyles({ className: "col-span-2 h-11" })}>
                <ArrowLeft aria-hidden className="size-4" />
                Back to conversation
              </Link>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
