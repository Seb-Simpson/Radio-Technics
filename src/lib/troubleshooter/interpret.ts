import { getAllEquipment } from "@/lib/content/equipment";
import { normaliseText } from "@/lib/knowledge/search";
import type { EquipmentRecord } from "@/types";

/**
 * Deterministic interpretation of free-text problem descriptions.
 *
 * This is deliberately simple keyword matching for the RT-001 prototype. A
 * future AI interpreter should return the same `Interpretation` shape so the
 * engine and UI do not need to change.
 */
export type Interpretation =
  | { kind: "cable" }
  | { kind: "hearing" }
  | { kind: "equipment"; equipmentId: string }
  | { kind: "ambiguous"; equipmentIds: string[] }
  | { kind: "vague" }
  | { kind: "unknown" };

export interface EquipmentMatch {
  equipmentIds: string[];
  score: number;
}

const CABLE_PATTERN = /\b(wire|wires|cable|cables|lead|leads|plug|plugged|unplugged|disconnected|connector|socket)\b/;
const HEARING_PATTERN = /\b(can't hear|cant hear|cannot hear|can not hear|no sound|no audio|silent|silence|dead air|nothing coming out)\b/;
const COMPLAINT_PATTERN =
  /\b(not|isn't|isnt|won't|wont|doesn't|doesnt|didn't|didnt|can't|cant|cannot|broken|broke|stopped|dead|wrong|problem|issue|fault|faulty|nothing|stuck|frozen)\b/;

/** Words that carry no information about *which* thing is wrong. */
const FILLER = new Set(
  (
    "a an the it it's its this that thing things one my our is are was were be been being has have had " +
    "not isn't isnt won't wont doesn't doesnt didn't didnt can't cant cannot do does doing done anything " +
    "something nothing working work works worked broken broke stopped dead wrong problem issue fault faulty " +
    "stuck frozen responding respond happening happen happens at all just still again now i me i'm im think " +
    "please help there here any with of to and or but so really seems seem anymore any more right properly " +
    "going on what's whats up oh hi hello hey"
  ).split(" "),
);

/**
 * Find equipment whose aliases appear as whole phrases in the text.
 * The longest matching alias wins; ties are returned together as ambiguous.
 */
export function matchEquipment(
  text: string,
  candidates: EquipmentRecord[] = getAllEquipment(),
): EquipmentMatch {
  const padded = ` ${normaliseText(text)} `;
  let best = 0;
  let ids: string[] = [];
  for (const record of candidates) {
    let recordScore = 0;
    for (const alias of record.aliases) {
      if (padded.includes(` ${normaliseText(alias)} `)) recordScore = Math.max(recordScore, alias.length);
    }
    if (recordScore === 0) continue;
    if (recordScore > best) {
      best = recordScore;
      ids = [record.id];
    } else if (recordScore === best) {
      ids.push(record.id);
    }
  }
  return { equipmentIds: ids, score: best };
}

export function interpret(text: string): Interpretation {
  const normalised = normaliseText(text);
  if (CABLE_PATTERN.test(normalised)) return { kind: "cable" };

  const match = matchEquipment(normalised);
  const [first] = match.equipmentIds;
  if (match.equipmentIds.length === 1 && first) return { kind: "equipment", equipmentId: first };
  if (match.equipmentIds.length > 1) return { kind: "ambiguous", equipmentIds: match.equipmentIds };

  if (HEARING_PATTERN.test(normalised)) return { kind: "hearing" };

  const informativeWords = normalised.split(" ").filter((word) => word && !FILLER.has(word));
  if (COMPLAINT_PATTERN.test(normalised) && informativeWords.length === 0) return { kind: "vague" };
  return { kind: "unknown" };
}

/** True if any of the phrases appears as a whole phrase in the text. */
export function containsPhrase(text: string, phrases: string[]): boolean {
  const padded = ` ${normaliseText(text)} `;
  return phrases.some((phrase) => {
    const p = normaliseText(phrase);
    return p.length > 0 && padded.includes(` ${p} `);
  });
}
