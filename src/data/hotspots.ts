import type { Hotspot, HotspotRegion } from "@/types";
import { demoLayoutView } from "./studio-views";

/**
 * Convert a pixel rectangle (as measured on the source image) into the
 * fractional region stored on a hotspot. Fractions keep hotspots aligned at
 * any display size and zoom level.
 */
export function regionFromPixels(
  view: { width: number; height: number },
  rect: { left: number; top: number; right: number; bottom: number },
): HotspotRegion {
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return {
    x: round(rect.left / view.width),
    y: round(rect.top / view.height),
    width: round((rect.right - rect.left) / view.width),
    height: round((rect.bottom - rect.top) / view.height),
  };
}

const demo = (
  id: string,
  equipmentId: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Hotspot => ({
  id,
  viewId: demoLayoutView.id,
  equipmentId,
  region: regionFromPixels(demoLayoutView, { left, top, right, bottom }),
  placeholder: true,
});

/**
 * Hotspots for the illustrative layout. Every one is a placeholder.
 * Hotspots for real photographs should be added here once photos exist.
 */
export const hotspots: Hotspot[] = [
  demo("demo-camera", "zoom-camera", 735, 60, 865, 180),
  demo("demo-speaker-left", "studio-monitor-speakers", 190, 240, 320, 450),
  demo("demo-speaker-right", "studio-monitor-speakers", 1160, 240, 1290, 450),
  demo("demo-screen-myriad", "myriad-playout", 460, 220, 750, 430),
  demo("demo-screen-computer", "studio-computers", 755, 220, 1040, 430),
  demo("demo-meters", "audio-level-meters", 1050, 240, 1150, 430),
  demo("demo-mic-presenter", "presenter-microphone", 330, 395, 450, 600),
  demo("demo-mic-guest", "guest-microphones", 1030, 445, 1150, 610),
  demo("demo-console", "mixing-console", 470, 610, 1030, 810),
  demo("demo-green-button", "green-next-button", 1070, 650, 1170, 750),
  demo("demo-headphones", "headphone-monitoring", 220, 640, 390, 790),
  demo("demo-rack", "equipment-rack", 1370, 170, 1570, 885),
];
