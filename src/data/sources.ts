import type { SourceReference } from "@/types";

/**
 * Shared source references for Knowledge Centre articles.
 *
 * Manufacturer sources are listed with `retrievedOn: null` until someone has
 * actually read them. In RT-003 the development environment could not reach
 * broadcastradio.com, so the official Myriad 6 pages below have NOT been
 * read or summarised yet. Nothing in Radio Technics is marked
 * "manufacturer-documented" until they are.
 */
const NOT_YET_READ =
  "Listed for review. Not yet read or summarised: the RT-003 development environment could not reach broadcastradio.com. No content in Radio Technics is taken from this page yet.";

export const SOURCES = {
  myriadSupport: {
    id: "myriad-6-support",
    title: "Myriad 6 Playout support",
    url: "https://www.broadcastradio.com/myriad-6-playout-support",
    publisher: "Broadcast Radio (manufacturer of Myriad)",
    kind: "manufacturer",
    retrievedOn: null,
    note: NOT_YET_READ,
  },
  myriadDashboard: {
    id: "myriad-6-dashboard",
    title: "Understanding the Dashboard in Myriad Playout 6",
    url: "https://help.broadcastradio.com/support/solutions/articles/101000549663-understanding-the-dashboard-in-myriad-playout-6",
    publisher: "Broadcast Radio (manufacturer of Myriad)",
    kind: "manufacturer",
    retrievedOn: null,
    note: NOT_YET_READ,
  },
  myriadPlaying: {
    id: "myriad-6-playing-media",
    title: "Playing Media Items in Myriad Playout 6",
    url: "https://help.broadcastradio.com/support/solutions/articles/101000549648-playing-media-items-in-myriad-playout-6",
    publisher: "Broadcast Radio (manufacturer of Myriad)",
    kind: "manufacturer",
    retrievedOn: null,
    note: NOT_YET_READ,
  },
  stationBriefing: {
    id: "station-briefing",
    title: "Station briefings to the development team (RT-001 to RT-003)",
    publisher: "Mix 92.6 station staff",
    kind: "station",
    retrievedOn: "2026-11-02",
    note: "Includes: single studio; Myriad Playout 6 in Live Assist mode; the green button advances Myriad to the next song; the camera is used for Zoom calls.",
  },
  photoMyriadScreen: {
    id: "photo-myriad-screen",
    title: "Station photograph: Myriad screen",
    url: "/studio/photos/myriad-screen.jpg",
    publisher: "Mix 92.6 station staff",
    kind: "photograph",
    retrievedOn: "2026-11-02",
    note: "Observations only: what is visible in one photograph, not how the software behaves.",
  },
  photoConsole: {
    id: "photo-mixing-console",
    title: "Station photograph: mixing console",
    url: "/studio/photos/mixing-console.jpg",
    publisher: "Mix 92.6 station staff",
    kind: "photograph",
    retrievedOn: "2026-11-02",
    note: "Observations only.",
  },
  photoGreenButton: {
    id: "photo-green-button",
    title: "Station photograph: green button",
    url: "/studio/photos/green-button.jpg",
    publisher: "Mix 92.6 station staff",
    kind: "photograph",
    retrievedOn: "2026-11-02",
    note: "Observations only.",
  },
  developmentTeam: {
    id: "development-team",
    title: "Radio Technics development team",
    publisher: "Radio Technics",
    kind: "development-team",
    retrievedOn: "2026-11-02",
    note: "General explanations written for presenters. Not station procedure and not manufacturer documentation.",
  },
} satisfies Record<string, SourceReference>;
