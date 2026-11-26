import { articles } from "@/data/articles";
import { equipment, equipmentCategories } from "@/data/equipment";
import { hotspots } from "@/data/hotspots";
import { demoLayoutView, studioPhotos } from "@/data/studio-views";
import { flowNodes, troubleshootingTopics } from "@/data/troubleshooting-flows";
import { glossary } from "@/data/glossary";
import type { FlowNode, TroubleshootingTopic } from "@/lib/troubleshooter/types";
import type { AudioClaim } from "@/lib/troubleshooter/understand";
import type { GlossaryTerm, SourceKind } from "@/types";
import type { EquipmentRecord, Fact, Hotspot, KnowledgeArticle, ReviewRecord, StudioView, VerificationStatus } from "@/types";
import { QUICK_ANSWER_MAX_WORDS } from "@/lib/knowledge/manual-label";
import { validateRegion } from "./geometry";

export interface ContentIssue {
  area: "equipment" | "views" | "hotspots" | "articles" | "flows" | "topics" | "glossary";
  message: string;
}

export interface ContentBundle {
  equipment: EquipmentRecord[];
  views: StudioView[];
  hotspots: Hotspot[];
  articles: KnowledgeArticle[];
  flowNodes: FlowNode[];
  topics: TroubleshootingTopic[];
  glossary: GlossaryTerm[];
}

export const defaultContent: ContentBundle = {
  equipment,
  views: [...studioPhotos, demoLayoutView],
  hotspots,
  articles,
  flowNodes,
  topics: troubleshootingTopics,
  glossary,
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES: readonly VerificationStatus[] = ["verified", "manufacturer-documented", "station-reported", "draft"];
const AUDIO_CLAIMS: readonly AudioClaim[] = ["present", "absent"];
const ASSERT_SUBJECTS: readonly string[] = ["movement", "worked-earlier", "found"];
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
    ["glossary", content.glossary.map((t) => t.id)],
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
  const topicIds = new Set(content.topics.map((t) => t.id));
  const glossaryIds = new Set(content.glossary.map((t) => t.id));
  const SOURCE_KINDS: readonly SourceKind[] = ["manufacturer", "station", "photograph", "engineer", "development-team"];
  for (const article of content.articles) {
    const a = (messages: string[]) => add("articles", messages);
    for (const equipmentId of article.equipmentIds) {
      if (!equipmentIds.has(equipmentId)) a([`${article.id} references missing equipment "${equipmentId}"`]);
    }
    a(checkVerification(article.id, article.status, article.review, now));
    if (article.category !== "general" && !categoryIds.has(article.category)) a([`${article.id} has unknown category "${article.category}"`]);

    // Sources: each must be well-formed; manufacturer sources only count once actually read.
    const sourceById = new Map(article.sources.map((src) => [src.id, src]));
    if (article.sources.length === 0) a([`${article.id} has no sources`]);
    for (const id of duplicates(article.sources.map((src) => src.id))) a([`${article.id} lists source "${id}" twice`]);
    for (const src of article.sources) {
      if (!SOURCE_KINDS.includes(src.kind)) a([`${article.id} source "${src.id}" has unknown kind "${String(src.kind)}"`]);
      if (src.url !== undefined && !/^(https:\/\/|\/)/.test(src.url)) a([`${article.id} source "${src.id}" must use an https:// or site-relative URL`]);
      if (src.kind === "manufacturer" && !src.url) a([`${article.id} manufacturer source "${src.id}" needs its official URL`]);
      if (src.retrievedOn !== null && (!isValidIsoDate(src.retrievedOn) || src.retrievedOn > todayIso(now))) {
        a([`${article.id} source "${src.id}" has an invalid retrieval date`]);
      }
      if (!isMeaningfulProvenance(src.publisher)) a([`${article.id} source "${src.id}" needs a meaningful publisher`]);
    }
    const citesReadManufacturer = (ids: string[] | undefined) =>
      (ids ?? []).some((id) => sourceById.get(id)?.kind === "manufacturer" && sourceById.get(id)?.retrievedOn !== null);

    article.sections.forEach((section, i) => {
      const label = `${article.id} section ${i + 1} ("${section.heading}")`;
      a(checkVerification(label, section.status, section.review ?? (section.status === "verified" ? article.review : undefined), now));
      if (article.status === "verified" && section.status !== "verified") a([`${article.id} is marked verified but ${label} is not`]);
      if (section.body.length === 0) a([`${label} is empty`]);
      for (const id of section.sourceIds ?? []) {
        if (!sourceById.has(id)) a([`${label} cites source "${id}" that the article doesn't list`]);
      }
      // Manufacturer authority needs a manufacturer source that someone has actually read.
      if (section.status === "manufacturer-documented" && !citesReadManufacturer(section.sourceIds)) {
        a([`${label} is marked manufacturer-documented but cites no manufacturer source that has been read`]);
      }
    });
    if (article.status === "manufacturer-documented" && !article.sections.some((sec) => citesReadManufacturer(sec.sourceIds))) {
      a([`${article.id} is marked manufacturer-documented but cites no manufacturer source that has been read`]);
    }

    const quick = article.quickAnswer;
    if (quick) {
      const qa = `${article.id} quick answer`;
      if (quick.text.trim().split(/\s+/).filter(Boolean).length > QUICK_ANSWER_MAX_WORDS) {
        a([`${qa} is longer than ${QUICK_ANSWER_MAX_WORDS} words`]);
      }
      for (const id of quick.sourceIds) {
        if (!sourceById.has(id)) a([`${qa} cites unknown source "${id}"`]);
      }
      if (quick.status === "manufacturer-documented") {
        if (!citesReadManufacturer(quick.sourceIds)) a([`${qa} is marked manufacturer-documented but cites a manufacturer source that hasn't been read`]);
        if (article.kind === "approved-procedure") a([`${article.id} is an approved procedure; its quick answer cannot be manufacturer-documented`]);
      }
      a(checkVerification(qa, quick.status, quick.status === "verified" ? article.review : undefined, now));
    }

    // Only engineer-approved content may be presented as a procedure.
    if (article.kind === "approved-procedure") {
      if (article.status !== "verified" || !article.review) a([`${article.id} is an approved procedure but is not engineer-verified with a review`]);
      if (article.sections.some((sec) => sec.status !== "verified")) a([`${article.id} is an approved procedure but contains sections that are not engineer-verified`]);
    }

    for (const q of article.diagnosticQuestions) if (!q.trim().endsWith("?")) a([`${article.id} diagnostic question is not a question: "${q}"`]);
    for (const id of article.relatedArticleIds) {
      if (id === article.id) a([`${article.id} lists itself as related`]);
      else if (!articleIds.has(id)) a([`${article.id} links to missing related article "${id}"`]);
    }
    for (const id of article.relatedTopicIds) if (!topicIds.has(id)) a([`${article.id} links to missing troubleshooting topic "${id}"`]);
    for (const id of article.glossaryTermIds) if (!glossaryIds.has(id)) a([`${article.id} links to missing glossary term "${id}"`]);
    if (article.software && article.software.versions.length === 0) a([`${article.id} names software without versions`]);
    if (article.revisions.length === 0) a([`${article.id} has no version history`]);
    article.revisions.forEach((rev, i) => {
      if (!isValidIsoDate(rev.date) || rev.date > todayIso(now)) a([`${article.id} revision ${i + 1} has an invalid date`]);
      if (i > 0 && rev.date < article.revisions[i - 1]!.date) a([`${article.id} revisions are out of order`]);
      if (!isMeaningfulProvenance(rev.author)) a([`${article.id} revision ${i + 1} needs a meaningful author`]);
    });
  }

  /* Glossary */
  for (const term of content.glossary) {
    // Glossary terms carry no review records, so they cannot claim engineer or manufacturer authority yet.
    if (term.status === "verified" || term.status === "manufacturer-documented") {
      add("glossary", [`${term.id} cannot be "${term.status}" without review records or cited manufacturer sources`]);
    }
    if (!term.definition.trim()) add("glossary", [`${term.id} has no definition`]);
    if (!isMeaningfulProvenance(term.source)) add("glossary", [`${term.id} needs a meaningful source`]);
    for (const id of term.relatedEquipmentIds) if (!equipmentIds.has(id)) add("glossary", [`${term.id} references missing equipment "${id}"`]);
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
      // RT-002D answer schema.
      if (option.asserts !== undefined) {
        if (!ASSERT_SUBJECTS.includes(option.asserts.subject) || typeof option.asserts.value !== "boolean") {
          add("flows", [`${node.id} option "${option.id}" has an invalid assertion`]);
        }
        if (option.audio !== undefined) add("flows", [`${node.id} option "${option.id}" asserts about sound twice (audio and asserts)`]);
      }
      if (option.restate !== undefined && (typeof option.restate !== "string" || option.restate.trim().length < 5)) {
        add("flows", [`${node.id} option "${option.id}" has an empty restatement`]);
      }
    }
    if (node.kind === "question") {
      // Two options making the same claim would make interpretations ambiguous.
      const claims = node.options.map((o) => (o.audio ? `sound:${o.audio}` : o.asserts ? `${o.asserts.subject}:${o.asserts.value}` : null)).filter(Boolean);
      if (new Set(claims).size !== claims.length) add("flows", [`${node.id} has two options making the same claim`]);
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
