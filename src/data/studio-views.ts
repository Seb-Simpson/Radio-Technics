import type { StudioView } from "@/types";

/**
 * Real studio photographs, supplied by the station.
 *
 * Imported with scripts/import-photo.mjs, which removes all metadata
 * (including any location data). The logged-in user's name on the Myriad
 * screen has been blurred. To add another photograph, see README.md →
 * "Adding studio photographs".
 */
const photo = (id: string, title: string, description: string, alt: string, width = 1200, height = 1600): StudioView => ({
  id,
  title,
  description,
  kind: "photo",
  src: `/studio/photos/${id}.jpg`,
  width,
  height,
  alt,
  illustrative: false,
});

export const studioPhotos: StudioView[] = [
  photo("mixing-console", "Mixing console", "The main mixing console, with its meters and clock along the top.", "Mixing console with eight faders, ON and OFF buttons, and meter and clock displays along the top"),
  photo("myriad-screen", "Myriad screen", "The Myriad playout screen, with the top of the mixing console below it. A user name in the title bar has been blurred.", "Computer screen showing Myriad playout, with the top of the mixing console in front of it"),
  photo("microphone", "Microphone", "A microphone with a MIX 92.6 windshield, with the Myriad screen behind it.", "Microphone in a shock mount with a black MIX 92.6 foam windshield; a computer screen is behind it"),
  photo("green-button", "Green button", "The standalone green button on the desk.", "Black box with a large green push button, on a grey desk mat"),
  photo("fader-panel", "Eight-fader panel", "A second panel of eight faders. How it relates to the main console is not yet confirmed.", "Panel of eight faders with small displays and lit OFF buttons"),
  photo("level-meters", "Level meters", "A wooden-cased unit with two needle meters, A and B.", "Grey meter unit with two black needle meters labelled A and B and red peak lights above them"),
  photo("monitor-speaker", "Monitor speaker", "A monitor speaker mounted high in the corner of the studio.", "Small black loudspeaker on a wall bracket in the corner of a grey felt-lined room"),
  photo("monitor-speaker-booth", "Monitor speaker (wider view)", "A wider view of a wall-mounted monitor speaker. It may be the same speaker as the previous photo — not confirmed.", "View up into a corner showing a small black loudspeaker on a wall bracket"),
  photo("webcam", "Video camera", "The camera used for Zoom video calls, on a small stand.", "Silver and black webcam on a short stand, with microphone arms behind it"),
  photo("equipment-rack", "Equipment rack", "The technical equipment rack. Presenters shouldn't need to touch it.", "Rack of technical equipment with status lights and a row of fourteen numbered switches with green lights", 1600, 1200),
];

/**
 * Illustrative layout used ONLY when no real photographs are available. It
 * does not depict the real studio and its positions must not be relied on.
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
