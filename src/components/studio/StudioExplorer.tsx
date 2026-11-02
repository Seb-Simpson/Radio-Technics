"use client";

import { ArrowLeft, ImagePlus, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { hotspots as defaultHotspots } from "@/data/hotspots";
import { EXPECTED_PHOTO_COUNT } from "@/data/studio-views";
import { Notice } from "@/components/ui/Notice";
import { buttonStyles } from "@/components/ui/button-styles";
import { getCategories, getEquipmentByCategory } from "@/lib/content/equipment";
import { getViews } from "@/lib/content/views";
import { cn } from "@/lib/cn";
import { describeStep } from "@/lib/troubleshooter/engine";
import { useTroubleshooter } from "@/lib/troubleshooter/TroubleshooterProvider";
import { useMediaQuery, WIDE_LAYOUT_QUERY } from "@/lib/use-media-query";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";
import type { Hotspot, StudioView } from "@/types";
import { EquipmentPanel } from "./EquipmentPanel";
import { EquipmentSheet } from "./EquipmentSheet";
import { PhotoViewer } from "./PhotoViewer";

/** Attribute-selector escaping (CSS.escape is missing in some test environments). */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

export interface StudioExplorerProps {
  variant?: "full" | "embedded";
  /** Overrides for tests and future data sources. */
  views?: StudioView[];
  hotspots?: Hotspot[];
}

export function StudioExplorer({ variant = "full", views = getViews(), hotspots = defaultHotspots }: StudioExplorerProps) {
  const { state, run } = useWorkspace();
  const { send, active: conversationActive, conversation } = useTroubleshooter();
  const router = useRouter();
  const embedded = variant === "embedded";
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  // Phones and tablets show the selected equipment in a bottom sheet.
  const useSheet = !embedded && !wide;
  const viewerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const sheetHeightRef = useRef(0);
  const reportSheetHeight = useCallback((height: number) => {
    sheetHeightRef.current = height;
    setSheetHeight(height);
  }, []);

  /**
   * Keep a focused element visible in the part of the window not covered by
   * the sticky header or the bottom sheet (WCAG 2.4.11 Focus Not Obscured).
   */
  const revealFocused = useCallback((element: Element | null) => {
    if (!(element instanceof HTMLElement) || !rootRef.current?.contains(element)) return;
    if (element.closest('[data-testid="equipment-sheet"]')) return; // already in the overlay
    const header = document.querySelector<HTMLElement>("[data-app-header]");
    const headerBottom = header && getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().bottom : 0;
    const top = headerBottom + 8;
    const bottom = window.innerHeight - sheetHeightRef.current - 8;
    const rect = element.getBoundingClientRect();
    let delta = 0;
    if (rect.bottom > bottom) delta = rect.bottom - bottom;
    if (rect.top - delta < top) delta = rect.top - top; // prefer showing the top of large items
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "auto" });
  }, []);

  // Any focus inside the explorer is kept clear of the overlays.
  useEffect(() => {
    if (!useSheet) return;
    const onFocusIn = (event: FocusEvent) => revealFocused(event.target as Element);
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [useSheet, revealFocused]);

  // When the sheet opens or changes size, re-check whatever has focus.
  useEffect(() => {
    if (useSheet && sheetHeight > 0) revealFocused(document.activeElement);
  }, [useSheet, sheetHeight, revealFocused]);

  /**
   * Closing details returns focus to the exact hotspot that was chosen (or the
   * first one for that equipment, or the photo), never to nowhere. The return
   * happens a frame later, so it is skipped if the user has focused something
   * else by then (RT-QA-002B: a delayed restore must not override newer focus).
   */
  const closeDetails = () => {
    const equipmentId = state.selectedEquipmentId;
    const hotspotId = state.selectedHotspotId;
    const focusWasInPanel = document.activeElement?.closest('[aria-label="Selected equipment"]') != null;
    run([{ type: "clear_selection" }]);
    if (!focusWasInPanel) return;
    requestAnimationFrame(() => {
      const current = document.activeElement;
      const focusLost = !current || current === document.body || !current.isConnected;
      if (!focusLost) return;
      const viewer = viewerRef.current;
      const target =
        (hotspotId && viewer?.querySelector<HTMLElement>(`[data-hotspot-id="${cssEscape(hotspotId)}"]`)) ||
        (equipmentId && viewer?.querySelector<HTMLElement>(`[data-equipment-id="${cssEscape(equipmentId)}"]`)) ||
        viewer?.querySelector<HTMLElement>('[aria-roledescription="zoomable studio view"]');
      target?.focus();
    });
  };

  // Phones/tablets: after "Show me where", bring the photo to the top of the screen so the
  // highlighted (and zoomed-to) equipment sits above the bottom sheet.
  const focusToken = state.focusRequest?.token;
  useEffect(() => {
    if (!useSheet || focusToken === undefined || !viewerRef.current) return;
    const top = viewerRef.current.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo?.({ top: Math.max(0, top), behavior: "auto" });
  }, [useSheet, focusToken]);

  const activeView = views.find((view) => view.id === state.activeViewId) ?? views[0];
  const viewHotspots = activeView ? hotspots.filter((h) => h.viewId === activeView.id) : [];
  const hasRealPhotos = views.some((view) => !view.illustrative);
  const selectedInView = viewHotspots.some((h) => h.equipmentId === state.selectedEquipmentId);

  const selectEquipment = (equipmentId: string, hotspotId?: string) => run([{ type: "select_equipment", equipmentId, hotspotId }]);
  const findEquipment = (equipmentId: string) =>
    run([
      { type: "select_equipment", equipmentId },
      { type: "highlight_equipment", equipmentId },
    ]);

  const troubleshoot = (equipmentId: string) => {
    send({ type: "equipment", equipmentId });
    if (!embedded) router.push("/troubleshooter");
  };

  // Embedded beside the chat, only offer "Use in troubleshooter" when the chat is
  // waiting for the user to identify equipment — otherwise it would restart the flow.
  const awaitingEquipment = conversation.step.kind === "start" || conversation.step.kind === "choose";
  const canTroubleshoot = !embedded || awaitingEquipment;

  const panel = (
    <EquipmentPanel
      equipmentId={state.selectedEquipmentId}
      onClose={closeDetails}
      onTroubleshoot={canTroubleshoot ? troubleshoot : undefined}
      troubleshootLabel={embedded ? "Use in troubleshooter" : "Troubleshoot this"}
      inCurrentView={selectedInView}
      // The exact region the user chose; otherwise the first region for that equipment in this photo.
      photoHotspot={
        viewHotspots.find((h) => h.id === state.selectedHotspotId) ??
        viewHotspots.find((h) => h.equipmentId === state.selectedEquipmentId) ??
        null
      }
    />
  );

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-4", embedded && "h-full")}>
      {!hasRealPhotos && !embedded && <MissingPhotosNotice />}

      {!embedded && conversationActive && <ConversationLink prompt={describeStep(conversation).prompt} />}

      <div className={cn("grid gap-4", embedded ? "min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="flex min-w-0 flex-col gap-3">
          {views.length > 1 && (
            <ViewTabs
              views={views}
              activeViewId={activeView?.id ?? null}
              idPrefix={variant}
              onSelect={(viewId) => run([{ type: "show_view", viewId }])}
            />
          )}

          {activeView ? (
            <div ref={viewerRef} role={views.length > 1 ? "tabpanel" : undefined} id={`${variant}-view-panel`} aria-labelledby={views.length > 1 ? `${variant}-tab-${activeView.id}` : undefined}>
            <PhotoViewer
              view={activeView}
              hotspots={viewHotspots}
              selectedEquipmentId={state.selectedEquipmentId}
              selectedHotspotId={state.selectedHotspotId}
              highlightedEquipmentId={state.highlightedEquipmentId}
              focusRequest={state.focusRequest}
              onSelectEquipment={selectEquipment}
              onHotspotFocusVisible={useSheet ? revealFocused : undefined}
              className={embedded ? "aspect-[16/10] w-full" : "aspect-[4/5] w-full sm:aspect-[4/3] xl:aspect-auto xl:h-[min(64vh,700px)]"}
            />
            </div>
          ) : (
            <EmptyStudioState />
          )}

          {!embedded && (
            <EquipmentIndex
              selectedEquipmentId={state.selectedEquipmentId}
              onChoose={findEquipment}
              viewEquipmentIds={new Set(viewHotspots.map((h) => h.equipmentId))}
            />
          )}
        </div>

        {!useSheet && (
          <aside
            aria-label="Selected equipment"
            className={cn(
              "overflow-y-auto rounded-xl border border-ink-750 bg-ink-900",
              embedded ? "min-h-0" : "xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start",
            )}
          >
            {panel}
          </aside>
        )}
      </div>

      {useSheet && state.selectedEquipmentId && (
        <>
          {/* Room to scroll everything above the sheet, matching its real height. */}
          <div aria-hidden style={{ height: Math.max(sheetHeight, 0) }} />
          <EquipmentSheet
            key={state.selectedEquipmentId}
            equipmentId={state.selectedEquipmentId}
            onHeightChange={reportSheetHeight}
            onClose={closeDetails}
            onTroubleshoot={troubleshoot}
            conversationActive={conversationActive}
            details={panel}
          />
        </>
      )}
    </div>
  );
}

/** Shown on the Studio Explorer while a conversation is in progress, so it's always one tap away. */
function ConversationLink({ prompt }: { prompt: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-signal-500/30 bg-signal-900/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-2.5">
        <MessageSquare aria-hidden className="mt-0.5 size-4 shrink-0 text-signal-400" />
        <p className="line-clamp-2 text-sm text-ink-100 sm:line-clamp-none">
          <span className="font-medium text-ink-50">Your conversation is waiting: </span>
          {prompt}
        </p>
      </div>
      <Link href="/troubleshooter" className={buttonStyles({ variant: "primary", size: "sm", className: "h-10 shrink-0" })}>
        <ArrowLeft aria-hidden className="size-4" />
        Back to conversation
      </Link>
    </div>
  );
}

/** Thumbnail tabs for the studio photographs (WAI-ARIA tabs pattern with arrow-key navigation). */
function ViewTabs({
  views,
  activeViewId,
  idPrefix,
  onSelect,
}: {
  views: StudioView[];
  activeViewId: string | null;
  idPrefix: string;
  onSelect: (viewId: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = views.findIndex((v) => v.id === activeViewId);
    const target =
      event.key === "ArrowRight" ? (index + 1) % views.length
      : event.key === "ArrowLeft" ? (index - 1 + views.length) % views.length
      : event.key === "Home" ? 0
      : event.key === "End" ? views.length - 1
      : null;
    if (target === null) return;
    event.preventDefault();
    const view = views[target]!;
    onSelect(view.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${view.id}`)?.focus();
  };
  return (
    <div ref={listRef} role="tablist" aria-label="Studio photographs" onKeyDown={move} className="flex gap-2 overflow-x-auto pb-1.5 [scrollbar-width:thin]">
      {views.map((view) => {
        const selected = view.id === activeViewId;
        return (
          <button
            key={view.id}
            id={`${idPrefix}-tab-${view.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-view-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(view.id)}
            className={cn(
              "group flex w-[84px] shrink-0 flex-col gap-1 rounded-lg border p-1 text-left transition-colors",
              selected ? "border-signal-400/70 bg-signal-900/50" : "border-ink-700 bg-ink-850 hover:border-ink-500",
            )}
          >
            {view.kind === "photo" && view.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- small static thumbnails
              <img src={view.src} alt="" loading="lazy" className="h-12 w-full rounded object-cover" />
            ) : (
              <span aria-hidden className="h-12 w-full rounded bg-ink-750" />
            )}
            <span className={cn("line-clamp-2 px-0.5 text-[11px] leading-tight font-medium", selected ? "text-signal-300" : "text-ink-200")}>
              {view.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EquipmentIndex({
  selectedEquipmentId,
  onChoose,
  viewEquipmentIds,
}: {
  selectedEquipmentId: string | null;
  onChoose: (equipmentId: string) => void;
  viewEquipmentIds: Set<string>;
}) {
  return (
    <section aria-labelledby="equipment-index-title" className="rounded-xl border border-ink-750 bg-ink-900 p-4">
      <h2 id="equipment-index-title" className="text-sm font-semibold text-ink-100">
        All equipment
      </h2>
      <p className="mt-0.5 text-xs text-ink-400">Choose an item to find it in the studio view.</p>
      <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {getCategories().map((category) => (
          <div key={category.id}>
            <h3 className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink-400 uppercase">{category.name}</h3>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {getEquipmentByCategory(category.id).map((record) => {
                const selected = record.id === selectedEquipmentId;
                return (
                  <li key={record.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChoose(record.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[13px] transition-colors",
                        selected
                          ? "border-signal-400/60 bg-signal-900/60 text-signal-300"
                          : "border-ink-700 bg-ink-850 text-ink-200 hover:border-ink-500 hover:text-ink-50",
                        !viewEquipmentIds.has(record.id) && !selected && "border-dashed",
                      )}
                    >
                      {record.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function MissingPhotosNotice() {
  return (
    <Notice tone="caution" title="Real studio photographs haven't been added yet">
      <p>
        The station has collected {EXPECTED_PHOTO_COUNT} photographs. Until they are added, this illustrative layout shows how the
        explorer works. Equipment positions are placeholders and do not reflect the real studio.
      </p>
      <details className="mt-2 group">
        <summary className="cursor-pointer font-medium text-caution-300 hover:text-caution-300/80">How photographs will be added</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-300">
          <li>Copy each photograph into the project&apos;s <code className="font-mono">public/studio/photos</code> folder.</li>
          <li>Add a record for it in <code className="font-mono">src/data/studio-views.ts</code>, with its width and height.</li>
          <li>Mark where each piece of equipment appears in <code className="font-mono">src/data/hotspots.ts</code>.</li>
        </ol>
      </details>
    </Notice>
  );
}

export function EmptyStudioState() {
  return (
    <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink-600 bg-ink-900 p-8 text-center">
      <ImagePlus aria-hidden className="size-8 text-ink-400" />
      <h2 className="font-medium text-ink-100">No studio views available</h2>
      <p className="max-w-md text-sm leading-relaxed text-ink-400">
        Studio photographs haven&apos;t been added yet. You can still choose equipment from the list to read about it. See the
        README for how to add photographs.
      </p>
    </div>
  );
}
