import type { ArticleSection, SourceReference } from "@/types";

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

/**
 * The manual source that earns a section its label: the section must itself be
 * manufacturer-documented, and cite a source that has a manual label.
 */
export function sectionManualSource(
  section: Pick<ArticleSection, "status" | "sourceIds">,
  sources: SourceReference[],
): SourceReference | undefined {
  if (section.status !== "manufacturer-documented") return undefined;
  return (section.sourceIds ?? []).flatMap((id) => sources.filter((s) => s.id === id)).find((s) => manualLabel(s) !== null);
}
