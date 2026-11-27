/**
 * Presenter vocabulary for the local Knowledge Centre search (RT-003).
 *
 * Concepts are everyday phrasings ("it's stuck on the same song"). Intents
 * combine concepts and equipment into a likely meaning, with the articles,
 * troubleshooting topic and studio equipment that help. Phrases are matched
 * after the same normalisation as the troubleshooter (contractions expanded,
 * so "won't" is written "will not" here).
 */

export interface SearchConcept {
  id: string;
  phrases: string[];
}

export const searchConcepts: SearchConcept[] = [
  { id: "next-song", phrases: ["next song", "next track", "next item", "next one", "next record", "skip", "move on", "moving on", "go to the next", "advance"] },
  {
    id: "not-playing",
    phrases: ["will not play", "not playing", "does not play", "did not play", "will not start", "did not start", "not starting", "nothing started", "nothing is playing", "nothing playing"],
  },
  { id: "stuck", phrases: ["stuck", "same song", "same track", "frozen", "freeze", "froze", "looping", "keeps playing", "hung", "will not move"] },
  {
    id: "unresponsive",
    phrases: ["not doing anything", "nothing happens", "nothing happened", "not responding", "does not work", "did not work", "stopped working", "not working", "dead", "broken", "no response", "nothing when i press", "isnt working"],
  },
  {
    id: "no-audio",
    phrases: ["nothing coming out", "nothing is coming out", "no sound", "no audio", "silent", "silence", "gone quiet", "can not hear anything", "hear nothing", "can not hear it", "no music", "dead air", "off air"],
  },
  { id: "self-monitor", phrases: ["hear myself", "hear my voice", "hear me in", "my own voice"] },
  { id: "screen-odd", phrases: ["looks weird", "look weird", "gone weird", "weird", "strange", "odd", "glitch", "glitchy", "garbled", "looks different", "looks wrong", "funny"] },
  { id: "indicator", phrases: ["red square", "red box", "green square", "green box", "red light", "green light", "red bit", "colour", "color", "red", "flashing", "icon", "symbol", "square"] },
  { id: "meaning", phrases: ["what does", "what is", "what are", "what is that", "meaning", "mean", "explain", "what do"] },
  { id: "live-assist", phrases: ["live assist", "automatic", "automation", "auto mode", "on auto", "manual mode", "play mode"] },
  { id: "stop", phrases: ["stop chain", "stopped by itself", "it stopped", "stops after", "stopped after", "stop marker"] },
  { id: "go", phrases: ["go button", "go function", "press go", "hit go"] },
  { id: "now-playing", phrases: ["what is playing", "now playing", "currently playing", "playing right now", "what is on air", "what song is this"] },
  { id: "how-to", phrases: ["how do i", "how can i", "how to", "how would i", "how should i", "how does one"] },
  { id: "play-next", phrases: ["play the next", "play next", "start the next", "get to the next"] },
  { id: "log", phrases: ["the log", "in the log", "log item", "log items", "playlist"] },
  { id: "program-label", phrases: ["program 1", "program one", "programme 1", "programme one"] },
  { id: "cable", phrases: ["cable", "wire", "lead", "plug", "plugged", "unplugged", "disconnected"] },
];

export interface SearchIntent {
  id: string;
  /** Short plain-English description of this interpretation. */
  label: string;
  /** Alternative concept sets; the intent matches if every concept in any one set is present. */
  match: string[][];
  /** Concepts that rule this intent out (a more specific intent covers them). */
  exclude?: string[];
  /** Equipment the intent is about. With `requiresEquipment`, one of these must be mentioned or selected. */
  equipmentIds: string[];
  /** The equipment to show for this interpretation, when it differs from the first match. */
  focusEquipmentId?: string;
  requiresEquipment?: boolean;
  /** Most relevant first. */
  articleIds: string[];
  /** Troubleshooting topic to start (src/data/troubleshooting-flows.ts). */
  topicId?: string;
}

export const searchIntents: SearchIntent[] = [
  {
    id: "next-song-wont-play",
    label: "The next song won't play or Myriad is stuck on a song",
    match: [["next-song", "not-playing"], ["next-song", "unresponsive"], ["stuck"], ["next-song", "stuck"], ["not-playing"]],
    equipmentIds: ["myriad-playout", "green-next-button"],
    articleIds: ["ts-next-song-wont-play", "kb-myriad-next-item", "kb-myriad-playback-status", "kb-myriad-live-assist"],
    topicId: "topic-next-song",
  },
  {
    id: "green-button-not-working",
    label: "The green next-song button isn't working",
    match: [["unresponsive"], ["not-playing"], ["stuck"]],
    equipmentIds: ["green-next-button"],
    requiresEquipment: true,
    articleIds: ["guide-green-button", "kb-myriad-go-and-button", "ts-next-song-wont-play"],
    topicId: "topic-next-song",
  },
  {
    id: "myriad-unresponsive",
    label: "Myriad isn't responding or looks frozen",
    match: [["unresponsive"], ["stuck"], ["not-playing"]],
    equipmentIds: ["myriad-playout"],
    requiresEquipment: true,
    articleIds: ["kb-myriad-playback-status", "kb-myriad-screen", "ts-next-song-wont-play"],
    topicId: "topic-next-song",
  },
  {
    id: "silence-on-air",
    label: "Listeners may be hearing nothing (possible silence on air)",
    match: [["no-audio"]],
    exclude: ["self-monitor"],
    equipmentIds: ["audio-level-meters", "mixing-console"],
    articleIds: ["kb-audio-output", "ts-cant-hear-anything"],
    topicId: "topic-cant-hear",
  },
  {
    id: "no-sound-headphones",
    label: "Nothing is coming through your headphones",
    match: [["no-audio"]],
    exclude: ["self-monitor"],
    equipmentIds: ["headphone-monitoring"],
    articleIds: ["ts-cant-hear-anything", "kb-audio-output"],
    topicId: "topic-cant-hear",
  },
  {
    id: "no-sound-speakers",
    label: "Nothing is coming from the studio speakers",
    match: [["no-audio"]],
    exclude: ["self-monitor"],
    equipmentIds: ["studio-monitor-speakers"],
    articleIds: ["ts-cant-hear-anything", "kb-audio-output"],
    topicId: "topic-cant-hear",
  },
  {
    id: "cant-hear-myself",
    label: "You can't hear your own voice",
    match: [["self-monitor"]],
    equipmentIds: ["headphone-monitoring", "presenter-microphone"],
    articleIds: ["ts-microphone-not-heard", "ts-cant-hear-anything"],
    topicId: "topic-microphone",
  },
  {
    id: "microphone-problem",
    label: "A microphone isn't working",
    match: [["unresponsive"], ["no-audio"]],
    equipmentIds: ["presenter-microphone", "guest-microphones"],
    requiresEquipment: true,
    articleIds: ["ts-microphone-not-heard"],
    topicId: "topic-microphone",
  },
  {
    id: "myriad-screen-odd",
    label: "The Myriad screen looks different",
    match: [["screen-odd"]],
    // "the screen" names the studio computers, but the Myriad screen is just as likely.
    equipmentIds: ["myriad-playout", "studio-computers"],
    focusEquipmentId: "myriad-playout",
    articleIds: ["kb-myriad-screen", "kb-myriad-playback-status"],
  },
  {
    id: "computer-screen-odd",
    label: "A studio computer screen looks wrong",
    match: [["screen-odd"]],
    equipmentIds: ["studio-computers"],
    articleIds: ["guide-studio-overview", "kb-myriad-screen"],
  },
  {
    id: "play-next-song",
    label: "How to play the next song",
    match: [["how-to", "next-song"], ["play-next"]],
    exclude: ["not-playing", "unresponsive", "stuck", "no-audio"],
    equipmentIds: ["myriad-playout", "green-next-button"],
    focusEquipmentId: "myriad-playout",
    articleIds: ["kb-myriad-next-item", "kb-myriad-go-and-button", "guide-green-button"],
  },
  {
    id: "program-monitor-labels",
    label: "The meters labelled PROGRAM 1 and MONITOR",
    match: [["program-label"]],
    equipmentIds: ["audio-level-meters", "mixing-console"],
    focusEquipmentId: "audio-level-meters",
    articleIds: ["kb-audio-output"],
  },
  {
    id: "indicator-meaning",
    label: "What a colour or symbol on the Myriad screen means",
    match: [["indicator"], ["indicator", "meaning"], ["log", "meaning"]],
    equipmentIds: ["myriad-playout"],
    articleIds: ["kb-myriad-screen", "kb-myriad-playback-status"],
  },
  {
    id: "live-assist",
    label: "How Live Assist mode works",
    match: [["live-assist"]],
    equipmentIds: ["myriad-playout"],
    articleIds: ["kb-myriad-live-assist"],
  },
  {
    id: "stop-chain",
    label: "Playback stopped by itself",
    match: [["stop"]],
    equipmentIds: ["myriad-playout"],
    articleIds: ["kb-myriad-stop-chains", "ts-next-song-wont-play"],
    topicId: "topic-next-song",
  },
  {
    id: "go-function",
    label: "Myriad's Go function and the green button",
    match: [["go"]],
    equipmentIds: ["myriad-playout", "green-next-button"],
    articleIds: ["kb-myriad-go-and-button", "guide-green-button"],
  },
  {
    id: "now-playing",
    label: "Finding out what's playing",
    match: [["now-playing"]],
    equipmentIds: ["myriad-playout"],
    articleIds: ["kb-myriad-now-playing", "kb-myriad-screen"],
  },
  {
    id: "cable",
    label: "A cable looks unplugged",
    match: [["cable"]],
    equipmentIds: [],
    articleIds: ["help-cables"],
    topicId: "topic-cable",
  },
];
