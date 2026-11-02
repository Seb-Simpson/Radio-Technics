import { articles as allArticles } from "@/data/articles";
import { getEquipmentById } from "@/lib/content/equipment";
import type { ArticleType, KnowledgeArticle, VerificationStatus } from "@/types";

export interface ArticleFilters {
  query?: string;
  type?: ArticleType | "all";
  status?: VerificationStatus | "all";
  equipmentId?: string;
}

export function getArticles(): KnowledgeArticle[] {
  return allArticles;
}

export function getArticleById(id: string): KnowledgeArticle | undefined {
  return allArticles.find((article) => article.id === id);
}

export function getArticlesForEquipment(equipmentId: string): KnowledgeArticle[] {
  return allArticles.filter((article) => article.equipmentIds.includes(equipmentId));
}

export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreArticle(article: KnowledgeArticle, terms: string[]): number {
  if (terms.length === 0) return 1;
  const title = normaliseText(article.title);
  const summary = normaliseText(article.summary);
  const keywords = normaliseText(article.keywords.join(" "));
  const equipmentText = normaliseText(
    article.equipmentIds
      .map((id) => getEquipmentById(id))
      .flatMap((record) => (record ? [record.name, ...record.aliases] : []))
      .join(" "),
  );
  const body = normaliseText(article.sections.flatMap((s) => [s.heading, ...s.body]).join(" "));

  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (title.includes(term)) termScore += 5;
    if (keywords.includes(term)) termScore += 4;
    if (summary.includes(term)) termScore += 3;
    if (equipmentText.includes(term)) termScore += 2;
    if (body.includes(term)) termScore += 1;
    // Every term must match somewhere for the article to be included.
    if (termScore === 0) return 0;
    score += termScore;
  }
  return score;
}

/** Filter and rank articles. Ranking is stable for equal scores. */
export function searchArticles(filters: ArticleFilters = {}, source: KnowledgeArticle[] = allArticles): KnowledgeArticle[] {
  const terms = normaliseText(filters.query ?? "").split(" ").filter((t) => t.length > 1);
  return source
    .filter((a) => !filters.type || filters.type === "all" || a.type === filters.type)
    .filter((a) => !filters.status || filters.status === "all" || a.status === filters.status)
    .filter((a) => !filters.equipmentId || a.equipmentIds.includes(filters.equipmentId))
    .map((article, index) => ({ article, index, score: scoreArticle(article, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.article);
}
