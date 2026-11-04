/**
 * Diagnostic claims (RT-002D): what a presenter's STATEMENTS say about the
 * specific things the troubleshooting questions ask about.
 *
 * A claim is an interpretation, never a confirmed answer. The engine uses
 * claims only to propose a candidate answer, which the presenter must then
 * confirm with a button (or an unambiguous "yes"). Claims are read only from
 * statements — questions, hypotheticals and strong uncertainty produce none.
 *
 * Each subject has inherently negative phrases ("stopped moving") and positive
 * phrases ("moving"). A positive phrase is flipped when negated before it
 * ("not moving", "never moved") or emptied after it ("plays nothing",
 * "plays neither music nor speech").
 */
import { clauseModality, normaliseReply, questionClauses, splitClauses, words } from "./text";

export type ClaimSubject = "sound" | "movement" | "worked-earlier" | "found";

export interface Claim {
  subject: ClaimSubject;
  /** true = present / moving / worked / found. */
  value: boolean;
  /** The words that produced it. */
  phrase: string;
  /** False when the clause was hedged ("I think…"). */
  firm: boolean;
  /** The phrase's meaning was reversed by negation ("not silent", "not moving"). */
  flipped: boolean;
  /** For sound: silence (playback/broadcast) or the presenter not hearing it. */
  kind?: "silence" | "no-sound";
}

interface Lexicon {
  negative: string[];
  positive: string[];
}

const LEXICON: Record<ClaimSubject, Lexicon> = {
  sound: {
    negative: [
      "no sound", "no audio", "no music", "no noise", "no output", "nothing playing", "nothing is playing", "playing nothing",
      "nothing coming out", "nothing is coming out", "nothing coming through", "nothing is coming through", "nothing at all",
      "gone quiet", "gone silent", "silent", "silence", "dead air", "hear nothing", "stopped playing", "has stopped",
      "it stopped", "music stopped", "song stopped", "sound stopped", "audio stopped", "not playing", "can not hear anything",
      "can not hear it", "can not hear",
    ],
    positive: [
      "still playing", "is playing", "it plays", "plays", "playing", "there is sound", "sound is coming", "sound coming",
      "can hear", "hear it", "hear music", "hear the music", "hear sound", "coming through", "music is on", "audio is fine",
      "any sound", "any audio", "any music", "some sound", "some sounds",
    ],
  },
  movement: {
    negative: [
      "stopped moving", "not moving", "no movement", "frozen", "flat", "flatlined", "dead", "stuck", "nothing on the meters",
      "not bouncing", "not doing anything", "stopped",
    ],
    positive: ["moving", "move", "moves", "moved", "bouncing", "jumping", "going up and down", "flickering", "lighting up", "dancing"],
  },
  "worked-earlier": {
    negative: [
      "not worked", "has not worked", "have not worked", "has not been working", "not been working", "never worked",
      "was not working", "been broken", "broken all day", "not working all day", "not working since",
    ],
    positive: ["was working", "were working", "worked earlier", "working earlier", "worked fine", "was fine", "was ok", "worked this morning", "working this morning", "it worked"],
  },
  found: {
    negative: ["can not find", "can not see it", "can not see the", "do not know where", "no idea where", "not found"],
    positive: ["found it", "found", "i can see it", "i see it", "got it", "there it is", "it is there", "i have it"],
  },
};

const BEFORE = new Set(["not", "never", "no", "neither", "nor", "without", "hardly", "barely"]);
const AFTER = new Set(["nothing", "neither", "no", "none"]);

function matchAt(tokens: string[], target: string[], i: number): boolean {
  return target.every((w, j) => tokens[i + j] === w);
}

const NO_SOUND_PHRASES = new Set(["no sound", "no audio", "no noise", "no output", "hear nothing", "can not hear anything", "can not hear it", "can not hear"]);
const HEARING_PHRASES = new Set(["can hear", "hear it", "hear music", "hear the music", "hear sound"]);

/** Claims about one subject in one clause (no modality check: callers decide which clauses count). */
export function clauseClaims(clause: string, subject: ClaimSubject, firm = true): Claim[] {
  const tokens = words(clause);
  const used = new Array<boolean>(tokens.length).fill(false);
  const out: Claim[] = [];
  const scan = (phrases: string[], positive: boolean) => {
    // Longest phrases first so "stopped moving" wins over "moving".
    for (const phrase of [...phrases].sort((a, b) => words(b).length - words(a).length)) {
      const target = words(phrase);
      for (let i = 0; i + target.length <= tokens.length; i++) {
        if (used.slice(i, i + target.length).some(Boolean) || !matchAt(tokens, target, i)) continue;
        for (let j = i; j < i + target.length; j++) used[j] = true;
        let value = positive;
        if (positive) {
          const before = tokens.slice(Math.max(0, i - 3), i).some((w) => BEFORE.has(w));
          const after = tokens.slice(i + target.length, i + target.length + 2).some((w) => AFTER.has(w));
          if (before || after) value = false;
        } else if (tokens.slice(Math.max(0, i - 2), i).some((w) => w === "not" || w === "never") && !target.includes("not")) {
          // "not silent", "never stopped" → the opposite.
          value = true;
        }
        const kind = subject === "sound" ? (NO_SOUND_PHRASES.has(phrase) || HEARING_PHRASES.has(phrase) ? "no-sound" : "silence") : undefined;
        out.push({ subject, value, phrase, firm, flipped: value !== positive, kind });
      }
    }
  };
  scan(LEXICON[subject].negative, false);
  scan(LEXICON[subject].positive, true);
  return out;
}

export interface ClaimReading {
  claims: Claim[];
  /** Subjects the statements say both ways about. */
  conflicts: ClaimSubject[];
}

/** Claims about each subject, from statements only. */
export function extractClaims(rawText: string, subjects: readonly ClaimSubject[] = ["sound", "movement", "worked-earlier", "found"]): ClaimReading {
  const normalised = normaliseReply(rawText);
  const questions = questionClauses(normalised);
  const claims: Claim[] = [];
  for (const clause of splitClauses(normalised)) {
    const modality = clauseModality(clause, questions);
    if (modality !== "assertive" && modality !== "hedged") continue;
    for (const subject of subjects) claims.push(...clauseClaims(clause, subject, modality === "assertive"));
  }
  const conflicts = subjects.filter((subject) => {
    const values = new Set(claims.filter((c) => c.subject === subject).map((c) => c.value));
    return values.size > 1;
  });
  return { claims, conflicts };
}

/** The single value the statements give for `subject`, or null if none or conflicting. */
export function claimValue(reading: ClaimReading, subject: ClaimSubject): boolean | null {
  if (reading.conflicts.includes(subject)) return null;
  const found = reading.claims.find((c) => c.subject === subject);
  return found ? found.value : null;
}
