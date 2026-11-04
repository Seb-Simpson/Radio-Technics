/**
 * Broadcast safety classification (RT-002D).
 *
 * Runs on EVERY message, independently of the question on screen, the answer
 * options and the conversation route. It decides only whether the message
 * reports a broadcast interruption (the station silent or off air for
 * listeners) and how firmly:
 *
 *   current-confirmed  stated as a present fact            "We aren't on air."
 *   current-possible   asked, hedged, uncertain or vague   "Are we off air?"
 *   historical         in the past and over                "We were off air earlier, but we're back."
 *   hypothetical       conditional / what-if               "We would be off air if I restarted."
 *   denied             explicitly not the case             "It is not true that we're off air."
 *   none               not mentioned
 *
 * Design rules:
 *   - A change of subject ("Actually, I need a human") never retracts a report.
 *     Only an explicit denial or retraction of the broadcast fact does.
 *   - When a report is unclear, it is `current-possible`, never `none`.
 *   - Nothing here chooses an answer or a route; the engine reads the result.
 */
import {
  clauseModality,
  findPhrase,
  hasAny,
  normaliseReply,
  questionClauses,
  splitClauses,
  stripFillers,
  UNCERTAIN_IF,
  words,
} from "./text";

export type BroadcastStatus = "current-confirmed" | "current-possible" | "historical" | "hypothetical" | "denied" | "none";

export interface BroadcastAssessment {
  status: BroadcastStatus;
  /** The clause that decided the status, for the support summary and tests. */
  evidence: string | null;
}

/**
 * Phrases that describe the broadcast itself failing. Negated forms of being
 * on air ("not on air", "not broadcasting") are failures in their own right.
 */
const FAILURE = [
  "off air",
  "off the air",
  "dead air",
  "not on air",
  "not on the air",
  "no longer on air",
  "not broadcasting",
  "stopped broadcasting",
  "stopped transmitting",
  "not transmitting",
  "nothing going out",
  "nothing is going out",
  "nothing goes out",
  "no sound going out",
  "no sound is going out",
  "no audio going out",
  "no audio is going out",
  "nothing on air",
  "nothing is on air",
  "silent on air",
  "silence on air",
  "station is silent",
  "station has gone silent",
  "station went silent",
  "station is off",
  "transmitter is down",
  "transmission has stopped",
  "transmission stopped",
  "lost transmission",
  "listeners can not hear",
  "listeners are hearing nothing",
  "listeners hear nothing",
  "nothing to listeners",
  "we are silent",
];

/** The whole clause is denied ("it is not true that…"). */
const CLAUSE_DENIAL = /^(it is not true|it is false|it is not the case|that is not true|not true|untrue)( that)?\b/;
/** Explicit retractions of a report made earlier in the message. */
const RETRACTIONS = ["false alarm", "never mind", "ignore that", "ignore me", "my mistake", "not true", "that is wrong", "i was wrong", "we are fine", "station is fine"];
const ELLIPTICAL_DENIAL = /^(no )?(we|it|they|the station) (are|is|were|was) not$|^no it is not$|^no we are not$|^(no )?not off air$/;
/** The broadcast is (now) fine. */
const RECOVERY = ["back on air", "back now", "working now", "fine now", "ok now", "okay now", "everything is working", "everything works", "all working", "it is back", "we are back", "came back", "come back", "back to normal", "sorted now", "resolved", "fixed now", "it is fixed", "still on air", "we are on air", "we are still on air", "on air now", "listeners can hear"];
const PAST_TIME = ["earlier", "before", "this morning", "this afternoon", "yesterday", "last night", "last week", "last hour", "ago", "previously", "at the weekend", "for a bit", "for a while", "briefly", "for a moment", "a minute ago", "a moment ago"];
const PAST_FORMS = /\b(were|was|had been|went|had gone)\b/;
/** Planned time off air is not a fault ("we're not on air until six"). */
const NOT_YET = /\b(yet|until|till|before the show|tonight|tomorrow)\b/;
const CONDITIONAL = /\b(would|could|will) (be|go|have|end up)\b.*\b(if|unless|otherwise|when)\b|\b(if|unless|in case|what happens if|what if|suppose|supposing|imagine)\b/;
/** Corrections that relocate a sound problem ("I mean the headphones are silent"). */
const RELOCATING_CORRECTION = /^(sorry )?(i mean|i meant|or rather|rather|correction|scratch that|let me correct that)\b/;
const RELOCATED_SOUND = ["silent", "no sound", "can not hear", "nothing", "headphones", "speakers", "monitors", "cans", "mic", "microphone"];

function mentionsFailure(clause: string): { found: boolean; negated: boolean } {
  const tokens = words(clause);
  let found = false;
  let negated = false;
  for (const phrase of FAILURE) {
    const target = words(phrase);
    if (findPhrase(tokens, target, "unnegated") >= 0) found = true;
    else if (findPhrase(tokens, target, "negated") >= 0) negated = true;
  }
  // "not off air" is a denial; "not on air" is a failure (handled by the list).
  if (found && CLAUSE_DENIAL.test(stripFillers(clause))) return { found: false, negated: true };
  return { found, negated: negated && !found };
}

interface ClauseReading {
  clause: string;
  status: BroadcastStatus;
  index: number;
  /** A denial of the broadcast fact itself (not just "never mind"). */
  explicit?: boolean;
}

function readClause(clause: string, index: number, questions: Set<string>, messageText: string): ClauseReading | null {
  const { found, negated } = mentionsFailure(clause);
  const stripped = stripFillers(clause);
  if (!found) {
    if (negated) return { clause, status: "denied", index, explicit: true };
    if (ELLIPTICAL_DENIAL.test(stripped) || hasAny(stripped, RETRACTIONS)) return { clause, status: "denied", index };
    if (hasAny(stripped, RECOVERY)) return { clause, status: "historical", index };
    return null;
  }
  if (NOT_YET.test(stripped) && /\bnot on (the )?air\b/.test(stripped)) return null;
  const modality = clauseModality(clause, questions);
  const conditional = !UNCERTAIN_IF.test(stripped) && (CONDITIONAL.test(stripped) || (/\bwould\b/.test(stripped) && /\b(if|unless|otherwise)\b/.test(messageText)));
  if (modality === "hypothetical" || conditional) {
    return { clause, status: "hypothetical", index };
  }
  if (modality === "negated-belief") return { clause, status: "denied", index, explicit: true };
  const past = PAST_FORMS.test(stripped) && !/\b(have|has) (stopped|gone)\b/.test(stripped);
  if (past && (hasAny(stripped, PAST_TIME) || hasAny(messageText, RECOVERY))) return { clause, status: "historical", index };
  if (modality === "question" || modality === "uncertain" || modality === "hedged" || past) return { clause, status: "current-possible", index };
  return { clause, status: "current-confirmed", index };
}

const RANK: Record<BroadcastStatus, number> = {
  "current-confirmed": 5,
  "current-possible": 4,
  historical: 3,
  hypothetical: 2,
  denied: 1,
  none: 0,
};

export function classifyBroadcast(rawText: string): BroadcastAssessment {
  const normalised = normaliseReply(rawText);
  const clauses = splitClauses(normalised);
  const questions = questionClauses(normalised);
  const readings = clauses
    .map((clause, index) => readClause(clause, index, questions, normalised))
    .filter((r): r is ClauseReading => r !== null);

  const reports = readings.filter((r) => r.status === "current-confirmed" || r.status === "current-possible");
  if (reports.length > 0) {
    const first = reports[0]!;
    const later = readings.filter((r) => r.index > first.index);
    // An explicit denial after the report takes it back; recovery makes it historical.
    if (later.some((r) => r.status === "denied")) return { status: "denied", evidence: later.find((r) => r.status === "denied")!.clause };
    if (later.some((r) => r.status === "historical" && !mentionsFailure(r.clause).found)) {
      return { status: "historical", evidence: first.clause };
    }
    // Re-describing the problem somewhere else ("sorry, I mean the headphones are
    // silent") keeps the concern, but it is no longer a firm broadcast report.
    const strongest = reports.reduce((a, b) => (RANK[b.status] > RANK[a.status] ? b : a));
    const relocated = clauses.slice(first.index + 1).some((c) => {
      const s = stripFillers(c);
      return RELOCATING_CORRECTION.test(s) && hasAny(s, RELOCATED_SOUND) && !mentionsFailure(s).found;
    });
    if (relocated) return { status: "current-possible", evidence: strongest.clause };
    return { status: strongest.status, evidence: strongest.clause };
  }
  if (readings.length === 0) return { status: "none", evidence: null };
  const strongest = readings.reduce((a, b) => (RANK[b.status] > RANK[a.status] ? b : a));
  // A bare "we are fine" with no report is not a denial of anything.
  if (strongest.status === "historical" && !readings.some((r) => mentionsFailure(r.clause).found)) return { status: "none", evidence: null };
  if (strongest.status === "denied" && !readings.some((r) => r.explicit)) {
    return { status: "none", evidence: null };
  }
  return { status: strongest.status, evidence: strongest.clause };
}

/** A current concern (confirmed or possible) that must be escalated. */
export function isCurrentConcern(status: BroadcastStatus): status is "current-confirmed" | "current-possible" {
  return status === "current-confirmed" || status === "current-possible";
}
