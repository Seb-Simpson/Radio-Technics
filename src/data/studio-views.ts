import type { StudioView } from "@/types";

/**
 * Real studio photographs.
 *
 * The station has collected ten photographs, but none have been added to the
 * project yet. To add one:
 *   1. Copy the file into /public/studio/photos/ (e.g. studio-01.jpg).
 *   2. Add an entry below with its real pixel width and height.
 *   3. Add hotspots for it in src/data/hotspots.ts.
 * See README.md → "Adding studio photographs".
 */
export const studioPhotos: StudioView[] = [];

/**
 * Illustrative layout used ONLY to demonstrate the explorer while real
 * photographs are unavailable. It does not depict the real studio and its
 * positions must not be relied on.
 */
export const demoLayoutView: StudioView = {
  id: "demo-layout",
  title: "Illustrative layout",
  description:
    "A simplified drawing used to demonstrate the Studio Explorer. It is not the real studio, and equipment positions are placeholders.",
  kind: "diagram",
  width: 1600,
  height: 900,
  alt: "Simplified illustrative drawing of a radio studio desk with screens, microphones, speakers and an equipment rack. Not the real studio.",
  illustrative: true,
};

/** Views shown in the explorer: real photographs if any exist, otherwise the illustrative layout. */
export function getStudioViews(photos: StudioView[] = studioPhotos): StudioView[] {
  return photos.length > 0 ? photos : [demoLayoutView];
}

/** Number of photographs the station has reported collecting. */
export const EXPECTED_PHOTO_COUNT = 10;
