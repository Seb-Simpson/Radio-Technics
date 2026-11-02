import { hotspots } from "@/data/hotspots";
import { demoLayoutView, getStudioViews, studioPhotos } from "@/data/studio-views";
import type { Hotspot, StudioView } from "@/types";

export function getViews(): StudioView[] {
  return getStudioViews();
}

export function hasRealPhotos(): boolean {
  return studioPhotos.length > 0;
}

/** Looks across real photos and the illustrative layout. */
export function getViewById(id: string): StudioView | undefined {
  return [...studioPhotos, demoLayoutView].find((view) => view.id === id);
}

export function getHotspotsForView(viewId: string, source: Hotspot[] = hotspots): Hotspot[] {
  return source.filter((hotspot) => hotspot.viewId === viewId);
}

export function getHotspotsForEquipment(equipmentId: string, source: Hotspot[] = hotspots): Hotspot[] {
  return source.filter((hotspot) => hotspot.equipmentId === equipmentId);
}

/** First view (in display order) that shows the given equipment, if any. */
export function findViewForEquipment(
  equipmentId: string,
  views: StudioView[] = getViews(),
  source: Hotspot[] = hotspots,
): StudioView | undefined {
  return views.find((view) =>
    source.some((hotspot) => hotspot.viewId === view.id && hotspot.equipmentId === equipmentId),
  );
}
