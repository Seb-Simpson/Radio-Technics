import type { FlowNode, TroubleshootingTopic } from "@/lib/troubleshooter/types";

/**
 * Scripted troubleshooting flows for the RT-001 prototype.
 *
 * SAFETY RULES
 * - Questions gather information only. No node may prescribe a technical fix
 *   unless the station engineer has verified it.
 * - Every question node needs `unsureNext`. Every path ends in an outcome
 *   that offers technical support — no dead ends.
 * - Ask one thing at a time, in plain English.
 */

/*
 * Typed replies are understood by src/lib/troubleshooter/understand.ts.
 * Options declare their meaning: `answer` (what "yes"/"no" means for this
 * exact question) and `audio` (whether the option asserts that sound is
 * present or absent). A typed reply is only mapped to an option that is
 * consistent with both the user's stance and what they observed.
 */

export const flowNodes: FlowNode[] = [
  /* ---------------- Green button ---------------- */
  {
    id: "gb-screen",
    kind: "question",
    prompt: "What happened on the Myriad screen after you pressed the green button?",
    showEquipmentId: "myriad-playout",
    options: [
      { id: "nothing", label: "Nothing changed", next: "gb-current-song", match: ["nothing", "nothing happened"] },
      { id: "unexpected", label: "Something unexpected happened", next: "gb-unexpected", match: ["unexpected", "something else"] },
      { id: "cant-see", label: "I can't see the Myriad screen", next: "gb-find-screen", match: ["can't see", "cant see", "where is myriad"] },
    ],
    unsureNext: "gb-find-screen",
  },
  {
    id: "gb-current-song",
    kind: "question",
    broadcastCheck: true,
    prompt: "Is the song that was already playing still playing?",
    showEquipmentId: "myriad-playout",
    options: [
      { id: "yes", label: "Yes, it's still playing", next: "outcome-report", answer: "yes", audio: "present", restate: "the song is still playing" },
      { id: "no-silent", label: "No — there's silence", next: "outcome-urgent", answer: "no", audio: "absent", match: ["stopped"], restate: "the song has stopped and there's silence" },
    ],
    unsureNext: "hear-on-air",
  },
  {
    id: "gb-unexpected",
    kind: "question",
    prompt: "Which of these is closest to what happened?",
    showEquipmentId: "myriad-playout",
    options: [
      { id: "skipped", label: "It skipped more than one song", next: "outcome-report", match: ["skipped"] },
      { id: "different", label: "A different song started from the one I expected", next: "outcome-report", match: ["different song", "wrong song"] },
      { id: "other", label: "Something else", next: "outcome-report", match: ["something else", "other"] },
    ],
    unsureNext: "outcome-report",
  },
  {
    id: "gb-find-screen",
    kind: "question",
    prompt: "Myriad is software, so it appears on one of the studio computer screens. Can you find the screen showing Myriad?",
    help: "Choose “Show me where” to see where it is in the Studio Explorer.",
    showEquipmentId: "myriad-playout",
    options: [
      { id: "found", label: "Yes, I've found it", next: "gb-screen", answer: "yes", match: ["found it"], asserts: { subject: "found", value: true }, restate: "you've found the Myriad screen" },
      { id: "not-found", label: "No, I can't find it", next: "outcome-report", answer: "no", match: ["can't find"], asserts: { subject: "found", value: false }, restate: "you can't find the Myriad screen" },
    ],
    unsureNext: "outcome-report",
  },

  /* ---------------- Myriad ---------------- */
  {
    id: "my-start",
    kind: "question",
    prompt: "What are you seeing on the Myriad screen?",
    showEquipmentId: "myriad-playout",
    options: [
      { id: "listed", label: "The next song is listed but won't start", next: "my-how-start", match: ["won't start", "wont start", "listed"] },
      { id: "frozen", label: "The screen looks frozen or isn't responding", next: "outcome-report", match: ["frozen", "stuck", "not responding"] },
      { id: "other", label: "Something else", next: "outcome-report", match: ["something else", "other"] },
    ],
    unsureNext: "gb-find-screen",
  },
  {
    id: "my-how-start",
    kind: "question",
    prompt: "How were you trying to start the next song?",
    showEquipmentId: "myriad-playout",
    options: [
      { id: "green", label: "With the green button", next: "gb-screen", setEquipmentId: "green-next-button", match: ["green", "button"] },
      { id: "screen", label: "On the Myriad screen", next: "outcome-report", match: ["screen", "mouse", "clicked"] },
    ],
    unsureNext: "outcome-report",
  },

  /* ---------------- Microphones ---------------- */
  {
    id: "mic-problem",
    kind: "question",
    prompt: "What's the problem with the {equipment}?",
    options: [
      { id: "not-heard", label: "Other people can't hear it", next: "mic-meters", match: ["can't hear me", "cant hear me", "no one can hear", "listeners"] },
      { id: "not-in-headphones", label: "I can't hear it in my headphones", next: "mic-headphones", match: ["headphones"] },
      { id: "sounds-wrong", label: "It sounds wrong (crackly, quiet or distorted)", next: "mic-since", match: ["crackly", "quiet", "distorted", "sounds wrong", "crackling"] },
    ],
    unsureNext: "mic-meters",
  },
  {
    id: "mic-meters",
    kind: "question",
    prompt: "When someone speaks into the microphone, do the level meters move?",
    help: "Level meters are the bars or lights that bounce up and down when there is sound.",
    showEquipmentId: "audio-level-meters",
    options: [
      { id: "move", label: "Yes, they move", asserts: { subject: "movement", value: true }, restate: "the level meters are moving", next: "mic-since", answer: "yes", match: ["they move", "moving"] },
      { id: "still", label: "No, they don't move", asserts: { subject: "movement", value: false }, restate: "the level meters aren't moving", next: "mic-since", answer: "no", match: ["don't move", "not moving"] },
    ],
    unsureNext: "mic-since",
  },
  {
    id: "mic-headphones",
    kind: "question",
    prompt: "Can you hear other sounds in your headphones, such as music playing?",
    showEquipmentId: "headphone-monitoring",
    options: [
      { id: "yes", label: "Yes, I can hear other sounds", next: "mic-since", answer: "yes", audio: "present", restate: "you can hear other sounds in your headphones" },
      { id: "no", label: "No, I can't hear anything", next: "mic-since", answer: "no", audio: "absent", restate: "you can't hear anything in your headphones" },
    ],
    unsureNext: "mic-since",
  },
  {
    id: "mic-since",
    kind: "question",
    prompt: "Was this microphone working earlier today?",
    options: [
      { id: "yes", label: "Yes, it was working earlier", asserts: { subject: "worked-earlier", value: true }, restate: "it was working earlier today", next: "outcome-report", answer: "yes", match: ["working earlier", "was working"] },
      { id: "no", label: "No, it hasn't worked today", asserts: { subject: "worked-earlier", value: false }, restate: "it hasn't worked today", next: "outcome-report", answer: "no", match: ["not worked", "hasn't worked"] },
    ],
    unsureNext: "outcome-report",
  },

  /* ---------------- "I can't hear anything" ---------------- */
  {
    id: "hear-where",
    kind: "question",
    prompt: "Where are you trying to hear the sound?",
    options: [
      { id: "headphones", label: "In my headphones", next: "hear-headphones", setEquipmentId: "headphone-monitoring", match: ["headphones", "headphone"] },
      { id: "speakers", label: "Through the studio speakers", next: "hear-speakers", setEquipmentId: "studio-monitor-speakers", match: ["speakers", "speaker"] },
      { id: "listeners", label: "Listeners say they can't hear the station", next: "hear-on-air", match: ["listeners", "on air", "radio"] },
    ],
    unsureNext: "hear-meters",
  },
  {
    id: "hear-headphones",
    kind: "question",
    prompt: "Is anything at all coming through your headphones?",
    showEquipmentId: "headphone-monitoring",
    options: [
      { id: "nothing", label: "Nothing at all", next: "hear-meters", answer: "no", audio: "absent", match: ["nothing at all"], restate: "nothing at all is coming through" },
      { id: "some", label: "Some sounds, but not everything", next: "hear-meters", audio: "present", match: ["some", "some sounds"], restate: "some sounds are coming through, but not everything" },
    ],
    unsureNext: "hear-meters",
  },
  {
    id: "hear-speakers",
    kind: "question",
    prompt: "Is anything at all coming through the studio speakers?",
    showEquipmentId: "studio-monitor-speakers",
    options: [
      { id: "nothing", label: "Nothing at all", next: "hear-meters", answer: "no", audio: "absent", match: ["nothing at all"], restate: "nothing at all is coming through" },
      { id: "some", label: "Some sounds, but not everything", next: "hear-meters", audio: "present", match: ["some", "some sounds"], restate: "some sounds are coming through, but not everything" },
    ],
    unsureNext: "hear-meters",
  },
  {
    id: "hear-on-air",
    kind: "question",
    broadcastCheck: true,
    prompt: "Do you think the station might be silent on air right now?",
    options: [
      { id: "yes", label: "Yes, it might be silent", next: "outcome-urgent", answer: "yes", audio: "absent", restate: "the station might be silent on air right now" },
      { id: "no", label: "No, there is sound but something is missing", next: "hear-meters", answer: "no", audio: "present", match: ["something is missing"], restate: "there is sound on air, but something is missing" },
      // RT-002D-R1: say whether it's what listeners hear or only local monitoring.
      { id: "studio-only", label: "No, it's only in the studio (headphones or speakers)", next: "hear-where", restate: "the problem is only in the studio, not what listeners hear" },
    ],
    unsureNext: "outcome-urgent",
  },
  {
    id: "hear-meters",
    kind: "question",
    prompt: "While audio should be playing, do the level meters move?",
    help: "Level meters are the bars or lights that bounce up and down when there is sound.",
    showEquipmentId: "audio-level-meters",
    options: [
      { id: "move", label: "Yes, they move", asserts: { subject: "movement", value: true }, restate: "the level meters are moving", next: "outcome-report", answer: "yes", match: ["they move", "moving"] },
      { id: "still", label: "No, they don't move", asserts: { subject: "movement", value: false }, restate: "the level meters aren't moving", next: "outcome-report", answer: "no", match: ["don't move", "not moving"] },
    ],
    unsureNext: "outcome-report",
  },

  /* ---------------- Cables ---------------- */
  {
    id: "cable-where",
    kind: "question",
    prompt: "Thanks for spotting that. Which equipment is the cable near?",
    help: "The station hasn't confirmed how its equipment should be connected, so please don't plug in or move cables you're unsure about — especially while on air.",
    options: [
      { id: "console", label: "The mixing console", next: "outcome-cable", setEquipmentId: "mixing-console", match: ["console", "mixer", "desk"] },
      { id: "computer", label: "A studio computer", next: "outcome-cable", setEquipmentId: "studio-computers", match: ["computer", "pc", "screen"] },
      { id: "rack", label: "The equipment rack", next: "outcome-cable", setEquipmentId: "equipment-rack", match: ["rack", "cabinet"] },
      { id: "other", label: "Somewhere else", next: "outcome-cable", match: ["somewhere else", "other", "elsewhere"] },
    ],
    unsureNext: "outcome-cable",
  },

  /* ---------------- Generic equipment ---------------- */
  {
    id: "generic-symptom",
    kind: "question",
    prompt: "What's happening with the {equipment}?",
    options: [
      { id: "nothing", label: "It isn't doing anything", next: "generic-since", match: ["nothing", "not doing anything", "dead"] },
      { id: "unexpected", label: "It's doing something unexpected", next: "generic-since", match: ["unexpected", "weird", "strange"] },
      { id: "error", label: "It's showing an error or making a strange noise", next: "generic-since", match: ["error", "noise", "beeping"] },
    ],
    unsureNext: "generic-since",
  },
  {
    id: "generic-since",
    kind: "question",
    prompt: "Was the {equipment} working normally earlier today?",
    options: [
      { id: "yes", label: "Yes, it was working earlier", asserts: { subject: "worked-earlier", value: true }, restate: "it was working earlier today", next: "outcome-report", answer: "yes", match: ["working earlier", "was working"] },
      { id: "no", label: "No, it hasn't worked today", asserts: { subject: "worked-earlier", value: false }, restate: "it hasn't worked today", next: "outcome-report", answer: "no", match: ["not worked", "hasn't worked"] },
    ],
    unsureNext: "outcome-report",
  },

  /* ---------------- Outcomes ---------------- */
  {
    id: "outcome-report",
    kind: "outcome",
    prompt:
      "Thanks — that's everything I can check for now. The station hasn't yet provided a verified procedure for this problem, so I won't guess at a fix. Please contact technical support and pass on the summary below.",
    options: [],
  },
  {
    id: "outcome-urgent",
    kind: "outcome",
    urgent: true,
    prompt:
      "Possible silence on air needs attention straight away. Contact technical support now and tell them the station may be silent. If the station has its own emergency procedure, follow it. Please don't restart equipment or press controls you're unsure about \u2014 Radio Technics has no engineer-approved recovery steps yet, and technical-support contact details have not been configured in the app.",
    options: [],
  },
  {
    id: "outcome-cable",
    kind: "outcome",
    prompt:
      "Please report the cable to technical support using the summary below. Don't reconnect it unless an engineer has told you how.",
    options: [],
  },
];

export const troubleshootingTopics: TroubleshootingTopic[] = [
  {
    id: "topic-microphone",
    label: "My microphone isn't working",
    description: "Nobody can hear you, or it sounds wrong.",
    utterance: "My microphone isn't working",
  },
  {
    id: "topic-next-song",
    label: "The next song won't play",
    description: "Myriad or the green button isn't moving on.",
    utterance: "The next song won't play",
  },
  {
    id: "topic-cant-hear",
    label: "I can't hear anything",
    description: "Nothing in headphones or speakers.",
    utterance: "I can't hear anything",
  },
  {
    id: "topic-not-responding",
    label: "Something isn't responding",
    description: "Not sure what's wrong? Start here.",
    utterance: "It's not doing anything",
  },
  {
    id: "topic-cable",
    label: "A cable looks unplugged",
    description: "A wire or lead looks disconnected.",
    utterance: "A wire isn't plugged in",
  },
];
