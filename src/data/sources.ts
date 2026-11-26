import type { SourceReference } from "@/types";

/**
 * Shared source references for Knowledge Centre articles.
 *
 * Manufacturer sources carry `retrievedOn` only once someone has actually read
 * the page (null = not read). The Myriad 6 help pages below were read on
 * 2026-11-26; Radio Technics summarises them in its own words and does not
 * copy them. Reading a page never authorises a repair or recovery procedure.
 */
const READ = "2026-11-26";
const BR = "Broadcast Radio";
const HELP = "https://help.broadcastradio.com/support/solutions/articles";

export const SOURCES = {
  myriadSupport: {
    id: "myriad-6-support",
    title: "Myriad 6 Playout support",
    url: "https://www.broadcastradio.com/myriad-6-playout-support",
    publisher: BR,
    kind: "manufacturer",
    product: "Myriad 6",
    retrievedOn: READ,
    note: "Read 2026-11-26. Landing page that points to documentation, videos, downloads and the help portal; it explains nothing about operating Myriad itself.",
  },
  myriadDashboard: {
    id: "myriad-6-dashboard",
    title: "Understanding the Dashboard in Myriad Playout 6",
    url: `${HELP}/101000549663-understanding-the-dashboard-in-myriad-playout-6`,
    publisher: BR,
    kind: "manufacturer",
    product: "Myriad 6",
    retrievedOn: READ,
    note: "Read 2026-11-26 (page modified 11 Apr 2025). Covers the dashboard, Go button, chain types, quick actions and playout modes.",
  },
  myriadPlaying: {
    id: "myriad-6-playing-media",
    title: "Playing Media Items in Myriad Playout 6",
    url: `${HELP}/101000549648-playing-media-items-in-myriad-playout-6`,
    publisher: BR,
    kind: "manufacturer",
    product: "Myriad 6",
    retrievedOn: READ,
    note: "Read 2026-11-26 (page modified 11 Apr 2025). Covers ways of playing items, Live Assist cueing and Go/Stop end types.",
  },
  myriadLogIcons: {
    id: "myriad-6-log-icons",
    title: "Myriad Playout & Myriad Anywhere Pro Log Icons",
    url: `${HELP}/101000534883-myriad-playout-myriad-anywhere-pro-log-icons`,
    publisher: BR,
    kind: "manufacturer",
    product: "Myriad 6",
    retrievedOn: READ,
    note: "Read 2026-11-26 (page modified 24 Sep 2024). Lists log item types, chain types, item status, playout modes and dashboard controls; the icon images themselves are not described in the text.",
  },
  myriadItemTypes: {
    id: "myriad-6-item-types",
    title: "Understanding Media Item Types and Display in Myriad",
    url: `${HELP}/101000549542-understanding-media-item-types-and-display-in-myriad`,
    publisher: BR,
    kind: "manufacturer",
    product: "Myriad 6",
    retrievedOn: READ,
    note: "Read 2026-11-26 (page modified 11 Apr 2025). Describes media item types and what a media tile shows.",
  },
  myriadPlayers: {
    id: "myriad-6-media-players",
    title: "Using Media Players in Myriad Playout 6",
    url: `${HELP}/101000549652-using-media-players-in-myriad-playout-6`,
    publisher: BR,
    kind: "manufacturer",
    product: "Myriad 6",
    retrievedOn: READ,
    note: "Read 2026-11-26 (page modified 11 Apr 2025). Describes the player display, timers and VU meters.",
  },
  myriadEndings: {
    id: "myriad-6-endings-sweepers",
    title: "Understanding Media Item Types, Endings, and Sweepers in Myriad Playout 6",
    url: `${HELP}/101000549606-understanding-media-item-types-endings-and-sweepers-in-myriad-playout-6`,
    publisher: BR,
    kind: "manufacturer",
    product: "Myriad 6",
    retrievedOn: READ,
    note: "Read 2026-11-26 (page modified 11 Apr 2025). Describes item types, ending types and the sweeper setting.",
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
