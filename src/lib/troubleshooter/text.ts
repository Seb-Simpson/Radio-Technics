/**
 * Text helpers shared by reply understanding (understand.ts), the broadcast
 * safety classifier (safety.ts) and diagnostic claims (claims.ts): normalisation,
 * whole-word phrase matching with negation, clause splitting and clause modality.
 * Pure and deterministic.
 */
/** How a clause is put: only `assertive` clauses can record facts. */
export type Modality = "assertive" | "hedged" | "uncertain" | "question" | "hypothetical" | "negated-belief";

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

export const NOT_CONTRACTIONS: Record<string, string> = {
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

export const PRONOUN_CONTRACTIONS: [RegExp, string][] = [
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

export function words(text: string): string[] {
  return text.replace(/[,.;!?]/g, " ").split(" ").filter(Boolean);
}

export const NEGATORS = new Set(["not", "never", "no"]);

/**
 * Finds `phrase` as whole words. When `respectNegation` is set, an
 * occurrence preceded (within two words) by a negator is ignored — so
 * "it is not silent" doesn't count as silence.
 */
export function hasPhrase(text: string, phrase: string, respectNegation = false): boolean {
  return findPhrase(words(text), words(phrase), respectNegation ? "unnegated" : "any") >= 0;
}

/** Index of the first matching occurrence, filtered by negation, or -1. */
export function findPhrase(tokens: string[], target: string[], mode: "any" | "unnegated" | "negated", from = 0): number {
  if (target.length === 0) return -1;
  for (let i = from; i + target.length <= tokens.length; i++) {
    if (!target.every((w, j) => tokens[i + j] === w)) continue;
    if (mode === "any") return i;
    const negated = isNegatedAt(tokens, i) && !NEGATORS.has(target[0]!) && target[0] !== "nothing";
    if ((mode === "negated") === negated) return i;
  }
  return -1;
}

export function isNegatedAt(tokens: string[], index: number): boolean {
  return tokens.slice(Math.max(0, index - 2), index).some((w) => w === "not" || w === "never" || w === "no");
}

export function hasAny(text: string, phrases: readonly string[], respectNegation = false): boolean {
  return phrases.some((p) => hasPhrase(text, p, respectNegation));
}

export const FILLERS = new Set(["well", "um", "umm", "erm", "er", "uh", "uhh", "oh", "ok", "okay", "so", "hmm", "right"]);

export const STANCE_WORDS = new Set(["yes", "yeah", "yep", "yup", "no", "nope", "nah"]);
export const PRONOUN_STARTS = new Set(["it", "that", "there", "i", "we", "they", "its", "this"]);
export const CORRECTION_WORDS = new Set(["sorry", "actually", "wait", "oops", "rather"]);
export const NO_NOUNS = new Set(["sound", "audio", "music", "signal", "power", "light", "lights", "idea", "one", "change", "changes", "response", "picture", "noise", "output", "level", "levels", "meter", "meters", "movement", "song", "track", "playback", "need", "problem"]);

/**
 * Split a clause where a second answer word starts a new answer without
 * punctuation ("yes no", "yes sorry no it's not"). "no" followed by a noun
 * ("no sound", "no idea", "no one") is a description and is not split.
 */
export function splitUnpunctuated(clause: string): string[] {
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

export function splitSubclauses(sentence: string): string[] {
  return sentence
    .split(/,+|\s(?:but|although|though|however|and|so)\s/)
    .map((c) => c.trim())
    .filter(Boolean)
    .flatMap(splitUnpunctuated);
}

export function splitClauses(normalised: string): string[] {
  return splitSubclauses(normalised.replace(/[.;!?]+/g, ","));
}

/** Clauses that close a sentence ending in "?". */
export function questionClauses(normalised: string): Set<string> {
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

export function stripFillers(clause: string): string {
  const tokens = words(clause);
  while (tokens.length > 1 && FILLERS.has(tokens[0]!)) tokens.shift();
  return tokens.join(" ");
}

/**
 * Politeness that changes nothing ("sorry", "hang on a sec", "bear with me").
 * RT-QA-002B: "We're off air, sorry" must not erase the report.
 */
export const POLITE_ONLY = /^(sorry|so sorry|really sorry|sorry about that|sorry about this|sorry to bother you|sorry for the trouble|hang on|hang on a (sec|second|minute|moment|tick)|hold on|hold on a (sec|second|minute|moment)|one (sec|second|minute|moment)|just a (sec|second|minute|moment)|a (sec|second|minute|moment)|bear with me|wait|wait a (sec|second|minute|moment)|please|thanks|thank you|cheers|help)?$/;

export function isPoliteOnly(clause: string): boolean {
  return POLITE_ONLY.test(stripFillers(clause));
}


/* ------------------------------------------------------------------ */
/* Modality (RT-QA-002B)                                               */
/* ------------------------------------------------------------------ */

export const QUESTION_START =
  /^(are|is|was|were|am|do|does|did|has|have|had|can|could|will|would|should|shall|might|may) (we|it|they|you|i|the|there|that|this|he|she|my|our|your|anything|something|everything|nothing|anyone|someone|anybody|somebody)\b|^(what|why|how|where|who|which)\b/;
export const HYPOTHETICAL = /^(what if|if|in case|suppose|supposing|imagine|unless|in the event)\b|\b(what (should|do|would|shall) (i|we) do|what happens|what would happen) (if|when)\b|\b(if|in case) (we|it|the station|there|the)\b/;
export const UNCERTAIN_IF = /\b(not sure|unsure|wonder|know|tell|check|see|ask) (if|whether)\b/;
export const STRONG_UNCERTAIN = ["maybe", "perhaps", "possibly", "might", "may be", "may have", "could be", "could have", "not sure", "unsure", "do not know", "no idea", "can not tell", "not certain", "i wonder", "whether", "dunno", "no clue", "hard to say"];
export const NEGATED_BELIEF = /\b(do not|did not) (think|believe|reckon)\b|\b(i doubt|doubt it|doubt that|not convinced)\b/;
export const WEAK_HEDGES = ["i think", "i believe", "probably", "i guess", "i reckon", "i suppose", "seems", "seems like", "looks like", "sounds like"];

export function clauseModality(rawClause: string, questions: Set<string>): Modality {
  const clause = stripStanceLead(stripFillers(rawClause));
  if (HYPOTHETICAL.test(clause) && !UNCERTAIN_IF.test(clause)) return "hypothetical";
  if (questions.has(rawClause) || QUESTION_START.test(clause)) return "question";
  if (NEGATED_BELIEF.test(clause)) return "negated-belief";
  if (hasAny(clause, STRONG_UNCERTAIN)) return "uncertain";
  if (hasAny(clause, WEAK_HEDGES)) return "hedged";
  return "assertive";
}

/** "yes it is…" → "it is…", so a leading answer word doesn't hide the clause's form. */
export function stripStanceLead(clause: string): string {
  const tokens = words(clause);
  while (tokens.length > 1 && (STANCE_WORDS.has(tokens[0]!) || FILLERS.has(tokens[0]!))) tokens.shift();
  return tokens.join(" ");
}
