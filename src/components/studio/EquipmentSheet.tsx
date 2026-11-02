"use client";

import { ArrowLeft, ChevronDown, ChevronUp, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  onHeightChange,
}: {
  equipmentId: string;
  onClose: () => void;
  onTroubleshoot: (equipmentId: string) => void;
  conversationActive: boolean;
  /** The full EquipmentPanel, shown when expanded. */
  details: ReactNode;
  /** Reports the sheet's height so the page can keep focused content clear of it. */
  onHeightChange?: (height: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const lessRef = useRef<HTMLButtonElement>(null);
  const toggledByUser = useRef(false);

  // Keep focus on the toggle when the content swaps between compact and expanded.
  useEffect(() => {
    if (!toggledByUser.current) return;
    toggledByUser.current = false;
    (expanded ? lessRef : moreRef).current?.focus({ preventScroll: true });
  }, [expanded]);

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => {
      observer.disconnect();
      onHeightChange(0);
    };
  }, [onHeightChange]);

  const toggle = (next: boolean) => {
    toggledByUser.current = true;
    setExpanded(next);
  };
  const record = getEquipmentById(equipmentId);
  if (!record) return null;
  const category = getCategory(record.category);

  return (
    <aside
      ref={sheetRef}
      aria-label="Selected equipment"
      data-testid="equipment-sheet"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      data-expanded={expanded || undefined}
      className="animate-fade-up fixed inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col tall:max-h-[85dvh] rounded-t-2xl border-t border-ink-600 bg-ink-900 pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_rgba(0,0,0,0.55)] lg:left-60"
    >
      <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-600" />
      {expanded ? (
        <>
          <div className="flex shrink-0 justify-end px-3 pt-1">
            <button ref={lessRef} type="button" aria-expanded onClick={() => toggle(false)} className={buttonStyles({ variant: "ghost", size: "sm" })}>
              <ChevronDown aria-hidden className="size-4" />
              Show less
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">{details}</div>
        </>
      ) : (
        <div className="min-h-0 overflow-y-auto px-4 pt-2 pb-3">
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
            <button ref={moreRef} type="button" aria-expanded={false} onClick={() => toggle(true)} className={buttonStyles({ className: "h-11" })}>
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
