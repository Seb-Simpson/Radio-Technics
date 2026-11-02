import type { EquipmentCategory, EquipmentRecord } from "@/types";

/**
 * Equipment records.
 *
 * RULES FOR EDITING THIS FILE
 * - Do not add model numbers, cable routing, settings or procedures unless the
 *   station engineer has confirmed them. Record anything unconfirmed under
 *   `requiresVerification` instead.
 * - `station-reported` = told to us by station staff, not yet engineer-confirmed.
 * - `draft` = general description written by the development team.
 */

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
      { text: "The studio has one main broadcast mixing console.", status: "station-reported" },
      {
        text: "Which sliders (faders) control which sources has not been documented yet.",
        status: "draft",
      },
    ],
    commonProblems: [
      "A slider is up but nothing can be heard",
      "Something is too loud or too quiet",
      "Not sure which slider controls which source",
    ],
    requiresVerification: [
      "Make and model of the console",
      "Which channel/fader is assigned to each source (presenter mic, guest mics, Myriad, other inputs)",
      "Whether any controls should never be changed by presenters",
    ],
    aliases: ["mixing console", "mixer", "mixing desk", "desk", "console", "faders", "fader", "sliders", "slider", "board"],
    relatedArticleIds: ["guide-studio-overview", "ts-cant-hear-anything"],
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
      { text: "The studio has presenter and guest microphones.", status: "station-reported" },
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
      { text: "The studio has presenter and guest microphones.", status: "station-reported" },
      { text: "The number of guest microphones has not been confirmed.", status: "draft" },
    ],
    commonProblems: [
      "A guest can't be heard",
      "Not sure which microphone a guest should use",
      "A guest microphone sounds crackly, quiet or distorted",
    ],
    requiresVerification: [
      "How many guest microphones there are",
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
    primaryFunction: { text: "Plays the station's songs and other audio.", status: "station-reported" },
    confirmationPhrase: "playout software on the studio computer",
    knownInformation: [
      { text: "The station uses Myriad radio playout software.", status: "station-reported" },
      {
        text: "The green physical button advances Myriad to the next song.",
        status: "station-reported",
      },
    ],
    commonProblems: [
      "The next song won't play",
      "The Myriad screen looks frozen",
      "Unsure what the Myriad screen is showing",
    ],
    requiresVerification: [
      "Which version of Myriad is installed",
      "Which computer and screen Myriad runs on",
      "Which playout modes the station uses (for example automatic or manual)",
      "Whether presenters can also advance to the next song from the Myriad screen",
    ],
    aliases: ["myriad", "playout", "playout software", "playlist", "next song", "next track", "song", "songs", "track", "music"],
    relatedArticleIds: ["ts-next-song-wont-play", "guide-green-button"],
    flowEntryNodeId: "my-start",
  },
  {
    id: "green-next-button",
    name: "Green Myriad button",
    shortName: "green button",
    category: "playout",
    description: "A standalone green physical button in the studio.",
    primaryFunction: { text: "Advances Myriad to the next song.", status: "station-reported" },
    confirmationPhrase: "that advances Myriad to the next song",
    knownInformation: [
      { text: "Pressing the green button advances Myriad to the next song.", status: "station-reported" },
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
      "What the button does in each Myriad playout mode",
      "What happens if the button is pressed more than once",
      "Whether there is any indicator that shows the button press was received",
    ],
    aliases: ["green button", "green thing", "green", "next button", "big button", "button", "next song", "next track"],
    relatedArticleIds: ["guide-green-button", "ts-next-song-wont-play"],
    flowEntryNodeId: "gb-screen",
  },
  {
    id: "zoom-camera",
    name: "Zoom video camera",
    shortName: "video camera",
    category: "video",
    description: "A Zoom video camera in the studio.",
    primaryFunction: { text: "Records or streams video from the studio.", status: "draft" },
    confirmationPhrase: "used for video in the studio",
    knownInformation: [{ text: "The studio has a Zoom video camera.", status: "station-reported" }],
    commonProblems: ["The camera doesn't seem to be on", "The picture isn't showing where expected"],
    requiresVerification: [
      "Whether 'Zoom' refers to the camera's manufacturer or to Zoom video calls",
      "Make and model of the camera",
      "What the camera is used for (recording, streaming, video calls)",
      "Which computer or device it is connected to",
    ],
    aliases: ["zoom camera", "video camera", "camera", "webcam", "zoom", "video"],
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
    knownInformation: [{ text: "The studio has headphone monitoring equipment.", status: "station-reported" }],
    commonProblems: [
      "Nothing can be heard in the headphones",
      "Only some sounds can be heard",
      "Headphones are too loud or too quiet",
    ],
    requiresVerification: [
      "How many headphone outputs there are and where they are",
      "Which control sets each headphone's volume",
      "Whether there is a separate headphone amplifier",
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
    knownInformation: [{ text: "The studio has monitor speakers.", status: "station-reported" }],
    commonProblems: ["No sound from the speakers", "Speakers are too loud or too quiet"],
    requiresVerification: [
      "Make and model of the speakers",
      "Whether the speakers mute automatically when a microphone is live",
      "Which control sets the speaker volume",
    ],
    aliases: ["studio monitor speakers", "monitor speakers", "studio speakers", "speakers", "speaker", "loudspeakers", "monitors", "monitor"],
    relatedArticleIds: ["ts-cant-hear-anything"],
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
    knownInformation: [{ text: "The studio has audio level meters.", status: "station-reported" }],
    commonProblems: ["Meters don't move", "Meters show red or appear to hit the top"],
    requiresVerification: [
      "Which audio each meter shows (for example on-air output, microphone, Myriad)",
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
    description: "A cabinet of technical equipment. Its contents have not been documented yet.",
    primaryFunction: { text: "Houses technical equipment used by the studio.", status: "draft" },
    confirmationPhrase: "the cabinet of technical equipment",
    knownInformation: [{ text: "The studio has a technical equipment rack.", status: "station-reported" }],
    commonProblems: ["Lights on the rack look different from usual", "Something in the rack is making a noise"],
    requiresVerification: [
      "What equipment is installed in the rack",
      "Whether presenters should ever touch anything in the rack",
      "What normal indicator lights look like",
    ],
    aliases: ["technical equipment rack", "equipment rack", "rack", "cabinet", "tech rack"],
    relatedArticleIds: ["help-cables"],
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
      { text: "The studio has associated computer equipment.", status: "station-reported" },
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
