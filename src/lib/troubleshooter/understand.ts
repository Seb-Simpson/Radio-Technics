/**
 * Structured understanding of a presenter's free-text reply.
 *
 * The RT-001 prototype matched loose phrase lists and took the first hit,
 * so "No, it is silent" matched the "it is" in the YES list. This layer
 * separates *what kind of reply* the text is (affirmation, negation,
 * uncertainty, a request for help, a question about a procedure) from the
 * *observations* it contains (silence, no sound, something not working).
 * The engine then combines both with the current question, and asks for
 * clarification when they conflict, instead of guessing.
 *
 * Pure and deterministic. A future AI interpreter should return the same
 * `Understanding` shape.
 */

export type Stance = "affirm" | "negate" | "uncertain" | "none";

export type Signal =
  /** The station/broadcast may be silent (stronger than "I can't hear"). */
  | "silence"
  /** The user can't hear something; location unknown. */
  | "no-sound"
  /** Something isn't working or responding. */
  | "not-working"
  /** The user doesn't know whether the station is on air. */
  | "on-air-unknown";

export interface Understanding {
  /** Original text, trimmed. Always preserved verbatim for the support summary. */
  text: string;
  /** Lower-case, punctuation-stripped, contractions expanded. */
  normalised: string;
  stance: Stance;
  /** Stance given tentatively ("I think so", "probably"). */
  hedged: boolean;
  signals: Signal[];
  /** Observations the user explicitly denied ("it's not silent"). */
  negatedSignals: Signal[];
  /** Explicit, unambiguous on-air silence ("dead air", "we're off air"). */
  clearAirSilence: boolean;
  /** The user is asking for a person / technical support. */
  helpRequest: boolean;
  /** The user is asking whether to perform an action (restart, unplug…). */
  procedureQuestion: boolean;
  isQuestion: boolean;
}

const NOT_CONTRACTIONS: Record<string, string> = {
  isnt: "is not",
  arent: "are not",
  wasnt: "was not",
  werent: "were not",
  dont: "do not",
  doesnt: "does not",
  didnt: "did not",
  hasnt: "has not",
  havent: "have not",
  hadnt: "had not",
  couldnt: "could not",
  shouldnt: "should not",
  wouldnt: "would not",
  mustnt: "must not",
  cant: "can not",
  cannot: "can not",
  wont: "will not",
  shant: "shall not",
};

const PRONOUN_CONTRACTIONS: [RegExp, string][] = [
  [/\b(it|that|there|what|who|here|nothing|everything|something)'s\b/g, "$1 is"],
  [/\b(we|you|they)'re\b/g, "$1 are"],
  [/\bi'm\b/g, "i am"],
  [/\b(i|you|we|they)'ve\b/g, "$1 have"],
  [/\b(i|you|we|they|it|he|she)'ll\b/g, "$1 will"],
  [/\b(i|you|we|they|it|he|she)'d\b/g, "$1 would"],
];

export function normaliseReply(text: string): string {
  let t = text.toLowerCase().replace(/[\u2018\u2019\u02bc`]/g, "'");
  for (const [pattern, replacement] of PRONOUN_CONTRACTIONS) t = t.replace(pattern, replacement);
  t = t.replace(/'/g, "").replace(/[^a-z0-9 ,.;!?]+/g, " ");
  t = t.replace(/[a-z]+/g, (word) => NOT_CONTRACTIONS[word] ?? (word === "im" ? "i am" : word));
  return t.replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return text.replace(/[,.;!?]/g, " ").split(" ").filter(Boolean);
}

const NEGATORS = new Set(["not", "no", "never", "without", "nothing"]);

/**
 * Finds `phrase` as whole words. When `respectNegation` is set, an
 * occurrence immediately preceded (within two words) by a negator is
 * ignored — so "it is not silent" doesn't count as silence.
 */
export function hasPhrase(text: string, phrase: string, respectNegation = false): boolean {
  const tokens = words(text);
  const target = words(phrase);
  if (target.length === 0) return false;
  for (let i = 0; i + target.length <= tokens.length; i++) {
    if (target.every((w, j) => tokens[i + j] === w)) {
      if (!respectNegation) return true;
      const before = tokens.slice(Math.max(0, i - 2), i);
      // A phrase that itself starts with a negator ("no sound") is not negated by the word before it.
      if (NEGATORS.has(target[0]!) || !before.some((w) => NEGATORS.has(w))) return true;
    }
  }
  return false;
}

function hasAny(text: string, phrases: readonly string[], respectNegation = false): boolean {
  return phrases.some((p) => hasPhrase(text, p, respectNegation));
}

const AFFIRM_LEADS = ["yes", "yeah", "yep", "yup", "yea", "aye", "correct", "right", "sure", "definitely", "absolutely", "affirmative", "ok yes", "that is right", "that is it", "that is the one"];
const NEGATE_LEADS = ["no", "nope", "nah", "negative", "not really", "not at all", "wrong"];
/** Whole-clause short answers to "Is it…/Does it…/Can you…" questions. */
const AFFIRM_SHORT = ["it is", "it does", "it did", "it was", "they are", "they do", "they did", "i can", "i do", "i did", "i have", "there is", "it has", "yes it is", "yes it does"];
const NEGATE_SHORT = ["it is not", "it does not", "it did not", "it was not", "they are not", "they do not", "they did not", "i can not", "i do not", "i did not", "i have not", "there is not", "it has not", "not that one"];
const UNCERTAIN = ["not sure", "unsure", "do not know", "dont know", "no idea", "dunno", "can not tell", "not certain", "cannot tell", "maybe", "perhaps", "possibly", "hard to say", "i do not remember", "can not remember"];
const HEDGES = ["i think so", "i think", "probably", "i guess", "i believe", "i reckon", "seems like it", "looks like it"];

const CLEAR_AIR_SILENCE = [
  "dead air",
  "off air",
  "off the air",
  "nothing is going out",
  "nothing going out",
  "nothing on air",
  "nothing is on air",
  "silent on air",
  "silence on air",
  "station is silent",
  "station is off",
  "nothing playing on air",
  "nothing is playing on air",
  "nothing is being broadcast",
];
const SILENCE = ["silent", "silence", "gone quiet", "nothing is playing", "nothing playing", "nothing is coming out", "no music", "music stopped", "song stopped", "playing nothing"];
const NO_SOUND = ["no sound", "no audio", "can not hear", "hear nothing", "nothing coming out", "nothing is coming out", "no noise", "hear anything"];
const NOT_WORKING = ["not working", "not doing anything", "nothing happens", "nothing happened", "nothing is happening", "not responding", "does not work", "did not work", "will not work", "stopped working", "broken", "is dead", "gone weird", "not right", "frozen", "stuck"];
const ON_AIR = ["on air", "on the air", "broadcasting", "going out", "live"];

const HELP_REQUEST = [
  "technical support",
  "tech support",
  "support",
  "speak to someone",
  "speak to somebody",
  "speak to a person",
  "speak to a human",
  "talk to someone",
  "talk to somebody",
  "talk to a person",
  "talk to a human",
  "a real person",
  "engineer",
  "technician",
  "get help",
  "need help",
  "want help",
  "help me",
  "call someone",
  "phone someone",
  "ring someone",
  "contact someone",
  "escalate",
];

const PROCEDURE_VERBS = ["restart", "reboot", "reset", "turn it off", "turn off", "turn on", "switch off", "switch on", "switch it off", "unplug", "plug", "power", "press", "replace", "reconnect", "disconnect", "pull out", "hold down"];
const QUESTION_LEADS = ["should", "shall", "can", "could", "do", "does", "must", "is it ok", "is it okay", "would it", "how do", "how can", "what if", "am i allowed"];

function firstClause(normalised: string): string {
  return normalised.split(/[,;.!?]| but | although | though /)[0]!.trim();
}

function detectStance(normalised: string): { stance: Stance; hedged: boolean } {
  const clause = firstClause(normalised);
  const firstWords = words(clause);
  const lead = firstWords[0] ?? "";

  if (hasAny(clause, UNCERTAIN)) {
    // "No idea" / "I don't know" are uncertainty, not negation.
    return { stance: "uncertain", hedged: false };
  }
  const hedged = hasAny(normalised, HEDGES);

  if (NEGATE_SHORT.includes(clause) || NEGATE_LEADS.some((p) => clause === p || clause.startsWith(`${p} `))) {
    return { stance: "negate", hedged };
  }
  if (AFFIRM_SHORT.includes(clause) || AFFIRM_LEADS.some((p) => clause === p || clause.startsWith(`${p} `))) {
    return { stance: "affirm", hedged };
  }
  if (hedged && (clause === "i think so" || clause === "probably" || clause === "i believe so")) {
    return { stance: "affirm", hedged: true };
  }
  if (lead === "not" && firstWords.length <= 3) return { stance: "negate", hedged };
  // Anywhere in the reply, uncertainty about whether we are on air is still uncertainty.
  if (hasAny(normalised, UNCERTAIN)) return { stance: "uncertain", hedged: false };
  return { stance: "none", hedged };
}

export function understand(rawText: string): Understanding {
  const text = rawText.trim();
  const normalised = normaliseReply(text);
  const { stance, hedged } = detectStance(normalised);

  const signals: Signal[] = [];
  const clearAirSilence = hasAny(normalised, CLEAR_AIR_SILENCE, true);
  if (clearAirSilence || hasAny(normalised, SILENCE, true)) signals.push("silence");
  if (hasAny(normalised, NO_SOUND, true)) signals.push("no-sound");
  if (hasAny(normalised, NOT_WORKING, true)) signals.push("not-working");
  if (hasAny(normalised, UNCERTAIN) && hasAny(normalised, ON_AIR)) signals.push("on-air-unknown");

  const negatedSignals: Signal[] = [];
  const deniedOnly = (phrases: readonly string[]) => hasAny(normalised, phrases) && !hasAny(normalised, phrases, true);
  if (!signals.includes("silence") && deniedOnly([...SILENCE, ...CLEAR_AIR_SILENCE])) negatedSignals.push("silence");
  if (!signals.includes("no-sound") && deniedOnly(NO_SOUND)) negatedSignals.push("no-sound");

  const tokens = words(normalised);
  const isQuestion = /\?\s*$/.test(text) || QUESTION_LEADS.some((lead) => normalised.startsWith(`${lead} `));
  const procedureQuestion = isQuestion && hasAny(normalised, PROCEDURE_VERBS);
  // "I don't need help" / "no support needed" are not requests.
  const helpRequest = hasAny(normalised, HELP_REQUEST, true) && !hasPhrase(normalised, "do not need") && !hasPhrase(normalised, "no need");

  return {
    text,
    normalised,
    stance: tokens.length === 0 ? "none" : stance,
    hedged,
    signals,
    negatedSignals,
    clearAirSilence,
    helpRequest,
    procedureQuestion,
    isQuestion,
  };
}

/** True when the stance points one way and the observations the other. */
export function isContradictory(u: Understanding): boolean {
  return u.stance === "affirm" && (u.signals.includes("silence") || u.signals.includes("no-sound"));
}
