"use client";

import { withBasePath } from "@/lib/base-path";
import { Check, Copy, Crosshair, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { PhotoViewer } from "@/components/studio/PhotoViewer";
import { buttonStyles } from "@/components/ui/button-styles";
import { getAllEquipment, getEquipmentById } from "@/lib/content/equipment";
import { pixelsToRegion, validateRegion } from "@/lib/content/geometry";
import { cn } from "@/lib/cn";
import type { Hotspot, StudioView } from "@/types";

/** A hotspot being edited, in whole image pixels. */
export interface DraftHotspot {
  key: string;
  suffix: string;
  equipmentId: string;
  rect: PixelRect;
  note: string;
}

export interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type Corner = "nw" | "ne" | "sw" | "se";
type Gesture =
  | { kind: "draw"; origin: Point }
  | { kind: "move"; origin: Point; start: PixelRect }
  | { kind: "resize"; corner: Corner; start: PixelRect };
interface Point {
  x: number;
  y: number;
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_DRAW_PX = 6;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Normalise a rectangle so left<right/top<bottom, rounded and clamped to the image. */
export function normaliseRect(r: PixelRect, size: { width: number; height: number }): PixelRect {
  const left = clamp(Math.round(Math.min(r.left, r.right)), 0, size.width);
  const right = clamp(Math.round(Math.max(r.left, r.right)), 0, size.width);
  const top = clamp(Math.round(Math.min(r.top, r.bottom)), 0, size.height);
  const bottom = clamp(Math.round(Math.max(r.top, r.bottom)), 0, size.height);
  return { left, top, right, bottom };
}

/** Problems that would stop a draft becoming valid configuration. */
export function validateDraft(draft: DraftHotspot, size: { width: number; height: number }, others: DraftHotspot[]): string[] {
  const errors: string[] = [];
  if (!ID_PATTERN.test(draft.suffix)) errors.push("ID must be lower-case words separated by hyphens");
  if (others.some((o) => o.key !== draft.key && o.suffix === draft.suffix)) errors.push("ID is already used on this photo");
  if (!getEquipmentById(draft.equipmentId)) errors.push("Choose a valid equipment record");
  const r = draft.rect;
  if ([r.left, r.top, r.right, r.bottom].some((n) => !Number.isFinite(n))) errors.push("Coordinates must be numbers");
  else if (r.left < 0 || r.top < 0 || r.right > size.width || r.bottom > size.height) errors.push("Region extends outside the photo");
  else errors.push(...validateRegion(pixelsToRegion(size, r)));
  return errors;
}

/** The TypeScript to paste into src/data/hotspots.ts. */
export function toHotspotCode(viewId: string, drafts: DraftHotspot[]): string {
  return drafts
    .map((d) => {
      const note = JSON.stringify(d.note.trim() || "Placed with the hotspot editor. Not yet confirmed by the engineer.");
      return `  onPhoto(${JSON.stringify(viewId)}, ${JSON.stringify(d.suffix)}, ${JSON.stringify(d.equipmentId)}, [${d.rect.left}, ${d.rect.top}, ${d.rect.right}, ${d.rect.bottom}], ${note}),`;
    })
    .join("\n");
}

export function draftsFromHotspots(view: StudioView, hotspots: Hotspot[]): DraftHotspot[] {
  return hotspots
    .filter((h) => h.viewId === view.id)
    .map((h) => ({
      key: h.id,
      suffix: h.id.startsWith(`${view.id}-`) ? h.id.slice(view.id.length + 1) : h.id,
      equipmentId: h.equipmentId,
      note: h.note ?? "",
      rect: {
        left: Math.round(h.region.x * view.width),
        top: Math.round(h.region.y * view.height),
        right: Math.round((h.region.x + h.region.width) * view.width),
        bottom: Math.round((h.region.y + h.region.height) * view.height),
      },
    }));
}

interface Props {
  views: StudioView[];
  hotspots: Hotspot[];
}

export function HotspotEditor({ views, hotspots }: Props) {
  const photos = views.filter((v) => v.kind === "photo");
  const [viewId, setViewId] = useState<string>(photos[0]?.id ?? "local");
  const [localPhoto, setLocalPhoto] = useState<StudioView | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const view = viewId === "local" ? localPhoto : (photos.find((v) => v.id === viewId) ?? null);

  const [drafts, setDrafts] = useState<DraftHotspot[]>(() => (photos[0] ? draftsFromHotspots(photos[0], hotspots) : []));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState(getAllEquipment()[0]?.id ?? "");
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const counter = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const selected = drafts.find((d) => d.key === selectedKey) ?? null;
  const size = view ? { width: view.width, height: view.height } : { width: 1, height: 1 };
  const errorsByKey = useMemo(() => new Map(drafts.map((d) => [d.key, validateDraft(d, size, drafts)])), [drafts, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const allValid = drafts.length > 0 && [...errorsByKey.values()].every((e) => e.length === 0);

  // Revoke object URLs for local photos when replaced.
  useEffect(() => () => {
    if (localPhoto?.src?.startsWith("blob:")) URL.revokeObjectURL(localPhoto.src);
  }, [localPhoto]);

  const chooseView = (id: string) => {
    setViewId(id);
    setSelectedKey(null);
    setPreview(false);
    const next = id === "local" ? localPhoto : photos.find((v) => v.id === id);
    setDrafts(next && id !== "local" ? draftsFromHotspots(next, hotspots) : []);
  };

  const loadLocal = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLocalError("That file isn't an image.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const id = file.name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-photo";
      setLocalPhoto({ id, title: file.name, description: "", kind: "photo", src: url, width: img.naturalWidth, height: img.naturalHeight, alt: file.name, illustrative: false });
      setViewId("local");
      setDrafts([]);
      setSelectedKey(null);
    };
    img.onerror = () => setLocalError("That image couldn't be read.");
    img.src = url;
  };

  const toImagePoint = (clientX: number, clientY: number): Point => {
    const box = canvasRef.current!.getBoundingClientRect();
    return {
      x: clamp(((clientX - box.left) / box.width) * size.width, 0, size.width),
      y: clamp(((clientY - box.top) / box.height) * size.height, 0, size.height),
    };
  };

  const updateDraft = (key: string, patch: Partial<DraftHotspot>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const nextSuffix = (eqId: string) => {
    const base = eqId.replace(/^.*?-/, "") || "item";
    let n = 1;
    let suffix = base;
    while (drafts.some((d) => d.suffix === suffix)) suffix = `${base}-${++n}`;
    return suffix;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!view || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const point = toImagePoint(event.clientX, event.clientY);
    const corner = target.dataset.corner as Corner | undefined;
    const key = target.closest<HTMLElement>("[data-draft-key]")?.dataset.draftKey;
    if (corner && key) {
      const draft = drafts.find((d) => d.key === key)!;
      setSelectedKey(key);
      gesture.current = { kind: "resize", corner, start: draft.rect };
    } else if (key) {
      const draft = drafts.find((d) => d.key === key)!;
      setSelectedKey(key);
      gesture.current = { kind: "move", origin: point, start: draft.rect };
    } else {
      const newKey = `new-${++counter.current}`;
      setDrafts((list) => [...list, { key: newKey, suffix: nextSuffix(equipmentId), equipmentId, note: "", rect: { left: point.x, top: point.y, right: point.x, bottom: point.y } }]);
      setSelectedKey(newKey);
      gesture.current = { kind: "draw", origin: point };
    }
    canvasRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !selectedKey) return;
    const p = toImagePoint(event.clientX, event.clientY);
    if (g.kind === "draw") {
      updateDraft(selectedKey, { rect: normaliseRect({ left: g.origin.x, top: g.origin.y, right: p.x, bottom: p.y }, size) });
    } else if (g.kind === "move") {
      const w = g.start.right - g.start.left;
      const h = g.start.bottom - g.start.top;
      const left = clamp(g.start.left + p.x - g.origin.x, 0, size.width - w);
      const top = clamp(g.start.top + p.y - g.origin.y, 0, size.height - h);
      updateDraft(selectedKey, { rect: normaliseRect({ left, top, right: left + w, bottom: top + h }, size) });
    } else {
      const r = { ...g.start };
      if (g.corner.includes("n")) r.top = p.y;
      if (g.corner.includes("s")) r.bottom = p.y;
      if (g.corner.includes("w")) r.left = p.x;
      if (g.corner.includes("e")) r.right = p.x;
      updateDraft(selectedKey, { rect: normaliseRect(r, size) });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    // Discard accidental clicks that didn't draw anything.
    if (g?.kind === "draw" && selected) {
      const r = drafts.find((d) => d.key === selectedKey)?.rect;
      if (r && (r.right - r.left < MIN_DRAW_PX || r.bottom - r.top < MIN_DRAW_PX)) {
        setDrafts((list) => list.filter((d) => d.key !== selectedKey));
        setSelectedKey(null);
      }
    }
  };

  /** Arrow keys move the selected region; Shift moves further; Alt resizes. */
  const onCanvasKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const step = event.shiftKey ? 20 : 2;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!d) {
      if (event.key === "Delete" || event.key === "Backspace") {
        setDrafts((list) => list.filter((x) => x.key !== selected.key));
        setSelectedKey(null);
        event.preventDefault();
      }
      return;
    }
    event.preventDefault();
    const [dx, dy] = d as [number, number];
    const r = selected.rect;
    const next = event.altKey
      ? { ...r, right: r.right + dx, bottom: r.bottom + dy }
      : { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
    if (!event.altKey && (next.left < 0 || next.top < 0 || next.right > size.width || next.bottom > size.height)) return;
    updateDraft(selected.key, { rect: normaliseRect(next, size) });
  };

  const code = view ? toHotspotCode(view.id, drafts) : "";
  const previewHotspots: Hotspot[] = view
    ? drafts
        .filter((d) => errorsByKey.get(d.key)?.length === 0)
        .map((d) => ({ id: `${view.id}-${d.suffix}`, viewId: view.id, equipmentId: d.equipmentId, region: pixelsToRegion(size, d.rect), placeholder: false, identity: "draft", note: d.note }))
    : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-ink-300">
            Photograph
            <select
              value={viewId}
              onChange={(e) => chooseView(e.target.value)}
              className="h-10 rounded-lg border border-ink-600 bg-ink-850 px-3 text-sm text-ink-50"
            >
              {photos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} ({v.width}×{v.height})
                </option>
              ))}
              {localPhoto && <option value="local">Local file: {localPhoto.title}</option>}
            </select>
          </label>
          <label className={buttonStyles({ size: "md", className: "cursor-pointer focus-within:outline-2 focus-within:outline-signal-400" })}>
            <ImagePlus aria-hidden className="size-4" />
            Open a local photo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => loadLocal(e.target.files?.[0])} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-300">
            Equipment for new regions
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="h-10 rounded-lg border border-ink-600 bg-ink-850 px-3 text-sm text-ink-50"
            >
              {getAllEquipment().map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setPreview((p) => !p)} aria-pressed={preview} className={buttonStyles({ size: "md" })} disabled={!view}>
            <Crosshair aria-hidden className="size-4" />
            {preview ? "Back to editing" : "Preview in viewer"}
          </button>
        </div>
        {localError && (
          <p role="alert" className="text-sm text-alert-300">
            {localError}
          </p>
        )}
        {localPhoto && viewId === "local" && (
          <p className="text-[13px] text-ink-300">
            Local files stay in this browser. To add this photo to the app, run{" "}
            <code className="font-mono text-ink-100">node scripts/import-photo.mjs {localPhoto.title} {localPhoto.id}</code>.
          </p>
        )}

        {!view ? (
          <p className="rounded-xl border border-dashed border-ink-600 p-8 text-center text-ink-300">Choose or open a photograph to begin.</p>
        ) : preview ? (
          <PhotoViewer
            view={view}
            hotspots={previewHotspots}
            selectedEquipmentId={selected?.equipmentId ?? null}
            highlightedEquipmentId={null}
            onSelectEquipment={() => {}}
            className="aspect-[4/3] w-full"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink-750 bg-ink-950 p-2">
            <div
              ref={canvasRef}
              role="application"
              aria-label={`Hotspot drawing area for ${view.title}. Drag to draw a region. Select a region, then use arrow keys to move it, Alt and arrow keys to resize, Delete to remove.`}
              tabIndex={0}
              onKeyDown={onCanvasKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              data-testid="hotspot-canvas"
              className="relative mx-auto touch-none select-none"
              style={{ aspectRatio: `${view.width} / ${view.height}`, maxHeight: "70vh", maxWidth: "100%" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- editor shows the raw file */}
              <img src={view.src?.startsWith("blob:") ? view.src : withBasePath(view.src ?? "")} alt={view.alt} draggable={false} className="pointer-events-none size-full object-contain" />
              {drafts.map((d) => {
                const errors = errorsByKey.get(d.key) ?? [];
                const isSelected = d.key === selectedKey;
                return (
                  <div
                    key={d.key}
                    data-draft-key={d.key}
                    className={cn(
                      "absolute cursor-move border-2",
                      errors.length ? "border-alert-400 bg-alert-400/10" : isSelected ? "border-signal-300 bg-signal-400/20" : "border-signal-400/70 bg-signal-400/5",
                    )}
                    style={{
                      left: `${(d.rect.left / size.width) * 100}%`,
                      top: `${(d.rect.top / size.height) * 100}%`,
                      width: `${((d.rect.right - d.rect.left) / size.width) * 100}%`,
                      height: `${((d.rect.bottom - d.rect.top) / size.height) * 100}%`,
                    }}
                  >
                    <span className="pointer-events-none absolute -top-5 left-0 rounded bg-ink-900/90 px-1 text-[11px] whitespace-nowrap text-ink-100">
                      {getEquipmentById(d.equipmentId)?.shortName ?? d.equipmentId}
                    </span>
                    {isSelected &&
                      (["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
                        <span
                          key={c}
                          data-corner={c}
                          aria-hidden
                          className={cn(
                            "absolute size-3.5 rounded-sm border-2 border-ink-950 bg-signal-300",
                            c.includes("n") ? "-top-2" : "-bottom-2",
                            c.includes("w") ? "-left-2" : "-right-2",
                            c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
                          )}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <aside aria-label="Hotspot details" className="flex flex-col gap-4">
        <section className="rounded-xl border border-ink-750 bg-ink-900 p-4">
          <h2 className="text-sm font-semibold text-ink-100">Regions on this photo</h2>
          {drafts.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-300">Drag on the photo to draw the first region.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {drafts.map((d) => {
                const errors = errorsByKey.get(d.key) ?? [];
                return (
                  <li key={d.key}>
                    <button
                      type="button"
                      aria-pressed={d.key === selectedKey}
                      onClick={() => setSelectedKey(d.key)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                        d.key === selectedKey ? "bg-ink-800 text-ink-50" : "text-ink-200 hover:bg-ink-850",
                      )}
                    >
                      <span className="truncate">
                        <span className="font-mono">{d.suffix}</span> · {getEquipmentById(d.equipmentId)?.name ?? "Unknown equipment"}
                      </span>
                      {errors.length > 0 ? <span className="shrink-0 text-alert-300">Invalid</span> : <Check aria-label="Valid" className="size-3.5 shrink-0 text-signal-400" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-ink-300">
            <Plus aria-hidden className="mr-1 inline size-3" />
            New regions use the equipment chosen above.
          </p>
        </section>

        {selected && view && (
          <section aria-label="Selected region" className="rounded-xl border border-ink-750 bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-100">Selected region</h2>
              <button
                type="button"
                onClick={() => {
                  setDrafts((list) => list.filter((d) => d.key !== selected.key));
                  setSelectedKey(null);
                }}
                className={buttonStyles({ variant: "ghost", size: "sm" })}
              >
                <Trash2 aria-hidden className="size-3.5" />
                Remove
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1 text-[12px] text-ink-300">
                Hotspot ID (after “{view.id}-”)
                <input
                  value={selected.suffix}
                  onChange={(e) => updateDraft(selected.key, { suffix: e.target.value })}
                  className="h-9 rounded-md border border-ink-600 bg-ink-850 px-2 font-mono text-sm text-ink-50"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-[12px] text-ink-300">
                Equipment
                <select
                  value={selected.equipmentId}
                  onChange={(e) => updateDraft(selected.key, { equipmentId: e.target.value })}
                  className="h-9 rounded-md border border-ink-600 bg-ink-850 px-2 text-sm text-ink-50"
                >
                  {getAllEquipment().map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {(["left", "top", "right", "bottom"] as const).map((edge) => (
                <label key={edge} className="flex flex-col gap-1 text-[12px] text-ink-300">
                  {edge[0]!.toUpperCase() + edge.slice(1)} (px)
                  <input
                    type="number"
                    value={Number.isFinite(selected.rect[edge]) ? selected.rect[edge] : ""}
                    onChange={(e) => updateDraft(selected.key, { rect: { ...selected.rect, [edge]: e.target.value === "" ? Number.NaN : Number(e.target.value) } })}
                    className="h-9 rounded-md border border-ink-600 bg-ink-850 px-2 font-mono text-sm text-ink-50"
                  />
                </label>
              ))}
              <label className="col-span-2 flex flex-col gap-1 text-[12px] text-ink-300">
                How it was identified
                <input
                  value={selected.note}
                  onChange={(e) => updateDraft(selected.key, { note: e.target.value })}
                  placeholder="e.g. Labelled on the unit"
                  className="h-9 rounded-md border border-ink-600 bg-ink-850 px-2 text-sm text-ink-50"
                />
              </label>
            </div>
            {(errorsByKey.get(selected.key)?.length ?? 0) > 0 && (
              <ul role="alert" className="mt-3 flex flex-col gap-1 text-[13px] text-alert-300">
                {errorsByKey.get(selected.key)!.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border border-ink-750 bg-ink-900 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-100">Configuration</h2>
            <button type="button" onClick={copy} disabled={!allValid} className={buttonStyles({ variant: "primary", size: "sm" })}>
              {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-[12px] text-ink-300">
            Paste into <code className="font-mono">photoHotspots</code> in <code className="font-mono">src/data/hotspots.ts</code>, then run{" "}
            <code className="font-mono">npm test</code>.
          </p>
          {!allValid && drafts.length > 0 && <p className="mt-2 text-[13px] text-alert-300">Fix the invalid regions before copying.</p>}
          <pre
            tabIndex={0}
            aria-label="Generated hotspot configuration"
            data-testid="hotspot-code"
            className="mt-2 max-h-64 overflow-auto rounded-md bg-ink-950 p-2 font-mono text-[11px] leading-relaxed whitespace-pre text-ink-200"
          >
            {code || "// No regions yet"}
          </pre>
        </section>
      </aside>
    </div>
  );
}
