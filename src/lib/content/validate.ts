import { articles } from "@/data/articles";
import { equipment } from "@/data/equipment";
import { hotspots } from "@/data/hotspots";
import { demoLayoutView, studioPhotos } from "@/data/studio-views";
import { flowNodes, troubleshootingTopics } from "@/data/troubleshooting-flows";
import type { EquipmentRecord, Hotspot, KnowledgeArticle, StudioView } from "@/types";
import type { FlowNode, TroubleshootingTopic } from "@/lib/troubleshooter/types";

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

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/**
 * Check that every cross-reference in the content resolves.
 * Used by the unit tests and shown on the Administration page.
 */
export function validateContent(content: ContentBundle = defaultContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const equipmentIds = new Set(content.equipment.map((e) => e.id));
  const viewIds = new Set(content.views.map((v) => v.id));
  const articleIds = new Set(content.articles.map((a) => a.id));
  const nodeIds = new Set(content.flowNodes.map((n) => n.id));

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
    for (const id of ids) {
      if (!ID_PATTERN.test(id)) issues.push({ area, message: `ID "${id}" is not kebab-case` });
    }
  }

  for (const record of content.equipment) {
    for (const articleId of record.relatedArticleIds) {
      if (!articleIds.has(articleId)) {
        issues.push({ area: "equipment", message: `${record.id} links to missing article "${articleId}"` });
      }
    }
    if (record.flowEntryNodeId && !nodeIds.has(record.flowEntryNodeId)) {
      issues.push({ area: "equipment", message: `${record.id} links to missing flow node "${record.flowEntryNodeId}"` });
    }
    if (record.aliases.length === 0) {
      issues.push({ area: "equipment", message: `${record.id} has no aliases` });
    }
  }

  for (const view of content.views) {
    if (view.width <= 0 || view.height <= 0) {
      issues.push({ area: "views", message: `${view.id} has invalid dimensions` });
    }
    if (view.kind === "photo" && !view.src) {
      issues.push({ area: "views", message: `${view.id} is a photo with no src` });
    }
  }

  for (const hotspot of content.hotspots) {
    if (!equipmentIds.has(hotspot.equipmentId)) {
      issues.push({ area: "hotspots", message: `${hotspot.id} references missing equipment "${hotspot.equipmentId}"` });
    }
    if (!viewIds.has(hotspot.viewId)) {
      issues.push({ area: "hotspots", message: `${hotspot.id} references missing view "${hotspot.viewId}"` });
    }
    const { x, y, width, height } = hotspot.region;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      issues.push({ area: "hotspots", message: `${hotspot.id} region falls outside the image` });
    }
  }

  for (const article of content.articles) {
    for (const equipmentId of article.equipmentIds) {
      if (!equipmentIds.has(equipmentId)) {
        issues.push({ area: "articles", message: `${article.id} references missing equipment "${equipmentId}"` });
      }
    }
    if (article.status === "verified" && !article.lastReviewed) {
      issues.push({ area: "articles", message: `${article.id} is marked verified but has no review date` });
    }
  }

  for (const node of content.flowNodes) {
    for (const option of node.options) {
      if (!nodeIds.has(option.next)) {
        issues.push({ area: "flows", message: `${node.id} option "${option.id}" leads to missing node "${option.next}"` });
      }
      if (option.setEquipmentId && !equipmentIds.has(option.setEquipmentId)) {
        issues.push({ area: "flows", message: `${node.id} option "${option.id}" sets missing equipment "${option.setEquipmentId}"` });
      }
    }
    if (node.kind === "question") {
      if (!node.unsureNext) issues.push({ area: "flows", message: `${node.id} has no "I'm not sure" route` });
      else if (!nodeIds.has(node.unsureNext)) {
        issues.push({ area: "flows", message: `${node.id} "I'm not sure" leads to missing node "${node.unsureNext}"` });
      }
      if (node.options.length === 0) issues.push({ area: "flows", message: `${node.id} is a question with no answers` });
    }
    if (node.showEquipmentId && !equipmentIds.has(node.showEquipmentId)) {
      issues.push({ area: "flows", message: `${node.id} shows missing equipment "${node.showEquipmentId}"` });
    }
  }

  return issues;
}
