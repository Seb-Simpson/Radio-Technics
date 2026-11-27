import type { EquipmentCategory, EquipmentRecord } from "@/types";

/**
 * Equipment records.
 *
 * RULES FOR EDITING THIS FILE
 * - Do not add model numbers, cable routing, settings or procedures unless the
 *   station engineer has confirmed them. Record anything unconfirmed under
 *   `requiresVerification` instead.
 * - `station-reported` = told to us by station staff, not yet engineer-confirmed.
 * - `draft` = general description written by the development team, or a
 *   detail read from a station photograph (with `source`). Visible labels
 *   are recorded as observations, not as confirmed facts.
 */

/** Provenance for details read from the station's photographs. */
const PHOTO = (name: string) => `Visible in the station's "${name}" photograph`;
const STATION = "Reported by station staff";

export const equipmentCategories: EquipmentCategory[] = [
  {
    id: "mixing",
    name: "Mixing & levels",
    description: "The broadcast mixing console and the meters that show sound levels.",
  },
  {
    id: "microphones",
    name: "Microphones",
    description: "Presenter and guest microphones.",
  },
  {
    id: "playout",
    name: "Playout",
    description: "Myriad playout software, the green next-song button and studio computers.",
  },
  {
    id: "monitoring",
    name: "Listening",
    description: "Headphones and studio speakers used to hear what is happening.",
  },
  {
    id: "video",
    name: "Video",
    description: "The Zoom video camera.",
  },
  {
    id: "technical",
    name: "Technical",
    description: "The equipment rack. Usually only engineers need to touch this.",
  },
];

export const equipment: EquipmentRecord[] = [
  {
    id: "mixing-console",
    name: "Main broadcast mixing console",
    shortName: "mixing console",
    category: "mixing",
    description:
      "The large desk of sliders, knobs and buttons in front of the presenter. It is the main broadcast mixing console for the studio.",
    primaryFunction: {
      text: "Combines and controls the studio's sound sources, such as microphones and playout, before they go on air.",
      status: "draft",
    },
    confirmationPhrase: "with the sliders and buttons in front of you",
    knownInformation: [
      { text: "The studio has one main broadcast mixing console.", status: "station-reported", source: STATION },
      { text: "The console is labelled Axia iQ.", status: "draft", source: PHOTO("Mixing console") },
      {
        text: "Channel displays read Guest 1, Guest 2, Guest 3, Myriad A 1, Myriad A 2, Myriad A 3 and Myriad A 4.",
        status: "draft",
        source: PHOTO("Mixing console"),
      },
      {
        text: "A label on the console reads \u201cPlease leave all Myriad faders up at end of show\u201d.",
        status: "draft",
        source: PHOTO("Mixing console"),
      },
      {
        text: "A separate panel of eight faders has displays reading LLMic1/DI, LLMic2, Ext In 1, PC/Phone2, CD1, CD2, Studio B and Sustain.",
        status: "draft",
        source: PHOTO("Eight-fader panel"),
      },
      {
        text: "Which sliders (faders) control which sources has not been confirmed by the engineer.",
        status: "draft",
      },
    ],
    commonProblems: [
      "A slider is up but nothing can be heard",
      "Something is too loud or too quiet",
      "Not sure which slider controls which source",
    ],
    requiresVerification: [
      "Confirm the console model (the photograph shows an Axia iQ label)",
      "Which channel/fader is assigned to each source (presenter mic, guest mics, Myriad, other inputs)",
      "What the \u201cPlease leave all Myriad faders up at end of show\u201d label means for presenters during a show",
      "How the separate eight-fader panel relates to the main console, and what its channels are for",
      "Whether any controls should never be changed by presenters",
    ],
    aliases: ["mixing console", "mixer", "mixing desk", "desk", "console", "faders", "fader", "sliders", "slider", "board"],
    relatedArticleIds: ["guide-studio-overview", "ts-cant-hear-anything", "kb-axia-iq-console"],
    flowEntryNodeId: "generic-symptom",
  },
  {
    id: "presenter-microphone",
    name: "Presenter microphone",
    shortName: "presenter microphone",
    category: "microphones",
    description: "The microphone used by the main presenter.",
    primaryFunction: { text: "Picks up the presenter's voice.", status: "draft" },
    confirmationPhrase: "used by the main presenter",
    knownInformation: [
      { text: "The studio has presenter and guest microphones.", status: "station-reported", source: STATION },
      {
        text: "A microphone with a MIX 92.6 foam windshield is mounted in a shock mount on an arm. Which microphone is the presenter's has not been confirmed.",
        status: "draft",
        source: PHOTO("Microphone"),
      },
    ],
    commonProblems: [
      "Listeners or other people can't hear the presenter",
      "The presenter can't hear themselves in their headphones",
      "The microphone sounds crackly, quiet or distorted",
    ],
    requiresVerification: [
      "Make and model of the microphone",
      "Which console channel it is connected to",
      "Whether it needs a separate on/off or mute control",
    ],
    aliases: ["presenter microphone", "presenter mic", "microphone", "mic", "mike", "mics", "microphones"],
    relatedArticleIds: ["ts-microphone-not-heard"],
    flowEntryNodeId: "mic-problem",
  },
  {
    id: "guest-microphones",
    name: "Guest microphones",
    shortName: "guest microphone",
    category: "microphones",
    description: "Microphones used by guests in the studio.",
    primaryFunction: { text: "Pick up guests' voices.", status: "draft" },
    confirmationPhrase: "used by studio guests",
    knownInformation: [
      { text: "The studio has presenter and guest microphones.", status: "station-reported", source: STATION },
      {
        text: "The console has channels labelled Guest 1, Guest 2 and Guest 3, which suggests three guest microphones. Not confirmed.",
        status: "draft",
        source: PHOTO("Mixing console"),
      },
      { text: "Microphone arms in the photographs carry numbered markers (1, 2 and 3).", status: "draft", source: PHOTO("Microphone") },
    ],
    commonProblems: [
      "A guest can't be heard",
      "Not sure which microphone a guest should use",
      "A guest microphone sounds crackly, quiet or distorted",
    ],
    requiresVerification: [
      "How many guest microphones there are (the console shows Guest 1–3)",
      "Which numbered microphone arm belongs to which console channel",
      "Make and model of each guest microphone",
      "Which console channels they are connected to",
    ],
    aliases: ["guest microphone", "guest microphones", "guest mic", "guest mics", "microphone", "mic", "mike", "mics", "microphones"],
    relatedArticleIds: ["ts-microphone-not-heard"],
    flowEntryNodeId: "mic-problem",
  },
  {
    id: "myriad-playout",
    name: "Myriad playout software",
    shortName: "Myriad",
    category: "playout",
    description:
      "Myriad is the radio playout software the station uses. It appears on a studio computer screen.",
    primaryFunction: { text: "Plays the station's songs and other audio.", status: "station-reported", source: STATION },
    confirmationPhrase: "playout software on the studio computer",
    knownInformation: [
      { text: "The station uses Myriad radio playout software.", status: "station-reported", source: STATION },
      {
        text: "The green physical button advances Myriad to the next song.",
        status: "station-reported",
        source: STATION,
      },
      { text: "The station uses Myriad 6 in live-assist mode.", status: "station-reported", source: STATION },
      { text: "The window title reads Myriad Playout v6 by Broadcast Radio.", status: "draft", source: PHOTO("Myriad screen") },
      {
        text: "The screen shows four players (Player 1\u20134) and play-mode buttons labelled Standby, Live and AutoFade.",
        status: "draft",
        source: PHOTO("Myriad screen"),
      },
    ],
    commonProblems: [
      "The next song won't play",
      "The Myriad screen looks frozen",
      "Unsure what the Myriad screen is showing",
    ],
    requiresVerification: [
      "Confirm the installed version (station reports Myriad 6; the screen shows Myriad Playout v6)",
      "Which computer and screen Myriad runs on",
      "What live-assist mode means for presenters at this station, and whether the other play modes on screen (Standby, AutoFade) are ever used",
      "Whether presenters can also advance to the next song from the Myriad screen",
    ],
    aliases: ["myriad", "playout", "playout software", "playlist", "next song", "next track", "song", "songs", "track", "music"],
    relatedArticleIds: ["ts-next-song-wont-play", "guide-green-button", "kb-myriad-next-item", "kb-myriad-live-assist", "kb-myriad-screen", "kb-myriad-stop-chains"],
    flowEntryNodeId: "my-start",
  },
  {
    id: "green-next-button",
    name: "Green Myriad button",
    shortName: "green button",
    category: "playout",
    description: "A standalone green physical button in the studio.",
    primaryFunction: { text: "Advances Myriad to the next song.", status: "station-reported", source: STATION },
    confirmationPhrase: "that advances Myriad to the next song",
    knownInformation: [
      { text: "Pressing the green button advances Myriad to the next song.", status: "station-reported", source: STATION },
      { text: "Myriad runs in live-assist mode (station reported). How the button behaves in other modes is unknown.", status: "station-reported", source: STATION },
      {
        text: "It is a black box with a large green push button and a small hole above it that may be an indicator light.",
        status: "draft",
        source: PHOTO("Green button"),
      },
      {
        text: "How the button is wired and how it behaves in every Myriad playout mode is not yet known.",
        status: "draft",
      },
    ],
    commonProblems: [
      "The button appears unresponsive",
      "The next song does not play",
      "Something unexpected happens after pressing it",
    ],
    requiresVerification: [
      "How the button is connected to Myriad (wiring and trigger mechanism)",
      "What the button does in live-assist mode in detail, and whether it behaves differently in any other mode",
      "What happens if the button is pressed more than once",
      "Whether the small hole above the button is an indicator light, and what it shows",
    ],
    aliases: ["green button", "green thing", "green", "next button", "big button", "button", "next song", "next track"],
    relatedArticleIds: ["guide-green-button", "ts-next-song-wont-play", "kb-myriad-next-item"],
    flowEntryNodeId: "gb-screen",
  },
  {
    id: "zoom-camera",
    name: "Zoom call camera",
    shortName: "Zoom camera",
    category: "video",
    description: "A webcam on a small stand on the desk. The station uses it for Zoom video calls.",
    primaryFunction: { text: "Used for Zoom video calls.", status: "station-reported", source: STATION },
    confirmationPhrase: "used for Zoom video calls",
    knownInformation: [
      { text: "The camera is used for Zoom video calls.", status: "station-reported", source: STATION },
      { text: "A label on the camera reads \u201cHD 1080P WEBCAM\u201d and \u201cX1\u201d.", status: "draft", source: PHOTO("Video camera") },
      { text: "The manufacturer and model have not been confirmed.", status: "draft" },
    ],
    commonProblems: [
      "People on the Zoom call can't see the studio",
      "The camera doesn't seem to be on",
      "The picture is pointing the wrong way",
    ],
    requiresVerification: [
      "Which computer the camera is connected to",
      "Who sets up Zoom calls, and on which computer",
      "Whether presenters may adjust the camera's position",
    ],
    aliases: ["zoom call camera", "zoom camera", "video camera", "webcam", "camera", "zoom call", "zoom", "video"],
    relatedArticleIds: ["guide-zoom-camera"],
    flowEntryNodeId: "generic-symptom",
  },
  {
    id: "headphone-monitoring",
    name: "Headphone monitoring",
    shortName: "headphones",
    category: "monitoring",
    description: "Headphones and associated equipment that let presenters and guests hear the studio output.",
    primaryFunction: { text: "Lets presenters and guests hear themselves and the station output.", status: "draft" },
    confirmationPhrase: "you wear to hear the studio",
    knownInformation: [
      { text: "The studio has headphone monitoring equipment.", status: "station-reported", source: STATION },
      { text: "The console has a knob labelled HEADPHONES and a control labelled GUEST HPH.", status: "draft", source: PHOTO("Mixing console") },
      { text: "A switch on the rack's power panel is labelled H/P AMP, which suggests a headphone amplifier.", status: "draft", source: PHOTO("Equipment rack") },
    ],
    commonProblems: [
      "Nothing can be heard in the headphones",
      "Only some sounds can be heard",
      "Headphones are too loud or too quiet",
    ],
    requiresVerification: [
      "How many headphone outputs there are and where they are",
      "Which control sets each headphone's volume",
      "Whether there is a separate headphone amplifier (the rack has a switch labelled H/P AMP)",
      "What the GUEST HPH control on the console does",
    ],
    aliases: ["headphone monitoring", "headphones", "headphone", "headset", "cans", "earphones"],
    relatedArticleIds: ["ts-cant-hear-anything"],
    flowEntryNodeId: "hear-headphones",
  },
  {
    id: "studio-monitor-speakers",
    name: "Studio monitor speakers",
    shortName: "studio speakers",
    category: "monitoring",
    description: "The loudspeakers in the studio used to listen to audio.",
    primaryFunction: { text: "Play studio audio out loud in the room.", status: "draft" },
    confirmationPhrase: "that play sound out loud in the room",
    knownInformation: [
      { text: "The studio has monitor speakers.", status: "station-reported", source: STATION },
      { text: "Wall-mounted speakers are labelled MS16 Monitor Speaker, with a Behringer logo.", status: "draft", source: PHOTO("Monitor speaker") },
      { text: "The rack's power panel has switches labelled MON SPKR LEFT and MON SPKR RIGHT.", status: "draft", source: PHOTO("Equipment rack") },
      { text: "The console has a knob labelled MONITORS.", status: "draft", source: PHOTO("Mixing console") },
    ],
    commonProblems: ["No sound from the speakers", "Speakers are too loud or too quiet"],
    requiresVerification: [
      "Confirm the speaker model (photos show Behringer MS16) and how many there are",
      "Whether the speakers mute automatically when a microphone is live",
      "Which control sets the speaker volume",
    ],
    aliases: ["studio monitor speakers", "monitor speakers", "studio speakers", "speakers", "speaker", "loudspeakers", "monitors", "monitor"],
    relatedArticleIds: ["ts-cant-hear-anything", "kb-behringer-ms16"],
    flowEntryNodeId: "hear-speakers",
  },
  {
    id: "audio-level-meters",
    name: "Audio level meters",
    shortName: "level meters",
    category: "mixing",
    description:
      "Meters that show how loud the audio is. They usually appear as bars or lights that move when there is sound.",
    primaryFunction: { text: "Show whether sound is present and how loud it is.", status: "draft" },
    confirmationPhrase: "that bounce when there is sound",
    knownInformation: [
      { text: "The studio has audio level meters.", status: "station-reported", source: STATION },
      { text: "A separate unit labelled Canford Dual PPM has two needle meters, A and B, with peak lights.", status: "draft", source: PHOTO("Level meters") },
      { text: "The console has meter displays labelled PROGRAM 1 and MONITOR.", status: "draft", source: PHOTO("Mixing console") },
    ],
    commonProblems: ["Meters don't move", "Meters show red or appear to hit the top"],
    requiresVerification: [
      "Which audio each meter shows (Canford meters A and B; console PROGRAM 1 and MONITOR)",
      "What level presenters should aim for",
    ],
    aliases: ["audio level meters", "level meters", "meters", "meter", "levels", "vu", "bars"],
    relatedArticleIds: ["ts-microphone-not-heard", "ts-cant-hear-anything"],
    flowEntryNodeId: "generic-symptom",
  },
  {
    id: "equipment-rack",
    name: "Technical equipment rack",
    shortName: "equipment rack",
    category: "technical",
    description: "A cabinet of technical equipment. The station has not yet documented what each unit does.",
    primaryFunction: { text: "Houses technical equipment used by the studio.", status: "draft" },
    confirmationPhrase: "the cabinet of technical equipment",
    knownInformation: [
      { text: "The studio has a technical equipment rack.", status: "station-reported", source: STATION },
      {
        text: "Units are labelled Axia QOR.16 Integrated Console Engine and X-NODE 2 (The Telos Alliance).",
        status: "draft",
        source: PHOTO("Equipment rack"),
      },
      {
        text: "A panel of 14 numbered switches has labels including DESK PSU, CD 1, CD 2, MYRIAD MONITOR, PRESENTER MONITOR, MIC LIVE, KVM 4 WAY, MON SPKR LEFT, MON SPKR RIGHT, MINI DISK, GUEST MONITOR and H/P AMP.",
        status: "draft",
        source: PHOTO("Equipment rack"),
      },
    ],
    commonProblems: ["Lights on the rack look different from usual", "Something in the rack is making a noise"],
    requiresVerification: [
      "Confirm what each unit in the rack does",
      "Whether presenters should ever use the switches on the power panel",
      "A sticker on the rack shows a phone number \u2014 is it the right number for presenters to call? (Not shown in the app until confirmed.)",
      "Whether presenters should ever touch anything in the rack",
      "What normal indicator lights look like",
    ],
    aliases: ["technical equipment rack", "equipment rack", "rack", "cabinet", "tech rack"],
    relatedArticleIds: ["help-cables", "kb-axia-qor16", "kb-telos-xnode2"],
    flowEntryNodeId: "generic-symptom",
  },
  {
    id: "studio-computers",
    name: "Studio computer equipment",
    shortName: "studio computer",
    category: "playout",
    description: "The computers, screens, keyboards and mice used in the studio.",
    primaryFunction: { text: "Run studio software, including Myriad.", status: "draft" },
    confirmationPhrase: "with the screen, keyboard and mouse",
    knownInformation: [
      { text: "The studio has associated computer equipment.", status: "station-reported", source: STATION },
      { text: "A label below a screen reads \u201cPlease do not switch off screens\u201d.", status: "draft", source: PHOTO("Myriad screen") },
    ],
    commonProblems: ["A screen is blank", "The keyboard or mouse isn't responding", "The computer seems frozen"],
    requiresVerification: [
      "How many computers there are and what each is used for",
      "Which computer runs Myriad",
      "Whether presenters may restart any computer, and how",
    ],
    aliases: ["studio computer", "computers", "computer", "pc", "screen", "screens", "keyboard", "mouse", "monitor", "monitors"],
    relatedArticleIds: ["guide-studio-overview"],
    flowEntryNodeId: "generic-symptom",
  },
];
