import { articles } from "@/data/articles";
import { equipment, equipmentCategories } from "@/data/equipment";
import { hotspots } from "@/data/hotspots";
import { demoLayoutView, studioPhotos } from "@/data/studio-views";
import { flowNodes, troubleshootingTopics } from "@/data/troubleshooting-flows";
import type { FlowNode, TroubleshootingTopic } from "@/lib/troubleshooter/types";
import type { AudioClaim } from "@/lib/troubleshooter/understand";
import type { EquipmentRecord, Fact, Hotspot, KnowledgeArticle, ReviewRecord, StudioView, VerificationStatus } from "@/types";
import { validateRegion } from "./geometry";

export interface ContentIssue {
  area: "equipment" | "views" | "hotspots" | "articles" | "flows" | "topics";
  message: string;
}

export interface ContentBundle {
  equipment: EquipmentRecord[];
  views: StudioView[];
  hotspots: Hotspot[];
  articles: KnowledgeArticle[];
  flowNodes: FlowNode[];
  topics: TroubleshootingTopic[];
}

export const defaultContent: ContentBundle = {
  equipment,
  views: [...studioPhotos, demoLayoutView],
  hotspots,
  articles,
  flowNodes,
  topics: troubleshootingTopics,
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES: readonly VerificationStatus[] = ["verified", "station-reported", "draft"];
const AUDIO_CLAIMS: readonly AudioClaim[] = ["present", "absent"];
/** Values that look like an entry but carry no information. */
const PLACEHOLDER = /^(tbc|tbd|tba|unknown|n\/?a|none|nil|null|test|testing|todo|pending|placeholder|see above|same|various|misc|other|x+|\?+|-+|\.+|engineer|the engineer|station engineer|staff|someone|me)$/i;

/**
 * Provenance must say where something came from in words a person could
 * follow up. Placeholders ("TBC", "n/a", "---") and one-word stubs fail.
 * Note: this checks that the evidence is meaningfully recorded; it cannot
 * prove that an engineer really approved anything.
 */
export function isMeaningfulProvenance(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (PLACEHOLDER.test(text)) return false;
  const words = text.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  return words.length >= 2 && text.replace(/[^a-z]/gi, "").length >= 6;
}

/** A reviewer must be identifiable: a name, or a name with a role — not a bare role or placeholder. */
function isIdentifiableReviewer(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text.length >= 2 && !PLACEHOLDER.test(text) && /[a-z]{2,}/i.test(text);
}
const PHOTO_SRC = /^\/studio\/photos\/[a-z0-9-]+\.(jpe?g|png|webp)$/;
const EARLIEST_REVIEW = "2020-01-01";

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30, "yesterday", etc.). */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Problems with a review record. `now` is injectable for tests. */
export function validateReview(review: unknown, now: Date = new Date()): string[] {
  if (typeof review !== "object" || review === null) return ["review record is missing"];
  const r = review as Partial<ReviewRecord>;
  const errors: string[] = [];
  if (!isIdentifiableReviewer(r.reviewer)) {
    errors.push("review needs the reviewer's name or role");
  }
  if (!isValidIsoDate(r.date)) errors.push("review date must be a real date in YYYY-MM-DD format");
  else if (r.date > todayIso(now)) errors.push("review date is in the future");
  else if (r.date < EARLIEST_REVIEW) errors.push("review date is implausibly early");
  if (!isMeaningfulProvenance(r.source)) errors.push("review needs a meaningful source describing how it was confirmed (not a placeholder such as TBC or n/a)");
  return errors;
}

/**
 * Something may only be `verified` with a valid review. Nothing in the app
 * promotes content automatically: a status only changes when a person edits
 * the data, and this check then requires the evidence.
 */
function checkVerification(
  label: string,
  status: unknown,
  review: unknown,
  now: Date,
): string[] {
  if (!STATUSES.includes(status as VerificationStatus)) return [`${label} has an unknown verification status "${String(status)}"`];
  if (status === "verified") return validateReview(review, now).map((e) => `${label} is marked verified but its ${e}`);
  if (review !== undefined) return validateReview(review, now).map((e) => `${label} has an invalid review: ${e}`);
  return [];
}

function checkFact(label: string, fact: Fact, now: Date): string[] {
  const issues = checkVerification(label, fact.status, fact.review, now);
  if (!fact.text?.trim()) issues.push(`${label} has no text`);
  if (fact.status === "station-reported" && !fact.source?.trim()) issues.push(`${label} is station-reported but has no source`);
  else if (fact.source !== undefined && !isMeaningfulProvenance(fact.source)) issues.push(`${label} has a placeholder source "${fact.source}"`);
  return issues;
}

/**
 * Check that every cross-reference and every trust claim in the content is
 * sound. Used by the unit tests and shown on the Administration page.
 */
export function validateContent(content: ContentBundle = defaultContent, now: Date = new Date()): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (area: ContentIssue["area"], messages: string[]) => messages.forEach((message) => issues.push({ area, message }));

  const equipmentIds = new Set(content.equipment.map((e) => e.id));
  const viewIds = new Set(content.views.map((v) => v.id));
  const articleIds = new Set(content.articles.map((a) => a.id));
  const nodeIds = new Set(content.flowNodes.map((n) => n.id));
  const categoryIds = new Set(equipmentCategories.map((c) => c.id));

  const groups: [ContentIssue["area"], string[]][] = [
    ["equipment", content.equipment.map((e) => e.id)],
    ["views", content.views.map((v) => v.id)],
    ["hotspots", content.hotspots.map((h) => h.id)],
    ["articles", content.articles.map((a) => a.id)],
    ["flows", content.flowNodes.map((n) => n.id)],
    ["topics", content.topics.map((t) => t.id)],
  ];
  for (const [area, ids] of groups) {
    for (const id of duplicates(ids)) issues.push({ area, message: `Duplicate ID "${id}"` });
    for (const id of ids) if (!ID_PATTERN.test(id)) issues.push({ area, message: `ID "${id}" is not kebab-case` });
  }

  /* Equipment */
  for (const record of content.equipment) {
    if (!categoryIds.has(record.category)) add("equipment", [`${record.id} has unknown category "${record.category}"`]);
    add("equipment", checkFact(`${record.id} primary function`, record.primaryFunction, now));
    record.knownInformation.forEach((fact, i) => add("equipment", checkFact(`${record.id} fact ${i + 1}`, fact, now)));
    for (const articleId of record.relatedArticleIds) {
      if (!articleIds.has(articleId)) add("equipment", [`${record.id} links to missing article "${articleId}"`]);
    }
    if (record.flowEntryNodeId && !nodeIds.has(record.flowEntryNodeId)) {
      add("equipment", [`${record.id} links to missing flow node "${record.flowEntryNodeId}"`]);
    }
    if (record.aliases.length === 0) add("equipment", [`${record.id} has no aliases`]);
  }

  /* Views */
  for (const view of content.views) {
    if (!Number.isInteger(view.width) || !Number.isInteger(view.height) || view.width <= 0 || view.height <= 0) {
      add("views", [`${view.id} has invalid dimensions`]);
    }
    if (view.kind === "photo") {
      if (!view.src) add("views", [`${view.id} is a photo with no src`]);
      else if (!PHOTO_SRC.test(view.src)) add("views", [`${view.id} src must be a file in /studio/photos/`]);
      if (view.illustrative) add("views", [`${view.id} is a photo but marked illustrative`]);
    }
    if (!view.alt.trim()) add("views", [`${view.id} has no alt text`]);
  }

  /* Hotspots */
  for (const hotspot of content.hotspots) {
    if (!equipmentIds.has(hotspot.equipmentId)) add("hotspots", [`${hotspot.id} references missing equipment "${hotspot.equipmentId}"`]);
    if (!viewIds.has(hotspot.viewId)) add("hotspots", [`${hotspot.id} references missing view "${hotspot.viewId}"`]);
    add("hotspots", validateRegion(hotspot.region).map((e) => `${hotspot.id}: ${e}`));
    add("hotspots", checkVerification(`${hotspot.id} identity`, hotspot.identity, hotspot.review, now));
    const view = content.views.find((v) => v.id === hotspot.viewId);
    if (view?.illustrative && !hotspot.placeholder) add("hotspots", [`${hotspot.id} is on an illustrative view but not marked as a placeholder`]);
  }

  /* Articles */
  for (const article of content.articles) {
    for (const equipmentId of article.equipmentIds) {
      if (!equipmentIds.has(equipmentId)) add("articles", [`${article.id} references missing equipment "${equipmentId}"`]);
    }
    add("articles", checkVerification(article.id, article.status, article.review, now));
    article.sections.forEach((section, i) => {
      const label = `${article.id} section ${i + 1} ("${section.heading}")`;
      add("articles", checkVerification(label, section.status, section.review ?? (section.status === "verified" ? article.review : undefined), now));
      if (article.status === "verified" && section.status !== "verified") {
        add("articles", [`${article.id} is marked verified but ${label} is not`]);
      }
      if (section.body.length === 0) add("articles", [`${label} is empty`]);
    });
  }

  /* Flows */
  for (const node of content.flowNodes) {
    for (const option of node.options) {
      if (!nodeIds.has(option.next)) add("flows", [`${node.id} option "${option.id}" leads to missing node "${option.next}"`]);
      if (option.setEquipmentId && !equipmentIds.has(option.setEquipmentId)) {
        add("flows", [`${node.id} option "${option.id}" sets missing equipment "${option.setEquipmentId}"`]);
      }
      if (option.audio !== undefined && !AUDIO_CLAIMS.includes(option.audio)) {
        add("flows", [`${node.id} option "${option.id}" has unknown audio claim "${String(option.audio)}"`]);
      }
    }
    if (node.kind === "question") {
      if (!node.unsureNext) add("flows", [`${node.id} has no "I'm not sure" route`]);
      else if (!nodeIds.has(node.unsureNext)) add("flows", [`${node.id} "I'm not sure" leads to missing node "${node.unsureNext}"`]);
      if (node.options.length === 0) add("flows", [`${node.id} is a question with no answers`]);
      const answers = node.options.map((o) => o.answer).filter(Boolean);
      if (new Set(answers).size !== answers.length) add("flows", [`${node.id} has two options with the same yes/no meaning`]);
      // Two yes/no options asserting the same thing about sound would make typed replies ambiguous.
      const yes = node.options.find((o) => o.answer === "yes");
      const no = node.options.find((o) => o.answer === "no");
      if (yes?.audio && no?.audio && yes.audio === no.audio) add("flows", [`${node.id} yes and no options assert the same about sound`]);
    }
    if (node.showEquipmentId && !equipmentIds.has(node.showEquipmentId)) {
      add("flows", [`${node.id} shows missing equipment "${node.showEquipmentId}"`]);
    }
  }

  /* Topics */
  for (const topic of content.topics) {
    if (!topic.utterance.trim()) add("topics", [`${topic.id} has no utterance`]);
  }

  return issues;
}
