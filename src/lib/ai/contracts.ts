/**
 * RT-004 AI contract (not yet connected to any model).
 *
 * A future language model may only PROPOSE: a reply, cited articles and
 * workspace commands. Everything it returns is untrusted and passes through
 * the deterministic safety layer below, which runs the same way whether or not
 * a model is present:
 *
 *   1. `preModelSafety` classifies the presenter's text BEFORE any model call
 *      (silence on air, restart/unplug questions). Those paths answer from
 *      fixed text and never wait on, or depend on, a model.
 *   2. `guardModelProposal` checks the model's output AFTER the call: commands
 *      must pass `validateWorkspaceCommands`, cited articles must exist, and a
 *      reply may only give operating instructions when it cites an
 *      engineer-verified approved procedure. Otherwise the safe reply is used.
 *
 * Credentials for any model provider must stay server-side (a Next.js route
 * handler reading an environment variable); nothing here runs a network call.
 */
import { getArticleById } from "@/lib/knowledge/search";
import type { SearchResponse } from "@/lib/knowledge/search-engine";
import { PROCEDURE_REPLY } from "@/lib/troubleshooter/engine";
import { understand } from "@/lib/troubleshooter/understand";
import { validateWorkspaceCommands, type WorkspaceCommand } from "@/lib/workspace/commands";
import type { KnowledgeArticle } from "@/types";

export const URGENT_REPLY =
  "If listeners may be hearing silence, treat it as urgent: contact technical support now. I'll keep a note of what you've told me for them.";

/** What a server route would send to a model. Built only from local, validated data. */
export interface AssistantRequest {
  message: string;
  selectedEquipmentId: string | null;
  /** Articles found by the local retriever; the model may only cite these. */
  retrieved: Pick<SearchResponse, "articles" | "interpretations">;
}

/** What a model returns. Treated as untrusted input. */
export interface ModelProposal {
  reply: string;
  citedArticleIds: string[];
  commands: unknown[];
  /** The model must set this when its reply tells the presenter to operate equipment. */
  givesInstructions: boolean;
}

export interface PreModelDecision {
  urgent: boolean;
  /** When set, reply with this fixed text and do not call a model. */
  fixedReply: string | null;
}

export function preModelSafety(text: string): PreModelDecision {
  const u = understand(text);
  if (u.clearAirSilence || u.signals.includes("silence")) return { urgent: true, fixedReply: URGENT_REPLY };
  if (u.procedureQuestion) return { urgent: false, fixedReply: PROCEDURE_REPLY };
  return { urgent: false, fixedReply: null };
}

export interface GuardedReply {
  reply: string;
  citedArticles: KnowledgeArticle[];
  commands: WorkspaceCommand[];
  /** Everything removed or replaced, for logging and engineer review. */
  rejected: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApprovedProcedure(article: KnowledgeArticle): boolean {
  return article.kind === "approved-procedure" && article.status === "verified" && article.review !== undefined;
}

/**
 * Validate a model's proposal. Never throws; malformed output becomes the safe
 * procedure reply with no commands.
 */
export function guardModelProposal(raw: unknown, request: AssistantRequest, pre: PreModelDecision): GuardedReply {
  if (pre.fixedReply) return { reply: pre.fixedReply, citedArticles: [], commands: [], rejected: ["model bypassed by safety layer"] };

  const rejected: string[] = [];
  if (!isRecord(raw) || typeof raw.reply !== "string" || raw.reply.trim() === "") {
    return { reply: PROCEDURE_REPLY, citedArticles: [], commands: [], rejected: ["malformed proposal"] };
  }

  const allowed = new Set(request.retrieved.articles.map((a) => a.article.id));
  const citedArticles: KnowledgeArticle[] = [];
  for (const id of Array.isArray(raw.citedArticleIds) ? raw.citedArticleIds : []) {
    const article = typeof id === "string" && allowed.has(id) ? getArticleById(id) : undefined;
    if (article) citedArticles.push(article);
    else rejected.push(`citation not retrieved or unknown: ${String(id)}`);
  }

  const { commands, errors } = validateWorkspaceCommands(raw.commands ?? []);
  rejected.push(...errors);

  let reply = raw.reply.trim();
  if (raw.givesInstructions !== false && !citedArticles.some(isApprovedProcedure)) {
    rejected.push("instructions without an engineer-approved procedure");
    reply = PROCEDURE_REPLY;
  }
  return { reply, citedArticles, commands, rejected };
}
