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
import {
  CORRECTION_WORDS,
  FILLERS,
  hasAny,
  hasPhrase,
  isNegatedAt,
  isPoliteOnly,
  NEGATORS,
  NO_NOUNS,
  normaliseReply,
  questionClauses,
  splitClauses,
  STANCE_WORDS,
  STRONG_UNCERTAIN,
  stripFillers,
  stripStanceLead,
  clauseModality,
  words,
  findPhrase,
  type Modality,
} from "./text";

export { hasPhrase, normaliseReply, type Modality } from "./text";
import { classifyBroadcast, type BroadcastAssessment } from "./safety";
import { clauseClaims } from "./claims";

/* ------------------------------------------------------------------ */
/* Bare replies (RT-002D)                                              */
/* ------------------------------------------------------------------ */

const BARE_AFFIRM = new Set([
  "yes", "yeah", "yep", "yup", "yea", "aye", "correct", "right", "that is right", "that is correct", "exactly", "definitely",
  "absolutely", "affirmative", "indeed", "sure", "yes it is", "yes they do", "yes they are", "yes i can", "yes i have", "yes it does",
  "yes it did", "yes it was", "yes that is right", "yes that is it", "yes that is correct", "yes correct", "yes exactly",
  "yes definitely", "that is it", "that is the one", "it is", "it does", "they do", "they are", "i can", "i have",
]);
const BARE_NEGATE = new Set([
  "no", "nope", "nah", "negative", "no it is not", "no they do not", "no they are not", "no it does not", "no it did not",
  "no it was not", "no i can not", "no i have not", "it is not", "it does not", "they do not", "they are not", "i can not",
  "not really", "not at all", "no not at all", "no not really", "definitely not", "no that is wrong", "wrong", "that is wrong",
  "no that is not right", "that is not right",
]);
const BARE_UNCERTAIN = new Set([
  "not sure", "i am not sure", "unsure", "i am unsure", "i do not know", "do not know", "dunno", "no idea", "maybe", "perhaps",
  "no clue", "hard to say", "not certain", "i am not certain", "i really do not know", "i have no idea",
]);
const BARE_FILLER = new Set(["well", "um", "umm", "erm", "er", "uh", "oh", "ok", "okay", "hmm", "please", "thanks", "thank", "you", "cheers", "sorry"]);

/** The message is nothing but an answer word, so it answers exactly the question on screen. */
function bareReply(normalised: string): "affirm" | "negate" | "uncertain" | null {
  const tokens = normalised.replace(/[,.;!?]/g, " ").split(" ").filter(Boolean);
  const kept = tokens.filter((t, i) => !BARE_FILLER.has(t) && !(t === "you" && tokens[i - 1] === "thank"));
  // Collapse repeats: "no no" → "no", "yes yes" → "yes".
  const collapsed = kept.filter((t, i) => t !== kept[i - 1]).join(" ");
  if (!collapsed) return null;
  if (BARE_AFFIRM.has(collapsed)) return "affirm";
  if (BARE_NEGATE.has(collapsed)) return "negate";
  if (BARE_UNCERTAIN.has(collapsed)) return "uncertain";
  return null;
}


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
  /** RT-002D: the full broadcast-safety reading (current / possible / historical / hypothetical / denied / none). */
  broadcast: BroadcastAssessment;
  /**
   * RT-002D: the whole message is ONLY a yes, no or "not sure" (with fillers
   * and politeness), so it answers exactly the question on screen. Anything
   * longer is an interpretation that needs confirming.
   */
  bare: "affirm" | "negate" | "uncertain" | null;
  /** Off air was only mentioned hypothetically ("what if we go off air?"). */
  hypotheticalOffAir: boolean;
  /** Effective clauses stated as fact (not questions, hypotheticals or strong uncertainty). Used to match answers. */
  assertive: string;
  /** A statement with a subject that denies something ("it wasn't working", "they don't move"). */
  negatedPredicate: boolean;
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


interface AudioFinding {
  polarity: AudioClaim;
  kind: "silence" | "no-sound";
  negated: boolean;
}

/** Sound findings in one clause, read by the shared claims lexicon (claims.ts). */
function audioFindings(clause: string): AudioFinding[] {
  return clauseClaims(clause, "sound").map((c) => ({
    polarity: c.value ? "present" : "absent",
    kind: c.kind ?? "silence",
    negated: c.flipped,
  }));
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
const PERSON_TARGET = /\b(human|person|people|someone|somebody|anyone|engineer|engineers|technician|manager|staff|helpdesk|help desk|service desk|it support|it team|it department)\b/;
/** Support being asked for. "Can you help me…" is addressed to the assistant, so it doesn't count on its own. */
const SUPPORT_TARGET = /\b(tech support|technical support|support|help|assistance)\b/;
/**
 * RT-QA-002B: other ways of asking for a person ("put me through to support",
 * "who do I call?", "page the engineer", "is anyone available?"). Declines
 * ("don't call anyone") are excluded before these are checked.
 */
const DIRECT_REQUEST = new RegExp(
  [
    "\\b(put me through|transfer me|connect me|pass me) (to|with|on to)\\b",
    "\\bescalate\\b",
    "\\bsend (someone|somebody|an engineer|a technician|help|the engineer|for (the |an )?engineer)\\b",
    "\\bpage (the|an|a|someone|somebody)\\b",
    "\\btell (the|an|a) (engineer|technician|manager|support)\\b",
    "\\blet (someone|somebody|the engineer|support|the manager|tech support|technical support) know\\b",
    "\\bfind (me )?(someone|somebody|an engineer|a technician)\\b",
    "\\bneeds? (a|an|the) (engineer|technician|person|human|expert)\\b",
    "\\bwho (do|should|can|could|shall) (i|we) (call|contact|ring|phone|ask|speak to|talk to|get)\\b",
    "\\bwhere (do|can|should) (i|we) (get|find) help\\b",
    "\\b(number|contact details|details|phone number) for (tech support|technical support|support|the engineer|an engineer)\\b",
    "\\bis (anyone|anybody|someone|somebody) (available|around|there|free|about)\\b",
  ].join("|"),
);
/** "I need IT" — only the capitalised word, so "I need it to work" doesn't count. */
const IT_REQUEST = /\b(need|contact|call|ring|get|phone|email|message)\s+(the\s+)?IT\b/;
const ADDRESSED_TO_ASSISTANT = /\b(can|could|will|would) you\b/;
const STANDALONE_HELP = new Set(["help", "help me", "help please", "please help", "help us", "technical support", "tech support", "support", "support please", "get help", "sos", "need help", "i need help", "engineer please", "get the engineer", "get an engineer", "human please"]);
const DECLINES = /\b(do not|dont|no) (need|want|call|get|bother)\b|\bno need\b|\bwithout help\b|\bnot need\b/;

function isHelpRequest(clauses: string[], rawText = ""): boolean {
  if (IT_REQUEST.test(rawText) && !DECLINES.test(normaliseReply(rawText))) return true;
  return clauses.some((raw) => {
    const clause = stripFillers(raw);
    if (DECLINES.test(clause)) return false;
    if (STANDALONE_HELP.has(clause)) return true;
    if (DIRECT_REQUEST.test(clause)) return true;
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

  // Off air: decided by the independent broadcast safety classifier (safety.ts),
  // which reads every clause and never looks at the question or answers.
  const broadcast = classifyBroadcast(text);
  const offAir: Understanding["offAir"] =
    broadcast.status === "current-confirmed" ? "confirmed" : broadcast.status === "current-possible" ? "possible" : null;
  const hypotheticalOffAir = broadcast.status === "hypothetical";
  const clearAirSilence = offAir === "confirmed";
  // Past, hypothetical or denied silence on air is not a silence signal now.
  const silenceDiscounted = broadcast.status === "historical" || broadcast.status === "hypothetical" || broadcast.status === "denied";

  const effectiveText = effective.join(", ");
  const signals: Signal[] = [];
  if (offAir !== null || (!silenceDiscounted && [...findings, ...possibleFindings].some((f) => f.polarity === "absent" && f.kind === "silence"))) {
    signals.push("silence");
  }
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
    helpRequest: isHelpRequest(clauses, text),
    procedureQuestion,
    isQuestion,
    offAir,
    hypotheticalOffAir,
    broadcast,
    bare: bareReply(normalised),
    assertive: assertiveClauses.join(", "),
    negatedPredicate,
  };
}

/** True when the stance points one way and the observations the other. */
export function isContradictory(u: Understanding): boolean {
  return u.stance === "affirm" && u.audio === "absent";
}
