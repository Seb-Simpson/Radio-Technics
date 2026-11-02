/**
 * Structured understanding of a presenter's free-text message.
 *
 * RT-QA-002 showed that reading only the first clause is unsafe:
 * "Yes, no, sorry it is not playing" was taken as "yes", and a leading
 * "No" was matched to an answer that asserted the opposite of what the
 * user then described. This module therefore:
 *
 *   1. splits the message into clauses and detects self-corrections
 *      ("sorry", "actually", "I mean"…) — the corrected part wins;
 *   2. reads the yes/no stance from every clause, and reports a conflict
 *      when the message says both without correcting itself;
 *   3. extracts observations about sound as claims (present / absent),
 *      handling negation ("not playing", "not silent") independently of
 *      any leading "yes" or "no";
 *   4. classifies safety-relevant content (clear off-air silence, possible
 *      silence) and requests for a person or about procedures.
 *
 * The engine combines this with the meaning of each answer to the current
 * question. It never chooses an answer that contradicts the user's
 * observations; it asks instead. Pure and deterministic. A future AI
 * interpreter should return the same `Understanding` shape.
 */

export type Stance = "affirm" | "negate" | "uncertain" | "conflict" | "none";

/** What the message says about whether sound / playback is present. */
export type AudioClaim = "present" | "absent";

export type Signal =
  /** Playback or the broadcast may be silent. */
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
  /** Lower-case, punctuation-light, contractions expanded. */
  normalised: string;
  clauses: string[];
  /** The effective yes/no stance after any self-correction. */
  stance: Stance;
  /** True when the message corrects itself ("…sorry, it is not playing"). */
  corrected: boolean;
  /** Stance given tentatively ("I think so", "probably"). */
  hedged: boolean;
  /** Effective claim about sound/playback, or null if none (or contradictory). */
  audio: AudioClaim | null;
  /** The message asserts both that there is and isn't sound, without correcting itself. */
  audioConflict: boolean;
  signals: Signal[];
  /** Observations the user explicitly denied ("it's not silent"). */
  negatedSignals: Signal[];
  /** Explicit, unambiguous on-air silence ("we're off air", "dead air"). */
  clearAirSilence: boolean;
  /** The user is asking for a person or technical support. */
  helpRequest: boolean;
  /** The user is asking whether to perform an action (restart, unplug…). */
  procedureQuestion: boolean;
  isQuestion: boolean;
  /**
   * RT-QA-002B: what the message says about the station being off air.
   * `confirmed` — stated as fact ("we're off air"); `possible` — asked, hedged,
   * uncertain or partly corrected ("are we off air?", "we might be off air").
   * Questions, hypotheticals and denials are never `confirmed`.
   */
  offAir: "confirmed" | "possible" | null;
  /** Off air was only mentioned hypothetically ("what if we go off air?"). */
  hypotheticalOffAir: boolean;
  /** Effective clauses stated as fact (not questions, hypotheticals or strong uncertainty). Used to match answers. */
  assertive: string;
  /** A statement with a subject that denies something ("it wasn't working", "they don't move"). */
  negatedPredicate: boolean;
}

/** How a clause is put: only `assertive` clauses can record facts. */
export type Modality = "assertive" | "hedged" | "uncertain" | "question" | "hypothetical" | "negated-belief";

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

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
  aint: "is not",
};

const PRONOUN_CONTRACTIONS: [RegExp, string][] = [
  [/\b(it|that|there|what|who|here|nothing|everything|something|someone|somebody)'s\b/g, "$1 is"],
  [/\b(we|you|they)'re\b/g, "$1 are"],
  [/\bi'm\b/g, "i am"],
  [/\b(i|you|we|they)'ve\b/g, "$1 have"],
  [/\b(i|you|we|they|it|he|she)'ll\b/g, "$1 will"],
  [/\b(i|you|we|they|it|he|she)'d\b/g, "$1 would"],
];

export function normaliseReply(text: string): string {
  let t = text.toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/[–—]/g, ",").replace(/\s-+\s/g, ", ");
  for (const [pattern, replacement] of PRONOUN_CONTRACTIONS) t = t.replace(pattern, replacement);
  t = t.replace(/'/g, "").replace(/[^a-z0-9 ,.;!?]+/g, " ");
  t = t.replace(/[a-z]+/g, (word) => NOT_CONTRACTIONS[word] ?? (word === "im" ? "i am" : word));
  return t.replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return text.replace(/[,.;!?]/g, " ").split(" ").filter(Boolean);
}

const NEGATORS = new Set(["not", "never", "no"]);

/**
 * Finds `phrase` as whole words. When `respectNegation` is set, an
 * occurrence preceded (within two words) by a negator is ignored — so
 * "it is not silent" doesn't count as silence.
 */
export function hasPhrase(text: string, phrase: string, respectNegation = false): boolean {
  return findPhrase(words(text), words(phrase), respectNegation ? "unnegated" : "any") >= 0;
}

/** Index of the first matching occurrence, filtered by negation, or -1. */
function findPhrase(tokens: string[], target: string[], mode: "any" | "unnegated" | "negated", from = 0): number {
  if (target.length === 0) return -1;
  for (let i = from; i + target.length <= tokens.length; i++) {
    if (!target.every((w, j) => tokens[i + j] === w)) continue;
    if (mode === "any") return i;
    const negated = isNegatedAt(tokens, i) && !NEGATORS.has(target[0]!) && target[0] !== "nothing";
    if ((mode === "negated") === negated) return i;
  }
  return -1;
}

function isNegatedAt(tokens: string[], index: number): boolean {
  return tokens.slice(Math.max(0, index - 2), index).some((w) => w === "not" || w === "never" || w === "no");
}

function hasAny(text: string, phrases: readonly string[], respectNegation = false): boolean {
  return phrases.some((p) => hasPhrase(text, p, respectNegation));
}

/* ------------------------------------------------------------------ */
/* Clauses and self-correction                                         */
/* ------------------------------------------------------------------ */

const CORRECTION_MARKERS = [
  "sorry",
  "actually",
  "i mean",
  "no wait",
  "wait",
  "hang on",
  "correction",
  "scratch that",
  "or rather",
  "rather",
  "oops",
  "my mistake",
  "let me correct that",
];
const FILLERS = new Set(["well", "um", "umm", "erm", "er", "uh", "uhh", "oh", "ok", "okay", "so", "hmm", "right"]);

const STANCE_WORDS = new Set(["yes", "yeah", "yep", "yup", "no", "nope", "nah"]);
const PRONOUN_STARTS = new Set(["it", "that", "there", "i", "we", "they", "its", "this"]);
const CORRECTION_WORDS = new Set(["sorry", "actually", "wait", "oops", "rather"]);

/**
 * Split a clause where a second answer word starts a new answer without
 * punctuation ("yes no", "yes sorry no it's not"). "no" followed by a noun
 * ("no sound", "no idea", "no one") is a description and is not split.
 */
function splitUnpunctuated(clause: string): string[] {
  const tokens = words(clause);
  const parts: string[][] = [[]];
  tokens.forEach((token, i) => {
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const startsAnswer =
      i > 0 &&
      STANCE_WORDS.has(token) &&
      (next === undefined || STANCE_WORDS.has(next) || PRONOUN_STARTS.has(next) || CORRECTION_WORDS.has(next)) &&
      !(token === "no" && next !== undefined && NO_NOUNS.has(next));
    const startsCorrection = i > 0 && CORRECTION_WORDS.has(token) && prev !== undefined && STANCE_WORDS.has(prev);
    if (startsAnswer || startsCorrection) parts.push([]);
    parts[parts.length - 1]!.push(token);
  });
  return parts.map((p) => p.join(" ")).filter(Boolean);
}

function splitSubclauses(sentence: string): string[] {
  return sentence
    .split(/,+|\s(?:but|although|though|however|and|so)\s/)
    .map((c) => c.trim())
    .filter(Boolean)
    .flatMap(splitUnpunctuated);
}

function splitClauses(normalised: string): string[] {
  return splitSubclauses(normalised.replace(/[.;!?]+/g, ","));
}

/** Clauses that close a sentence ending in "?". */
function questionClauses(normalised: string): Set<string> {
  const out = new Set<string>();
  const parts = normalised.split(/([.;!?]+)/);
  for (let i = 0; i < parts.length; i += 2) {
    const delimiter = parts[i + 1] ?? "";
    const subclauses = splitSubclauses(parts[i] ?? "");
    const last = subclauses[subclauses.length - 1];
    if (delimiter.includes("?") && last) out.add(last);
  }
  return out;
}

function stripFillers(clause: string): string {
  const tokens = words(clause);
  while (tokens.length > 1 && FILLERS.has(tokens[0]!)) tokens.shift();
  return tokens.join(" ");
}

/**
 * Politeness that changes nothing ("sorry", "hang on a sec", "bear with me").
 * RT-QA-002B: "We're off air, sorry" must not erase the report.
 */
const POLITE_ONLY = /^(sorry|so sorry|really sorry|sorry about that|sorry about this|sorry to bother you|sorry for the trouble|hang on|hang on a (sec|second|minute|moment|tick)|hold on|hold on a (sec|second|minute|moment)|one (sec|second|minute|moment)|just a (sec|second|minute|moment)|a (sec|second|minute|moment)|bear with me|wait|wait a (sec|second|minute|moment)|please|thanks|thank you|cheers|help)?$/;

function isPoliteOnly(clause: string): boolean {
  return POLITE_ONLY.test(stripFillers(clause));
}

/**
 * The last self-correction, if it actually corrects something: the marker
 * must be followed by content that is more than politeness. Returns the
 * index of the marker clause and the remaining text of that clause.
 */
function findCorrection(clauses: string[]): { index: number; rest: string } | null {
  for (let i = clauses.length - 1; i >= 0; i--) {
    const clause = stripFillers(clauses[i]!);
    for (const marker of CORRECTION_MARKERS) {
      if (clause === marker || clause.startsWith(`${marker} `)) {
        const rest = clause.slice(marker.length).trim();
        // Politeness only ("sorry about that", "hang on a sec"): not a correction; keep looking earlier.
        if ([clause, ...clauses.slice(i + 1)].every(isPoliteOnly)) break;
        return { index: i, rest };
      }
    }
  }
  return null;
}

/** The correction explicitly takes back an off-air report. */
const OFF_AIR_RETRACTIONS = ["false alarm", "never mind", "ignore that", "ignore me", "my mistake", "we are fine", "it is fine", "all fine", "everything is fine", "still on air", "we are on air", "we are still on air", "station is fine", "on air fine", "it is playing", "it is back", "listeners can hear"];
const ELLIPTICAL_DENIAL = /^(no )?(we|it|they|the station) (are|is|were|was) not$|^(no )?not off air$|^no it is not$|^no we are not$/;

function retractsOffAir(effective: string[]): boolean {
  return effective.some((c) => {
    const clause = stripFillers(c);
    if (ELLIPTICAL_DENIAL.test(clause)) return true;
    if (hasAny(clause, OFF_AIR_RETRACTIONS, true)) return true;
    return CLEAR_AIR_SILENCE.some((p) => findPhrase(words(clause), words(p), "negated") >= 0);
  });
}

/* ------------------------------------------------------------------ */
/* Modality (RT-QA-002B)                                               */
/* ------------------------------------------------------------------ */

const QUESTION_START =
  /^(are|is|was|were|am|do|does|did|has|have|had|can|could|will|would|should|shall|might|may) (we|it|they|you|i|the|there|that|this|he|she|my|our|your|anything|something|everything|nothing|anyone|someone|anybody|somebody)\b|^(what|why|how|where|who|which)\b/;
const HYPOTHETICAL = /^(what if|if|in case|suppose|supposing|imagine|unless|in the event)\b|\b(what (should|do|would|shall) (i|we) do|what happens|what would happen) (if|when)\b|\b(if|in case) (we|it|the station|there|the)\b/;
const UNCERTAIN_IF = /\b(not sure|unsure|wonder|know|tell|check|see|ask) (if|whether)\b/;
const STRONG_UNCERTAIN = ["maybe", "perhaps", "possibly", "might", "may be", "may have", "could be", "could have", "not sure", "unsure", "do not know", "no idea", "can not tell", "not certain", "i wonder", "whether", "dunno", "no clue", "hard to say"];
const NEGATED_BELIEF = /\b(do not|did not) (think|believe|reckon)\b|\b(i doubt|doubt it|doubt that|not convinced)\b/;
const WEAK_HEDGES = ["i think", "i believe", "probably", "i guess", "i reckon", "i suppose", "seems", "seems like", "looks like", "sounds like"];

function clauseModality(rawClause: string, questions: Set<string>): Modality {
  const clause = stripStanceLead(stripFillers(rawClause));
  if (HYPOTHETICAL.test(clause) && !UNCERTAIN_IF.test(clause)) return "hypothetical";
  if (questions.has(rawClause) || QUESTION_START.test(clause)) return "question";
  if (NEGATED_BELIEF.test(clause)) return "negated-belief";
  if (hasAny(clause, STRONG_UNCERTAIN)) return "uncertain";
  if (hasAny(clause, WEAK_HEDGES)) return "hedged";
  return "assertive";
}

/** "yes it is…" → "it is…", so a leading answer word doesn't hide the clause's form. */
function stripStanceLead(clause: string): string {
  const tokens = words(clause);
  while (tokens.length > 1 && (STANCE_WORDS.has(tokens[0]!) || FILLERS.has(tokens[0]!))) tokens.shift();
  return tokens.join(" ");
}

const SUBJECTS = new Set(["it", "they", "that", "there", "i", "we", "he", "she", "this", "these", "those", "the", "my", "our"]);
const PREDICATE_NEGATORS = new Set(["not", "never", "nothing", "none"]);

/** "it was not working", "they do not move" — a statement with a subject that denies something. */
function deniesPredicate(clause: string): boolean {
  const tokens = words(stripStanceLead(stripFillers(clause)));
  if (!SUBJECTS.has(tokens[0] ?? "")) return false;
  return tokens.some((t) => PREDICATE_NEGATORS.has(t)) || hasPhrase(tokens.join(" "), "no longer");
}

/* ------------------------------------------------------------------ */
/* Stance                                                              */
/* ------------------------------------------------------------------ */

const AFFIRM_LEADS = ["yes", "yeah", "yep", "yup", "yea", "aye", "correct", "sure", "definitely", "absolutely", "affirmative", "indeed"];
const AFFIRM_PHRASES = ["that is right", "that is it", "that is the one", "it is", "it does", "it did", "it was", "they are", "they do", "they did", "i can", "i do", "i did", "i have", "there is", "it has", "still is", "it still is"];
const NEGATE_LEADS = ["no", "nope", "nah", "negative", "wrong"];
const NEGATE_PHRASES = ["it is not", "it does not", "it did not", "it was not", "they are not", "they do not", "they did not", "i can not", "i do not", "i did not", "i have not", "there is not", "it has not", "not that one", "not really", "not at all", "not any more", "no longer"];
/** "no" followed by one of these is a description ("no sound"), not an answer. */
const NO_NOUNS = new Set(["sound", "audio", "music", "signal", "power", "light", "lights", "idea", "one", "change", "changes", "response", "picture", "noise", "output", "level", "levels", "meter", "meters", "movement", "song", "track", "playback", "need", "problem"]);
const UNCERTAIN = ["not sure", "unsure", "do not know", "no idea", "dunno", "can not tell", "not certain", "maybe", "perhaps", "possibly", "hard to say", "i do not remember", "can not remember", "no clue"];
const HEDGES = ["i think so", "i think", "probably", "i guess", "i believe", "i reckon", "seems like it", "looks like it", "i suppose"];

function clauseStance(rawClause: string): Stance {
  const clause = stripFillers(rawClause);
  const tokens = words(clause);
  const lead = tokens[0] ?? "";
  if (hasAny(clause, UNCERTAIN)) return "uncertain";
  if (NEGATE_LEADS.includes(lead) && !(lead === "no" && NO_NOUNS.has(tokens[1] ?? ""))) return "negate";
  if (NEGATE_PHRASES.some((p) => clause === p || clause === `${p} it` || clause === `${p} at all`)) return "negate";
  if (NEGATE_PHRASES.some((p) => clause.startsWith(`${p} `) && ["really", "at all", "any more"].some((t) => p.includes(t)))) return "negate";
  if (AFFIRM_LEADS.includes(lead)) return "affirm";
  if (AFFIRM_PHRASES.some((p) => clause === p || clause === `yes ${p}`)) return "affirm";
  if (clause === "i think so" || clause === "probably" || clause === "i believe so") return "affirm";
  return "none";
}

/* ------------------------------------------------------------------ */
/* Observations about sound                                            */
/* ------------------------------------------------------------------ */

interface AudioPhrase {
  phrase: string;
  /** Polarity when NOT negated. */
  polarity: AudioClaim;
  kind: "silence" | "no-sound";
}

/** Order matters: longer, inherently negative phrases are matched first. */
const AUDIO_PHRASES: AudioPhrase[] = [
  ...["nothing is playing", "nothing playing", "playing nothing", "nothing is coming out", "nothing coming out", "nothing on air", "nothing is on air", "nothing is going out", "nothing going out", "dead air", "off air", "off the air", "gone silent", "gone quiet", "it stopped", "has stopped", "stopped playing", "music stopped", "song stopped", "sound stopped", "audio stopped", "silent", "silence"].map(
    (phrase): AudioPhrase => ({ phrase, polarity: "absent", kind: "silence" }),
  ),
  ...["no sound", "no audio", "no music", "no noise", "no output", "hear nothing", "can not hear", "could not hear", "not hearing", "nothing to hear"].map(
    (phrase): AudioPhrase => ({ phrase, polarity: "absent", kind: "no-sound" }),
  ),
  ...["still playing", "is playing", "it plays", "playing fine", "playing", "there is sound", "sound is coming", "sound coming", "can hear", "hear it", "hear music", "hear the music", "hear sound", "coming through", "music is on", "audio is fine"].map(
    (phrase): AudioPhrase => ({ phrase, polarity: "present", kind: "silence" }),
  ),
];

interface AudioFinding {
  polarity: AudioClaim;
  kind: "silence" | "no-sound";
  negated: boolean;
}

function audioFindings(clause: string): AudioFinding[] {
  const tokens = words(clause);
  const used = new Array(tokens.length).fill(false);
  const findings: AudioFinding[] = [];
  for (const entry of AUDIO_PHRASES) {
    const target = words(entry.phrase);
    for (let i = 0; i + target.length <= tokens.length; i++) {
      if (used.slice(i, i + target.length).some(Boolean)) continue;
      if (!target.every((w, j) => tokens[i + j] === w)) continue;
      for (let j = i; j < i + target.length; j++) used[j] = true;
      const inherentlyNegative = NEGATORS.has(target[0]!) || target[0] === "nothing" || target.includes("not");
      const negated = !inherentlyNegative && isNegatedAt(tokens, i);
      const polarity: AudioClaim = negated ? (entry.polarity === "present" ? "absent" : "present") : entry.polarity;
      findings.push({ polarity, kind: entry.kind, negated });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Safety and requests                                                 */
/* ------------------------------------------------------------------ */

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
  "station has gone silent",
  "station is off",
  "nothing is being broadcast",
  "not broadcasting",
  "we are silent",
];
const ON_AIR = ["on air", "on the air", "broadcasting", "going out", "live"];
const NOT_WORKING = ["not working", "not doing anything", "nothing happens", "nothing happened", "nothing is happening", "not responding", "does not work", "did not work", "will not work", "stopped working", "broken", "is dead", "gone weird", "not right", "frozen", "stuck"];

/** A request form ("I need…", "can someone…", "please get…"). */
const REQUEST_FORM =
  /\b(i (really |urgently )?(need|want|would like)|we (need|want)|(can|could|may) (i|we) (get|have|speak|talk|call|contact|see)|(can|could|will|would) (someone|somebody|anyone|you)|please (get|call|fetch|send|contact|find)|get (me |us )?(a|an|the|some)|(speak|talk) (to|with)|call (a|an|the|someone|somebody|support)|ring (a|an|the|someone|support)|phone (a|an|the|someone|support)|contact (a|an|the|someone|support)|fetch (a|an|the|someone)|is there (someone|anyone|somebody))\b/;
/** A person being asked for. */
const PERSON_TARGET = /\b(human|person|people|someone|somebody|anyone|engineer|engineers|technician|manager|staff)\b/;
/** Support being asked for. "Can you help me…" is addressed to the assistant, so it doesn't count on its own. */
const SUPPORT_TARGET = /\b(tech support|technical support|support|help)\b/;
const ADDRESSED_TO_ASSISTANT = /\b(can|could|will|would) you\b/;
const STANDALONE_HELP = new Set(["help", "help me", "help please", "please help", "help us", "technical support", "tech support", "support", "support please", "get help", "sos", "need help", "i need help", "engineer please", "get the engineer", "get an engineer", "human please"]);
const DECLINES = /\b(do not|dont|no) (need|want|call|get|bother)\b|\bno need\b|\bwithout help\b|\bnot need\b/;

function isHelpRequest(clauses: string[]): boolean {
  return clauses.some((raw) => {
    const clause = stripFillers(raw);
    if (DECLINES.test(clause)) return false;
    if (STANDALONE_HELP.has(clause)) return true;
    if (!REQUEST_FORM.test(clause)) return false;
    if (PERSON_TARGET.test(clause)) return true;
    return SUPPORT_TARGET.test(clause) && (!ADDRESSED_TO_ASSISTANT.test(clause) || /\b(tech support|technical support)\b/.test(clause));
  });
}

const PROCEDURE_VERBS = ["restart", "reboot", "reset", "turn it off", "turn off", "turn on", "switch off", "switch on", "switch it off", "unplug", "plug", "power", "press", "replace", "reconnect", "disconnect", "pull out", "hold down"];
const QUESTION_LEADS = ["should", "shall", "can", "could", "do", "does", "must", "is it ok", "is it okay", "would it", "how do", "how can", "what if", "am i allowed", "do i"];

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

export function understand(rawText: string): Understanding {
  const text = rawText.trim();
  const normalised = normaliseReply(text);
  const clauses = splitClauses(normalised);
  const questions = questionClauses(normalised);
  const modality = new Map(clauses.map((c) => [c, clauseModality(c, questions)]));
  const modalityOf = (c: string): Modality => modality.get(c) ?? clauseModality(c, questions);

  // Self-correction: the part after the last correction marker takes precedence.
  // Politeness alone ("sorry", "hang on") is not a correction.
  const correction = findCorrection(clauses);
  const effective = correction ? [correction.rest, ...clauses.slice(correction.index + 1)].filter(Boolean) : clauses;
  const factual = (c: string) => {
    const m = modalityOf(c);
    return m === "assertive" || m === "hedged";
  };
  // Only statements can answer a question or record an observation.
  const stated = effective.filter((c) => {
    const m = modalityOf(c);
    return m !== "question" && m !== "hypothetical";
  });

  // Stance across stated clauses (not just the first).
  const stances = stated.map(clauseStance).filter((s) => s !== "none");
  let stance: Stance = "none";
  if (stances.includes("uncertain")) stance = "uncertain";
  else if (stances.includes("affirm") && stances.includes("negate")) stance = correction ? stances[stances.length - 1]! : "conflict";
  else if (stances.length > 0) stance = stances[0]!;
  // A corrected message with no stance after the correction has no stance of its own.
  if (correction && stances.length === 0) stance = "none";

  // Observations about sound: only facts count as claims. Uncertain or asked
  // silence is a possible signal, never a recorded observation.
  const findings = effective.filter(factual).flatMap(audioFindings);
  const possibleFindings = effective
    .filter((c) => ["uncertain", "question"].includes(modalityOf(c)))
    .flatMap(audioFindings);
  const present = findings.some((f) => f.polarity === "present");
  const absent = findings.some((f) => f.polarity === "absent");
  const audioConflict = present && absent;
  const audio: AudioClaim | null = audioConflict ? null : absent ? "absent" : present ? "present" : null;

  // Off air: stated as fact → confirmed; hedged, uncertain or asked → possible.
  const offAirIn = (c: string) => hasAny(c, CLEAR_AIR_SILENCE, true);
  let offAir: Understanding["offAir"] = null;
  for (const c of effective.filter(offAirIn)) {
    const m = modalityOf(c);
    if (m === "assertive") offAir = "confirmed";
    else if ((m === "hedged" || m === "uncertain" || m === "question") && offAir === null) offAir = "possible";
  }
  if (correction && offAir === null) {
    // An off-air report before a correction survives unless the correction takes it back.
    const before = clauses.slice(0, correction.index).filter((c) => offAirIn(c) && factual(c));
    if (before.length > 0 && !retractsOffAir(effective)) offAir = "possible";
  }
  const hypotheticalOffAir = offAir === null && effective.some((c) => modalityOf(c) === "hypothetical" && offAirIn(c));
  const clearAirSilence = offAir === "confirmed";

  const effectiveText = effective.join(", ");
  const signals: Signal[] = [];
  if (offAir !== null || [...findings, ...possibleFindings].some((f) => f.polarity === "absent" && f.kind === "silence")) signals.push("silence");
  if (findings.some((f) => f.polarity === "absent" && f.kind === "no-sound")) signals.push("no-sound");
  if (hasAny(effectiveText, NOT_WORKING, true)) signals.push("not-working");
  if (hasAny(normalised, UNCERTAIN) && hasAny(normalised, ON_AIR) && offAir === null) signals.push("on-air-unknown");

  const negatedSignals: Signal[] = [];
  if (!signals.includes("silence") && findings.some((f) => f.negated && f.polarity === "present" && f.kind === "silence")) {
    negatedSignals.push("silence");
  }

  const assertiveClauses = effective.filter(factual);
  const negatedPredicate = assertiveClauses.some((c) => deniesPredicate(c) && audioFindings(c).length === 0 && !hasAny(c, UNCERTAIN));

  const isQuestion = /\?/.test(text) || clauses.some((c) => QUESTION_LEADS.some((lead) => stripFillers(c).startsWith(`${lead} `)));
  const procedureQuestion = clauses.some((c) => {
    const clause = stripFillers(c);
    return QUESTION_LEADS.some((lead) => clause.startsWith(`${lead} `)) && hasAny(clause, PROCEDURE_VERBS);
  }) || (/\?/.test(text) && hasAny(normalised, PROCEDURE_VERBS) && !isHelpRequest(clauses));

  return {
    text,
    normalised,
    clauses,
    stance: words(normalised).length === 0 ? "none" : stance,
    corrected: correction !== null,
    hedged: hasAny(normalised, HEDGES),
    audio,
    audioConflict,
    signals,
    negatedSignals,
    clearAirSilence,
    helpRequest: isHelpRequest(clauses),
    procedureQuestion,
    isQuestion,
    offAir,
    hypotheticalOffAir,
    assertive: assertiveClauses.join(", "),
    negatedPredicate,
  };
}

/** True when the stance points one way and the observations the other. */
export function isContradictory(u: Understanding): boolean {
  return u.stance === "affirm" && u.audio === "absent";
}
