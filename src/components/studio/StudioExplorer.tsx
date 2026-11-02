"use client";

import { ArrowLeft, ImagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hotspots as defaultHotspots } from "@/data/hotspots";
import { EXPECTED_PHOTO_COUNT } from "@/data/studio-views";
import { Notice } from "@/components/ui/Notice";
import { buttonStyles } from "@/components/ui/button-styles";
import { getCategories, getEquipmentByCategory } from "@/lib/content/equipment";
import { getViews } from "@/lib/content/views";
import { cn } from "@/lib/cn";
import { useTroubleshooter } from "@/lib/troubleshooter/TroubleshooterProvider";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";
import type { Hotspot, StudioView } from "@/types";
import { EquipmentPanel } from "./EquipmentPanel";
import { PhotoViewer } from "./PhotoViewer";

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

  const activeView = views.find((view) => view.id === state.activeViewId) ?? views[0];
  const viewHotspots = activeView ? hotspots.filter((h) => h.viewId === activeView.id) : [];
  const hasRealPhotos = views.some((view) => !view.illustrative);
  const selectedInView = viewHotspots.some((h) => h.equipmentId === state.selectedEquipmentId);

  const selectEquipment = (equipmentId: string) => run([{ type: "select_equipment", equipmentId }]);
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
      onClose={() => run([{ type: "clear_selection" }])}
      onTroubleshoot={canTroubleshoot ? troubleshoot : undefined}
      troubleshootLabel={embedded ? "Use in troubleshooter" : "Troubleshoot this"}
      inCurrentView={selectedInView}
    />
  );

  return (
    <div className={cn("flex flex-col gap-4", embedded && "h-full")}>
      {!hasRealPhotos && !embedded && <MissingPhotosNotice />}

      {!embedded && conversationActive && (
        <div>
          <Link href="/troubleshooter" className={buttonStyles({ size: "sm" })}>
            <ArrowLeft aria-hidden className="size-4" />
            Back to troubleshooter
          </Link>
        </div>
      )}

      <div className={cn("grid gap-4", embedded ? "min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="flex min-w-0 flex-col gap-3">
          {views.length > 1 && (
            <div role="tablist" aria-label="Studio views" className="flex gap-1.5 overflow-x-auto pb-1">
              {views.map((view) => {
                const selected = view.id === activeView?.id;
                return (
                  <button
                    key={view.id}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    onClick={() => run([{ type: "show_view", viewId: view.id }])}
                    className={cn(
                      "shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                      selected ? "border-signal-500/50 bg-signal-900/50 text-signal-300" : "border-ink-700 bg-ink-850 text-ink-300 hover:text-ink-100",
                    )}
                  >
                    {view.title}
                  </button>
                );
              })}
            </div>
          )}

          {activeView ? (
            <PhotoViewer
              view={activeView}
              hotspots={viewHotspots}
              selectedEquipmentId={state.selectedEquipmentId}
              highlightedEquipmentId={state.highlightedEquipmentId}
              focusRequest={state.focusRequest}
              onSelectEquipment={selectEquipment}
              className={embedded ? "aspect-[16/10] w-full" : "aspect-[4/3] w-full sm:aspect-[16/10] xl:aspect-auto xl:h-[min(64vh,680px)]"}
            />
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

        <aside
          aria-label="Selected equipment"
          className={cn(
            "overflow-y-auto rounded-xl border border-ink-750 bg-ink-900",
            embedded ? "min-h-0" : "xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start",
          )}
        >
          {panel}
        </aside>
      </div>
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
