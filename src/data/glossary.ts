import type { GlossaryTerm } from "@/types";

/**
 * Plain-English explanations of terms presenters meet in the studio.
 *
 * General broadcasting terms are written by the development team and are
 * marked `draft`. Myriad-specific terms are defined from the Myriad 6 help
 * pages read on 2026-11-26 (in the team's own words). Glossary terms carry no
 * review records, so they stay `draft`: that is not station verification.
 */
const GENERAL = "General broadcasting explanation written by the Radio Technics development team. Not taken from Myriad documentation.";
const MYRIAD_MANUAL = "Summarised by the development team from the Myriad 6 help pages (dashboard, playing media and log icons), read 2026-11-26. Not station-verified.";

export const glossary: GlossaryTerm[] = [
  {
    id: "playout",
    term: "Playout software",
    aliases: ["playout", "playout system"],
    definition: "Software that plays a station's songs, adverts and jingles in order. This station uses Myriad Playout 6.",
    status: "station-reported",
    source: "Station briefing (Myriad Playout 6), with a general explanation by the development team.",
    relatedEquipmentIds: ["myriad-playout"],
  },
  {
    id: "log",
    term: "Log",
    aliases: ["playlist", "running order", "schedule"],
    definition:
      "The running order of items lined up to play, shown as a list. In the station's photograph of the Myriad screen, a list of upcoming items appears with start times beside them.",
    status: "draft",
    source: `${GENERAL} Screen details are observations from the station's photograph.`,
    relatedEquipmentIds: ["myriad-playout"],
  },
  {
    id: "live-assist",
    term: "Live Assist",
    aliases: ["live assist mode", "live-assist"],
    definition:
      "In broadcasting generally, a way of running playout where a presenter in the studio controls when items play, rather than the software running everything on its own. The station reports that Myriad 6 runs in Live Assist mode. The Myriad 6 manual says that in this mode the presenter controls how items join, using stop chains and the Go button.",
    status: "draft",
    source: `${GENERAL} Station configuration reported by station staff. Myriad behaviour from the Myriad 6 help pages (dashboard, playing media), read 2026-11-26.`,
    relatedEquipmentIds: ["myriad-playout", "green-next-button"],
  },
  {
    id: "automation",
    term: "Automation",
    aliases: ["automatic", "auto mode", "running on auto"],
    definition: "In broadcasting generally, when playout software plays items one after another without a presenter starting each one.",
    status: "draft",
    source: GENERAL,
    relatedEquipmentIds: ["myriad-playout"],
  },
  {
    id: "stop-chain",
    term: "Stop chain",
    aliases: ["stop", "stop marker", "chain"],
    definition:
      "In Myriad, an item whose end type is Stop (a red square). It plays to its end and then Myriad waits for a manual action, usually pressing Go. The manual says stop chains are only available in Live Assist mode. Which items at this station use one is not confirmed.",
    status: "draft",
    source: MYRIAD_MANUAL,
    relatedEquipmentIds: ["myriad-playout"],
  },
  {
    id: "go-function",
    term: "Go (Myriad)",
    aliases: ["go", "go button", "play next"],
    definition:
      "In Myriad, the dashboard Go button starts the next log item by hand, and by default fades out what is playing. Go is also an end type (a green circle) where an item flows into the next on its own. Radio Technics does not assume the physical green button does the same thing as any on-screen control.",
    status: "draft",
    source: MYRIAD_MANUAL,
    relatedEquipmentIds: ["myriad-playout", "green-next-button"],
  },
  {
    id: "player",
    term: "Player",
    aliases: ["players", "player 1", "player 2", "player 3", "player 4"],
    definition:
      "In the station's photograph, the bottom of the Myriad screen shows four areas labelled Player 1 to Player 4, one of them showing the song that was playing. The Myriad 6 manual says each player shows the item's title, artist and timers, with play/pause, re-cue and eject controls and VU meters.",
    status: "draft",
    source: "Observation from the station's photograph of the Myriad screen, and the Myriad 6 help page on media players (read 2026-11-26).",
    relatedEquipmentIds: ["myriad-playout"],
  },
  {
    id: "fader",
    term: "Fader",
    aliases: ["faders", "slider", "sliders", "channel fader"],
    definition: "A sliding control on the mixing console that sets how loud one source is. Pushing it up makes that source louder.",
    status: "draft",
    source: GENERAL,
    relatedEquipmentIds: ["mixing-console"],
  },
  {
    id: "on-air",
    term: "On air / off air",
    aliases: ["on-air", "off air", "off-air", "live"],
    definition: "“On air” means the station's output is being broadcast. “Off air” means it isn't — listeners hear nothing, which is urgent.",
    status: "draft",
    source: GENERAL,
    relatedEquipmentIds: [],
  },
  {
    id: "dead-air",
    term: "Dead air",
    aliases: ["silence on air", "silent on air"],
    definition: "Unintended silence on the station's output. Treat possible dead air as urgent and contact technical support.",
    status: "draft",
    source: GENERAL,
    relatedEquipmentIds: [],
  },
  {
    id: "ppm",
    term: "PPM (peak programme meter)",
    aliases: ["ppm", "peak programme meter", "level meter", "meter"],
    definition: "A meter that shows how loud audio is. The station has a unit labelled Canford Dual PPM with two needles, A and B.",
    status: "draft",
    source: `${GENERAL} Unit label observed in the station's photograph.`,
    relatedEquipmentIds: ["audio-level-meters"],
  },
  {
    id: "monitoring",
    term: "Monitoring",
    aliases: ["monitor", "monitors", "foldback", "talkback"],
    definition: "Listening to what is happening — through headphones or the studio speakers — so presenters know what is going out.",
    status: "draft",
    source: GENERAL,
    relatedEquipmentIds: ["headphone-monitoring", "studio-monitor-speakers"],
  },
  {
    id: "hotspot",
    term: "Hotspot (Radio Technics)",
    aliases: ["hotspot", "highlight"],
    definition: "In this app, a highlighted area on a studio photograph that you can select to read about that piece of equipment.",
    status: "draft",
    source: "Describes Radio Technics itself.",
    relatedEquipmentIds: [],
  },
];

export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  return glossary.find((t) => t.id === id);
}
