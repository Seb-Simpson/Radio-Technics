import { pixelsToRegion } from "@/lib/content/geometry";
import type { Hotspot } from "@/types";
import { demoLayoutView, studioPhotos } from "./studio-views";

/**
 * Convert a pixel rectangle (as measured on the source image) into the
 * fractional region stored on a hotspot. Fractions keep hotspots aligned at
 * any display size and zoom level.
 */
/**
 * Convert a pixel rectangle (as measured on the source image) into the
 * fractional region stored on a hotspot. Fractions keep hotspots aligned at
 * any display size and zoom level.
 */
export const regionFromPixels = pixelsToRegion;

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
  identity: "draft",
  note: "Illustrative drawing only.",
});

function viewSize(viewId: string) {
  const view = studioPhotos.find((v) => v.id === viewId);
  if (!view) throw new Error(`Unknown studio photo "${viewId}"`);
  return view;
}

/**
 * A hotspot on a real photograph, measured in that photo's pixels.
 * `identity` stays "draft" until the station engineer confirms the item.
 */
const onPhoto = (
  viewId: string,
  suffix: string,
  equipmentId: string,
  [left, top, right, bottom]: [number, number, number, number],
  note: string,
): Hotspot => ({
  id: `${viewId}-${suffix}`,
  viewId,
  equipmentId,
  region: regionFromPixels(viewSize(viewId), { left, top, right, bottom }),
  placeholder: false,
  identity: "draft",
  note,
});

/**
 * Hotspots on the station's photographs. Positions were placed by the
 * development team from the photos and checked visually; which equipment
 * record each one shows is unconfirmed until the engineer reviews it.
 * Smaller items are listed after larger ones so they sit on top.
 */
export const photoHotspots: Hotspot[] = [
  onPhoto("mixing-console", "console", "mixing-console", [0, 265, 1200, 1105], "Identified from the Axia iQ label on the console."),
  onPhoto("mixing-console", "meters", "audio-level-meters", [150, 165, 640, 250], "Meter displays labelled PROGRAM 1 and MONITOR."),
  onPhoto("mixing-console", "headphones-knob", "headphone-monitoring", [1025, 955, 1125, 1050], "Knob labelled HEADPHONES on the console."),
  onPhoto("myriad-screen", "screen", "myriad-playout", [55, 420, 1200, 1080], "Title bar reads Myriad Playout v6."),
  onPhoto("myriad-screen", "console", "mixing-console", [0, 1180, 1200, 1600], "Top edge of the Axia iQ console."),
  onPhoto("myriad-screen", "meters", "audio-level-meters", [90, 1235, 295, 1310], "Meter display labelled MONITOR."),
  onPhoto("microphone", "mic", "presenter-microphone", [265, 85, 765, 1355], "Assumed to be the presenter microphone because of its position. Not confirmed."),
  onPhoto("microphone", "screen", "myriad-playout", [770, 940, 1200, 1500], "Myriad screen behind the microphone."),
  onPhoto("green-button", "button", "green-next-button", [300, 100, 875, 800], "Standalone green button."),
  onPhoto("green-button", "headphones", "headphone-monitoring", [0, 1265, 580, 1600], "Appears to be a pair of headphones at the edge of the photo. Not confirmed."),
  onPhoto("fader-panel", "panel", "mixing-console", [150, 160, 1095, 975], "Eight-fader panel. Whether it is part of the main console is not confirmed."),
  onPhoto("level-meters", "ppm", "audio-level-meters", [15, 405, 1195, 1075], "Labelled Canford Dual PPM."),
  onPhoto("monitor-speaker", "speaker", "studio-monitor-speakers", [460, 315, 745, 805], "Labelled MS16 Monitor Speaker."),
  onPhoto("monitor-speaker-booth", "speaker", "studio-monitor-speakers", [515, 550, 710, 815], "May be the same speaker as the other photo. Not confirmed."),
  onPhoto("webcam", "camera", "zoom-camera", [335, 315, 980, 870], "Webcam used for Zoom calls (station reported)."),
  onPhoto("equipment-rack", "engine", "equipment-rack", [95, 75, 1485, 400], "Labelled Axia QOR.16 Integrated Console Engine."),
  onPhoto("equipment-rack", "xnode", "equipment-rack", [115, 655, 795, 810], "Labelled X-NODE 2 / The Telos Alliance."),
  onPhoto("equipment-rack", "power-panel", "equipment-rack", [165, 855, 1455, 990], "Fourteen numbered switches with labels such as DESK PSU and MIC LIVE."),
];

/** Hotspots for the illustrative layout. Every one is a placeholder. */
export const demoHotspots: Hotspot[] = [
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

export const hotspots: Hotspot[] = [...photoHotspots, ...demoHotspots];
