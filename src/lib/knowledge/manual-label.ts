import type { SourceReference } from "@/types";

/** Longest quick answer allowed, in words. Enforced by validateContent. */
export const QUICK_ANSWER_MAX_WORDS = 40;

/**
 * "From the Myriad 6 manual" for a manufacturer source that someone has read
 * and that names its product; otherwise null (no label is shown).
 */
export function manualLabel(source: SourceReference): string | null {
  if (source.kind !== "manufacturer" || source.retrievedOn === null) return null;
  const product = source.product?.trim();
  if (!product) return null;
  return `From the ${product} manual`;
}
