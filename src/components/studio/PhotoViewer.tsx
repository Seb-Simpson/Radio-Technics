"use client";

import { ImageOff, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { getEquipmentById } from "@/lib/content/equipment";
import { cn } from "@/lib/cn";
import type { Hotspot, HotspotRegion, StudioView } from "@/types";
import { StudioDiagram } from "./StudioDiagram";

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
const ZOOM_STEP = 1.4;
const PAN_STEP = 60;
const DRAG_THRESHOLD = 5;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Fit an image of `content` size inside `box`, preserving aspect ratio. */
export function fitSize(content: Size, box: Size): Size {
  if (box.width <= 0 || box.height <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(box.width / content.width, box.height / content.height);
  return { width: content.width * ratio, height: content.height * ratio };
}

/** Keep the image from being panned out of view. */
export function clampTransform(t: Transform, stage: Size, viewport: Size): Transform {
  const scale = clampNumber(t.scale, MIN_SCALE, MAX_SCALE);
  const maxX = Math.max(0, (stage.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (stage.height * scale - viewport.height) / 2);
  return { scale, x: clampNumber(t.x, -maxX, maxX), y: clampNumber(t.y, -maxY, maxY) };
}

/** Zoom while keeping the point `p` (relative to the viewport centre) fixed on screen. */
export function zoomAround(t: Transform, nextScale: number, p: { x: number; y: number }): Transform {
  const scale = clampNumber(nextScale, MIN_SCALE, MAX_SCALE);
  const ratio = scale / t.scale;
  return { scale, x: p.x - (p.x - t.x) * ratio, y: p.y - (p.y - t.y) * ratio };
}

/**
 * Adapt a transform when the fitted stage changes size (window resize,
 * rotation, panel opening). Pan offsets are in screen pixels, so they are
 * scaled with the stage and then re-clamped to the new viewport.
 */
export function adaptTransformToResize(t: Transform, previousStage: Size, stage: Size, viewport: Size): Transform {
  if (stage.width <= 0 || stage.height <= 0 || previousStage.width <= 0 || previousStage.height <= 0) {
    return clampTransform(t, stage, viewport);
  }
  const rx = stage.width / previousStage.width;
  const ry = stage.height / previousStage.height;
  const scaled = { scale: t.scale, x: t.x * rx, y: t.y * ry };
  return Number.isFinite(scaled.x) && Number.isFinite(scaled.y) ? clampTransform(scaled, stage, viewport) : { scale: 1, x: 0, y: 0 };
}

/** Screen position (relative to the viewport centre) of a region's centre. */
export function regionCentreOnScreen(region: HotspotRegion, t: Transform, stage: Size): { x: number; y: number } {
  return {
    x: t.x + (region.x + region.width / 2 - 0.5) * stage.width * t.scale,
    y: t.y + (region.y + region.height / 2 - 0.5) * stage.height * t.scale,
  };
}

/** Keep `region` on screen at the current zoom, moving as little as possible. */
export function keepRegionVisible(region: HotspotRegion, t: Transform, stage: Size, viewport: Size): Transform {
  const centre = regionCentreOnScreen(region, t, stage);
  const marginX = viewport.width / 2 - 24;
  const marginY = viewport.height / 2 - 24;
  if (Math.abs(centre.x) <= marginX && Math.abs(centre.y) <= marginY) return t;
  const cx = (region.x + region.width / 2 - 0.5) * stage.width;
  const cy = (region.y + region.height / 2 - 0.5) * stage.height;
  return clampTransform({ scale: t.scale, x: -cx * t.scale, y: -cy * t.scale }, stage, viewport);
}

/** Transform that centres a hotspot region and zooms in on it moderately. */
export function focusTransform(region: HotspotRegion, stage: Size): Transform {
  const scale = clampNumber(Math.min(0.5 / region.width, 0.5 / region.height, 2.5), MIN_SCALE, MAX_SCALE);
  const cx = (region.x + region.width / 2 - 0.5) * stage.width;
  const cy = (region.y + region.height / 2 - 0.5) * stage.height;
  return { scale, x: -cx * scale, y: -cy * scale };
}

export interface PhotoViewerProps {
  view: StudioView;
  hotspots: Hotspot[];
  selectedEquipmentId: string | null;
  highlightedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string) => void;
  focusRequest?: { equipmentId: string; token: number } | null;
  className?: string;
}

export function PhotoViewer({
  view,
  hotspots,
  selectedEquipmentId,
  highlightedEquipmentId,
  onSelectEquipment,
  focusRequest,
  className,
}: PhotoViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [interacting, setInteracting] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    origin: { x: number; y: number };
    start: Transform;
    moved: boolean;
    pinchDistance?: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const handledFocusToken = useRef<number | null>(null);

  const stage = useMemo(
    () => fitSize({ width: view.width, height: view.height }, viewport),
    [view.width, view.height, viewport],
  );

  // When the stage changes size, rescale and re-clamp the pan, and keep the
  // selected equipment on screen (RT-QA-001 B1).
  const previousStage = useRef<Size>(stage);
  useEffect(() => {
    const before = previousStage.current;
    previousStage.current = stage;
    if (before.width === stage.width && before.height === stage.height) return;
    setTransform((t) => {
      let next = adaptTransformToResize(t, before, stage, viewport);
      const selected = hotspots.find((h) => h.equipmentId === selectedEquipmentId);
      if (selected && stage.width > 0) next = keepRegionVisible(selected.region, next, stage, viewport);
      return next;
    });
  }, [stage, viewport, hotspots, selectedEquipmentId]);

  // Measure the viewport and keep the stage fitted on resize.
  useIsomorphicLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Reset zoom and error state when switching views.
  useEffect(() => {
    setTransform(IDENTITY);
    setImageFailed(false);
    handledFocusToken.current = null;
  }, [view.id]);

  const update = useCallback(
    (next: Transform) => setTransform(clampTransform(next, stage, viewport)),
    [stage, viewport],
  );

  // Zoom to equipment when the workspace asks (e.g. troubleshooter "Show me where").
  useEffect(() => {
    if (!focusRequest || stage.width === 0) return;
    if (handledFocusToken.current === focusRequest.token) return;
    const target = hotspots.find((h) => h.equipmentId === focusRequest.equipmentId);
    if (!target) return;
    handledFocusToken.current = focusRequest.token;
    update(focusTransform(target.region, stage));
  }, [focusRequest, hotspots, stage, update]);

  const zoomBy = useCallback(
    (factor: number, point = { x: 0, y: 0 }) =>
      setTransform((t) => clampTransform(zoomAround(t, t.scale * factor, point), stage, viewport)),
    [stage, viewport],
  );

  const reset = () => setTransform(IDENTITY);

  const relativeToCentre = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }, []);

  // Wheel zoom (needs a non-passive listener so the page doesn't scroll).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      zoomBy(factor, relativeToCentre(event.clientX, event.clientY));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomBy, relativeToCentre]);

  const pinchInfo = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: relativeToCentre((a.x + b.x) / 2, (a.y + b.y) / 2),
    };
  };

  const startGesture = (current: Transform) => {
    const pinch = pointers.current.size >= 2 ? pinchInfo() : null;
    const [first] = [...pointers.current.values()];
    gesture.current = {
      origin: pinch ? pinch.mid : first ? relativeToCentre(first.x, first.y) : { x: 0, y: 0 },
      start: current,
      moved: gesture.current?.moved ?? false,
      pinchDistance: pinch?.distance,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointers.current.size === 0) {
      suppressClick.current = false;
      gesture.current = null;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture(transform);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;

    if (pointers.current.size >= 2 && g.pinchDistance) {
      const pinch = pinchInfo();
      if (!pinch) return;
      g.moved = true;
      setInteracting(true);
      const zoomed = zoomAround(g.start, (g.start.scale * pinch.distance) / g.pinchDistance, g.origin);
      update({ ...zoomed, x: zoomed.x + pinch.mid.x - g.origin.x, y: zoomed.y + pinch.mid.y - g.origin.y });
      return;
    }

    const point = relativeToCentre(event.clientX, event.clientY);
    const dx = point.x - g.origin.x;
    const dy = point.y - g.origin.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!g.moved) {
      g.moved = true;
      setInteracting(true);
      // Capture only once dragging starts, so plain clicks still reach hotspots.
      try {
        viewportRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* pointer may already be released */
      }
    }
    update({ ...g.start, x: g.start.x + dx, y: g.start.y + dy });
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (gesture.current?.moved) {
      // Swallow only the click generated by this drag, then re-enable
      // activation — keyboard activation must never be blocked (RT-QA-001 B2).
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    if (pointers.current.size === 0) {
      setInteracting(false);
    } else {
      // Pinch → single finger: continue panning from the current position.
      startGesture(transform);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let handled = true;
    switch (event.key) {
      case "+":
      case "=":
        zoomBy(ZOOM_STEP);
        break;
      case "-":
      case "_":
        zoomBy(1 / ZOOM_STEP);
        break;
      case "0":
        reset();
        break;
      case "ArrowLeft":
        update({ ...transform, x: transform.x + PAN_STEP });
        break;
      case "ArrowRight":
        update({ ...transform, x: transform.x - PAN_STEP });
        break;
      case "ArrowUp":
        update({ ...transform, y: transform.y + PAN_STEP });
        break;
      case "ArrowDown":
        update({ ...transform, y: transform.y - PAN_STEP });
        break;
      default:
        handled = false;
    }
    if (handled && (event.key.startsWith("Arrow") ? transform.scale > 1 : true)) event.preventDefault();
  };

  // Never render a transform that could push the image out of view, even
  // for the frame between a resize and the effect above.
  const shown = clampTransform(transform, stage, viewport);
  const showHotspots = !(view.kind === "photo" && imageFailed);
  const zoomPercent = Math.round(transform.scale * 100);

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-ink-750 bg-ink-950", className)}>
      <div
        ref={viewportRef}
        role="group"
        aria-roledescription="zoomable studio view"
        aria-label={`${view.title}. Use plus and minus to zoom, arrow keys to move around, and 0 to reset. Press Tab to move between equipment.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={cn(
          "absolute inset-0 flex touch-none items-center justify-center select-none focus-visible:outline-offset-[-2px]",
          transform.scale > 1 ? (interacting ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
        )}
      >
        <div
          data-testid="viewer-stage"
          className={cn(
            "relative shrink-0 origin-center will-change-transform",
            !interacting && "transition-transform duration-300 ease-(--ease-out-quart) motion-reduce:transition-none",
          )}
          style={
            {
              width: stage.width,
              height: stage.height,
              transform: `translate3d(${shown.x}px, ${shown.y}px, 0) scale(${shown.scale})`,
              "--s": shown.scale,
            } as CSSProperties
          }
        >
          {view.kind === "photo" && view.src && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- transforms are applied manually
            <img
              src={view.src}
              alt={view.alt}
              draggable={false}
              onError={() => setImageFailed(true)}
              className="pointer-events-none size-full object-contain"
            />
          ) : view.kind === "diagram" ? (
            <StudioDiagram className="pointer-events-none size-full" />
          ) : null}

          {showHotspots &&
            hotspots.map((hotspot) => (
              <HotspotButton
                key={hotspot.id}
                hotspot={hotspot}
                selected={hotspot.equipmentId === selectedEquipmentId}
                highlighted={hotspot.equipmentId === highlightedEquipmentId}
                onActivate={(event) => {
                  // detail === 0: activated by keyboard (Enter/Space), never a drag.
                  if (suppressClick.current && event.detail !== 0) return;
                  suppressClick.current = false;
                  onSelectEquipment(hotspot.equipmentId);
                }}
              />
            ))}
        </div>

        {view.kind === "photo" && (imageFailed || !view.src) && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <ImageOff aria-hidden className="size-8 text-ink-400" />
            <p className="font-medium text-ink-100">This photograph couldn&apos;t be loaded</p>
            <p className="max-w-sm text-sm text-ink-400">
              Check that <code className="font-mono text-ink-300">{view.src ?? "(no file set)"}</code> exists in the
              project&apos;s <code className="font-mono text-ink-300">public</code> folder. You can still choose equipment from the
              list.
            </p>
          </div>
        )}
      </div>

      {view.illustrative && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-md border border-caution-400/30 bg-ink-950/85 px-2.5 py-1 text-[11px] font-medium text-caution-300 backdrop-blur">
          Illustrative layout — not the real studio
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-900/90 p-1 shadow-lg shadow-black/30 backdrop-blur">
        <ViewerButton label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={transform.scale <= MIN_SCALE}>
          <Minus aria-hidden className="size-4" />
        </ViewerButton>
        <output aria-live="polite" aria-label="Zoom level" className="w-12 text-center font-mono text-xs text-ink-300 tabular-nums">
          {zoomPercent}%
        </output>
        <ViewerButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={transform.scale >= MAX_SCALE}>
          <Plus aria-hidden className="size-4" />
        </ViewerButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-ink-700" />
        <ViewerButton label="Reset zoom" onClick={reset} disabled={transform.scale === 1 && transform.x === 0 && transform.y === 0}>
          <RotateCcw aria-hidden className="size-4" />
        </ViewerButton>
      </div>
    </div>
  );
}

function ViewerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md text-ink-200 transition-colors hover:bg-ink-750 hover:text-ink-50 disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function HotspotButton({
  hotspot,
  selected,
  highlighted,
  onActivate,
}: {
  hotspot: Hotspot;
  selected: boolean;
  highlighted: boolean;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const record = getEquipmentById(hotspot.equipmentId);
  if (!record) return null; // Unknown references are never rendered.
  const { x, y, width, height } = hotspot.region;
  return (
    <button
      type="button"
      data-equipment-id={record.id}
      data-selected={selected || undefined}
      data-highlighted={highlighted || undefined}
      aria-pressed={selected}
      aria-label={`${record.name}${hotspot.placeholder ? " (placeholder position)" : ""}`}
      onClick={onActivate}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }}
      className={cn(
        "group absolute rounded-[calc(8px/var(--s))] border-[calc(1.5px/var(--s))] transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-none",
        selected
          ? "border-signal-300 bg-signal-400/15"
          : highlighted
            ? "border-signal-400 bg-signal-400/10"
            : "border-ink-200/0 hover:border-ink-100/70 hover:bg-ink-50/5 focus-visible:border-signal-300 focus-visible:bg-signal-400/10",
        highlighted && "animate-pulse-ring",
      )}
    >
      {/* Faint corner ticks keep hotspots discoverable without cluttering the image. */}
      {!selected && !highlighted && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-px -left-px size-[calc(10px/var(--s))] rounded-tl-[calc(6px/var(--s))] border-t-[calc(2px/var(--s))] border-l-[calc(2px/var(--s))] border-signal-400/70 transition-opacity group-hover:opacity-0"
        />
      )}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-full left-0 mb-[calc(4px/var(--s))] origin-bottom-left scale-[calc(1/var(--s))] rounded-md px-2 py-0.5 text-[12px] font-medium whitespace-nowrap shadow-md shadow-black/40 transition-opacity duration-150",
          selected || highlighted
            ? "bg-signal-400 text-ink-950 opacity-100"
            : "bg-ink-900/95 text-ink-100 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {record.shortName.charAt(0).toUpperCase() + record.shortName.slice(1)}
      </span>
    </button>
  );
}
