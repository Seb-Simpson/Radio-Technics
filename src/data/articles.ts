import type { KnowledgeArticle } from "@/types";

/**
 * Knowledge Centre articles.
 *
 * No article is engineer-verified yet. Articles describe what is known, what
 * questions to ask, and what to tell technical support — they do NOT contain
 * repair procedures. A section may only be marked `verified` once the station
 * engineer has reviewed it, and the article's `lastReviewed` must then be set.
 */
export const articles: KnowledgeArticle[] = [
  {
    id: "guide-studio-overview",
    title: "Studio equipment overview",
    type: "equipment-guide",
    summary: "A plain-English introduction to the equipment identified in the studio so far.",
    equipmentIds: [
      "mixing-console",
      "presenter-microphone",
      "guest-microphones",
      "myriad-playout",
      "green-next-button",
      "zoom-camera",
      "headphone-monitoring",
      "studio-monitor-speakers",
      "audio-level-meters",
      "equipment-rack",
      "studio-computers",
    ],
    status: "station-reported",
    lastReviewed: null,
    keywords: ["overview", "introduction", "studio", "equipment", "what is"],
    sections: [
      {
        heading: "What's in the studio",
        status: "station-reported",
        body: [
          "The station has one studio. Equipment identified so far: the main broadcast mixing console, presenter and guest microphones, Myriad playout software, a standalone green button that advances Myriad to the next song, a Zoom video camera, headphone monitoring, studio monitor speakers, audio level meters, a technical equipment rack and the studio computers.",
        ],
      },
      {
        heading: "What we don't know yet",
        status: "draft",
        body: [
          "Make and model numbers, how equipment is connected, and the station's own operating procedures have not been documented. Until the station engineer confirms these details, Radio Technics will not give step-by-step repair instructions.",
        ],
      },
    ],
  },
  {
    id: "guide-green-button",
    title: "The green Myriad button",
    type: "equipment-guide",
    summary: "What the standalone green button does, and what is still to be confirmed.",
    equipmentIds: ["green-next-button", "myriad-playout"],
    status: "station-reported",
    lastReviewed: null,
    keywords: ["green", "button", "next", "song", "track", "skip", "advance", "myriad"],
    sections: [
      {
        heading: "What it does",
        status: "station-reported",
        body: ["Pressing the green button advances Myriad to the next song."],
      },
      {
        heading: "Awaiting engineer confirmation",
        status: "draft",
        body: [
          "How the button is connected to Myriad.",
          "Whether it behaves the same in every Myriad playout mode.",
          "What happens if it is pressed more than once.",
        ],
      },
    ],
  },
  {
    id: "guide-zoom-camera",
    title: "The Zoom video camera",
    type: "equipment-guide",
    summary: "What is known about the studio's video camera.",
    equipmentIds: ["zoom-camera"],
    status: "draft",
    lastReviewed: null,
    keywords: ["camera", "video", "zoom", "stream", "recording"],
    sections: [
      {
        heading: "What we know",
        status: "station-reported",
        body: ["The studio has a Zoom video camera."],
      },
      {
        heading: "Awaiting engineer confirmation",
        status: "draft",
        body: [
          "Whether “Zoom” is the camera's manufacturer or refers to Zoom video calls.",
          "What the camera is used for, and which device it connects to.",
        ],
      },
    ],
  },
  {
    id: "ts-microphone-not-heard",
    title: "Microphone can't be heard",
    type: "troubleshooting",
    summary: "Questions to work through when a presenter or guest microphone isn't working.",
    equipmentIds: ["presenter-microphone", "guest-microphones", "audio-level-meters", "headphone-monitoring"],
    status: "draft",
    lastReviewed: null,
    keywords: ["microphone", "mic", "can't hear", "voice", "silent", "quiet", "guest", "presenter"],
    sections: [
      {
        heading: "Questions the troubleshooter will ask",
        status: "draft",
        body: [
          "Which microphone is it — presenter or guest?",
          "Is the problem that other people can't hear it, that you can't hear it in your headphones, or that it sounds wrong?",
          "Do the level meters move when someone speaks into it?",
          "Was it working earlier today?",
        ],
      },
      {
        heading: "Verified fix",
        status: "draft",
        body: [
          "No verified procedure yet. The station engineer needs to confirm which console channel each microphone uses before any steps can be added here.",
        ],
      },
    ],
  },
  {
    id: "ts-next-song-wont-play",
    title: "The next song won't play",
    type: "troubleshooting",
    summary: "Information to gather when Myriad doesn't move on to the next song.",
    equipmentIds: ["myriad-playout", "green-next-button"],
    status: "draft",
    lastReviewed: null,
    keywords: ["next song", "track", "myriad", "green button", "won't play", "stuck", "playout"],
    sections: [
      {
        heading: "Questions the troubleshooter will ask",
        status: "draft",
        body: [
          "Were you using the green button or the Myriad screen?",
          "What happened on the Myriad screen?",
          "Is the current song still playing, or is there silence?",
        ],
      },
      {
        heading: "If there is silence on air",
        status: "draft",
        body: ["Contact technical support straight away and follow any emergency procedure the station has in place."],
      },
      {
        heading: "Verified fix",
        status: "draft",
        body: ["No verified procedure yet. Awaiting confirmation of how Myriad is configured at the station."],
      },
    ],
  },
  {
    id: "ts-cant-hear-anything",
    title: "I can't hear anything",
    type: "troubleshooting",
    summary: "Narrowing down where sound is missing — headphones, speakers or on air.",
    equipmentIds: ["headphone-monitoring", "studio-monitor-speakers", "audio-level-meters", "mixing-console"],
    status: "draft",
    lastReviewed: null,
    keywords: ["can't hear", "no sound", "silent", "silence", "headphones", "speakers", "audio"],
    sections: [
      {
        heading: "Questions the troubleshooter will ask",
        status: "draft",
        body: [
          "Where are you trying to hear the sound — headphones, studio speakers, or are listeners reporting a problem?",
          "Is anything at all coming through?",
          "Do the level meters move while audio should be playing?",
        ],
      },
      {
        heading: "Awaiting engineer confirmation",
        status: "draft",
        body: [
          "Whether the studio speakers mute automatically while a microphone is live.",
          "Which meters show the on-air output.",
        ],
      },
    ],
  },
  {
    id: "help-cables",
    title: "Cables that look unplugged",
    type: "help-topic",
    summary: "What to do if you notice a cable that looks disconnected.",
    equipmentIds: ["equipment-rack", "mixing-console", "studio-computers"],
    status: "draft",
    lastReviewed: null,
    keywords: ["cable", "wire", "lead", "plug", "unplugged", "disconnected", "black wire"],
    sections: [
      {
        heading: "General caution",
        status: "draft",
        body: [
          "The station hasn't documented how its equipment is connected. Please don't plug in, unplug or move cables you're unsure about, especially while on air.",
          "Report the cable to technical support, describing what it is near.",
        ],
      },
    ],
  },
  {
    id: "help-technical-support",
    title: "Getting technical support",
    type: "help-topic",
    summary: "How to ask for help, and what information to give.",
    equipmentIds: [],
    status: "draft",
    lastReviewed: null,
    keywords: ["support", "help", "engineer", "contact", "call", "emergency"],
    sections: [
      {
        heading: "Who to contact",
        status: "draft",
        body: ["The station has not yet provided technical-support contact details. These will be added once confirmed."],
      },
      {
        heading: "What to tell them",
        status: "draft",
        body: [
          "Which equipment is affected, what you expected to happen, what actually happened, and whether the station is on air.",
          "The troubleshooter produces a summary of your answers that you can read out or copy.",
        ],
      },
    ],
  },
];
