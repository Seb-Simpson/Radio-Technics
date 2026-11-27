import { getEquipmentById } from "@/lib/content/equipment";
import { getArticleById } from "@/lib/knowledge/search";
import { manualLabel } from "@/lib/knowledge/manual-label";
import type { KnowledgeArticle, SourceReference } from "@/types";

export interface ManualPointer {
  article: KnowledgeArticle;
  source: SourceReference;
  label: string;
}

/**
 * Articles related to the given equipment whose quick answer cites a source that earns a manual label.
 * Information only: IDs in, links out. Unknown IDs are skipped.
 */
export function manualPointersForEquipment(equipmentIds: Array<string | null | undefined>): ManualPointer[] {
  const seen = new Set<string>();
  const pointers: ManualPointer[] = [];
  for (const equipmentId of equipmentIds) {
    const equipment = getEquipmentById(equipmentId);
    if (!equipment) continue;
    for (const articleId of equipment.relatedArticleIds) {
      if (seen.has(articleId)) continue;
      seen.add(articleId);
      const article = getArticleById(articleId);
      const quick = article?.quickAnswer;
      if (!article || !quick) continue;
      const source = quick.sourceIds
        .flatMap((id) => article.sources.filter((s) => s.id === id))
        .find((s) => manualLabel(s) !== null);
      const label = source ? manualLabel(source) : null;
      if (source && label) pointers.push({ article, source, label });
    }
  }
  return pointers;
}

/** "What the manual says" when every item is a manual; otherwise the wider wording (e.g. a product page). */
export function manualPointersHeading(pointers: ManualPointer[]): string {
  return pointers.every((p) => p.source.documentType !== "product-page") ? "What the manual says" : "What the maker's documentation says";
}
