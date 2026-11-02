import type { GlossaryTerm } from "@/types";

/**
 * Plain-English explanations of terms presenters meet in the studio.
 *
 * General broadcasting terms are written by the development team and are
 * marked `draft`. Myriad-specific terms are NOT defined from memory: until the
 * official Myriad 6 documentation has been read, they say so.
 */
const GENERAL = "General broadcasting explanation written by the Radio Technics development team. Not taken from Myriad documentation.";
const PENDING_MYRIAD =
  "Myriad term. Its exact meaning will be summarised from the official Myriad 6 documentation once that has been read; until then Radio Technics does not describe how it works.";

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
      "In broadcasting generally, a way of running playout where a presenter in the studio controls when items play, rather than the software running everything on its own. The station reports that Myriad 6 runs in Live Assist mode. Exactly how Myriad behaves in this mode will be summarised from the official documentation once it has been read.",
    status: "draft",
    source: `${GENERAL} Station configuration reported by station staff.`,
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
    definition: PENDING_MYRIAD,
    status: "draft",
    source: "Listed in the RT-003 brief as a Myriad topic. Official Myriad 6 documentation not yet read.",
    relatedEquipmentIds: ["myriad-playout"],
  },
  {
    id: "go-function",
    term: "Go (Myriad)",
    aliases: ["go", "go button", "play next"],
    definition: `${PENDING_MYRIAD} Radio Technics does not assume the physical green button does the same thing as any on-screen control.`,
    status: "draft",
    source: "Listed in the RT-003 brief as a Myriad topic. Official Myriad 6 documentation not yet read.",
    relatedEquipmentIds: ["myriad-playout", "green-next-button"],
  },
  {
    id: "player",
    term: "Player",
    aliases: ["players", "player 1", "player 2", "player 3", "player 4"],
    definition:
      "In the station's photograph, the bottom of the Myriad screen shows four areas labelled Player 1 to Player 4, one of them showing the song that was playing. What each player does will be summarised from the official documentation once it has been read.",
    status: "draft",
    source: "Observation from the station's photograph of the Myriad screen.",
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
