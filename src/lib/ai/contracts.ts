/**
 * RT-004 AI contract (not yet connected to any model). Redesigned in RT-002D-R1.
 *
 * RT-QA-002D showed that filtering model-written prose for operational
 * instructions cannot be made reliable (37 of 42 new instruction texts got
 * past a word list). So model prose is gone from the trusted output channel:
 * a model may only return IDENTIFIERS, and every word the presenter sees is
 * rendered from local templates or approved knowledge-base content.
 *
 * A model may propose exactly one of:
 *   { kind: "clarification", questionId }       → a locally defined question
 *   { kind: "articles", articleIds }            → retrieved knowledge articles
 *   { kind: "procedure", procedureId, procedureVersion }
 *                                               → an engineer-approved procedure
 *   { kind: "fallback", fallbackId }            → a locally defined safe reply
 * (`clarification` and `articles` may also carry workspace `commands`.)
 *
 * Anything else — an unknown kind, an unknown or inherited key, a wrong type,
 * a non-plain object — is rejected before any type-specific field is read.
 * Procedures must be approved, verified, reviewed with a valid record,
 * applicable to the selected equipment, part of this request's retrieval and
 * at the exact version proposed. None exist yet, so every procedure fails.
 *
 * `preModelSafety` still runs before any model call. Credentials for any
 * provider stay server-side; nothing here makes a network call.
 */
import { validateReview } from "@/lib/content/validate";
import { getArticleById } from "@/lib/knowledge/search";
import type { SearchResponse } from "@/lib/knowledge/search-engine";
import { MAX_INPUT_LENGTH, PROCEDURE_REPLY } from "@/lib/troubleshooter/engine";
import { isCurrentConcern } from "@/lib/troubleshooter/safety";
import { understand } from "@/lib/troubleshooter/understand";
import { validateWorkspaceCommands, type WorkspaceCommand } from "@/lib/workspace/commands";
import type { KnowledgeArticle } from "@/types";

export const URGENT_REPLY =
  "If listeners may be hearing silence, treat it as urgent: contact technical support now. I'll keep a note of what you've told me for them.";
export const SUPPORT_REPLY = "Please contact the station's technical support and read them the summary of this conversation.";
export const TOO_LONG_REPLY = "That message is too long to use. Please shorten it. If the station is off air, use the “We're off air” button.";

/** Trusted, locally written clarifying questions. A model can only pick one by ID. */
export const CLARIFICATION_QUESTIONS: ReadonlyMap<string, string> = new Map([
  ["what-do-you-see", "What can you see on the screen right now?"],
  ["which-equipment", "Which piece of equipment is this about?"],
  ["listeners-or-studio", "Is the sound missing for listeners, or only in the studio (headphones or speakers)?"],
  ["since-when", "When did you first notice the problem?"],
  ["what-changed", "Did anything change just before the problem started?"],
]);

/** Trusted, locally written safe replies. */
export const FALLBACK_REPLIES: ReadonlyMap<string, string> = new Map([
  ["safe-default", PROCEDURE_REPLY],
  ["contact-support", SUPPORT_REPLY],
  ["no-approved-procedure", "There's no engineer-approved procedure for this yet. Please contact technical support and read them the summary."],
]);
export const ARTICLES_INTRO = "These articles may help explain what you're seeing. They are information only, not instructions.";
const MAX_ARTICLES = 5;

/** What a server route would send to a model. Built only from local, validated data. */
export interface AssistantRequest {
  message: string;
  selectedEquipmentId: string | null;
  /** Articles found by the local retriever; the model may only cite these. */
  retrieved: Pick<SearchResponse, "articles" | "interpretations">;
}

/** The ONLY shapes a model may return. Treated as untrusted input. */
export type ModelProposal =
  | { kind: "clarification"; questionId: string; commands?: unknown[] }
  | { kind: "articles"; articleIds: string[]; commands?: unknown[] }
  | { kind: "procedure"; procedureId: string; procedureVersion: string }
  | { kind: "fallback"; fallbackId: string };

const SCHEMAS: ReadonlyMap<string, readonly string[]> = new Map([
  ["clarification", ["kind", "questionId", "commands"]],
  ["articles", ["kind", "articleIds", "commands"]],
  ["procedure", ["kind", "procedureId", "procedureVersion"]],
  ["fallback", ["kind", "fallbackId"]],
]);

export interface PreModelDecision {
  urgent: boolean;
  /** When set, reply with this fixed text and do not call a model. */
  fixedReply: string | null;
}

export function preModelSafety(text: string): PreModelDecision {
  if (text.length > MAX_INPUT_LENGTH) return { urgent: false, fixedReply: TOO_LONG_REPLY };
  const u = understand(text);
  if (isCurrentConcern(u.broadcast.status) || u.signals.includes("silence")) return { urgent: true, fixedReply: URGENT_REPLY };
  if (u.procedureQuestion) return { urgent: false, fixedReply: PROCEDURE_REPLY };
  if (u.helpRequest) return { urgent: false, fixedReply: SUPPORT_REPLY };
  return { urgent: false, fixedReply: null };
}

export interface RenderedProcedure {
  id: string;
  version: string;
  title: string;
  /** Rendered from the knowledge base, never from model output. */
  sections: { heading: string; body: string[] }[];
}

export interface GuardedReply {
  kind: "fixed" | "clarification" | "articles" | "procedure" | "fallback";
  /** Always trusted local text (a template, an article title, or a fixed reply). */
  text: string;
  articles: KnowledgeArticle[];
  procedure: RenderedProcedure | null;
  commands: WorkspaceCommand[];
  /** Why anything was refused, for logging and engineer review. */
  rejected: string[];
}

/** Trusted lookup of articles by ID. Defaults to the app's own knowledge base; tests can supply fixtures. */
export type ArticleLookup = (id: string) => KnowledgeArticle | undefined;

/* ------------------------------------------------------------------ */
/* Strict parsing                                                      */
/* ------------------------------------------------------------------ */

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/** A plain JSON object: no arrays, class instances or exotic prototypes. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(v);

/** Parse untrusted model output into a ModelProposal, or explain why not. Never throws. */
export function parseProposal(raw: unknown): { ok: true; proposal: ModelProposal } | { ok: false; reason: string } {
  try {
    if (!isPlainObject(raw)) return { ok: false, reason: "not a plain object" };
    if (!hasOwn(raw, "kind") || typeof raw.kind !== "string") return { ok: false, reason: "missing kind" };
    const allowed = SCHEMAS.get(raw.kind);
    if (!allowed) return { ok: false, reason: `unknown kind: ${raw.kind.slice(0, 40)}` };
    const keys = Reflect.ownKeys(raw);
    const unexpected = keys.filter((k) => typeof k !== "string" || !allowed.includes(k));
    if (unexpected.length > 0) return { ok: false, reason: `unexpected fields: ${unexpected.map(String).join(", ").slice(0, 120)}` };
    if (hasOwn(raw, "commands") && !Array.isArray(raw.commands)) return { ok: false, reason: "commands must be a list" };
    switch (raw.kind) {
      case "clarification":
        return isId(raw.questionId) ? { ok: true, proposal: { kind: "clarification", questionId: raw.questionId, commands: raw.commands as unknown[] | undefined } } : { ok: false, reason: "bad questionId" };
      case "articles": {
        const ids = raw.articleIds;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_ARTICLES || !ids.every(isId)) return { ok: false, reason: "bad articleIds" };
        return { ok: true, proposal: { kind: "articles", articleIds: [...ids] as string[], commands: raw.commands as unknown[] | undefined } };
      }
      case "procedure":
        return isId(raw.procedureId) && typeof raw.procedureVersion === "string" && raw.procedureVersion.length <= 40
          ? { ok: true, proposal: { kind: "procedure", procedureId: raw.procedureId, procedureVersion: raw.procedureVersion } }
          : { ok: false, reason: "bad procedure reference" };
      case "fallback":
        return isId(raw.fallbackId) ? { ok: true, proposal: { kind: "fallback", fallbackId: raw.fallbackId } } : { ok: false, reason: "bad fallbackId" };
      default:
        return { ok: false, reason: "unknown kind" };
    }
  } catch {
    // Getters, proxies or anything else exotic.
    return { ok: false, reason: "unreadable proposal" };
  }
}

/* ------------------------------------------------------------------ */
/* Approved procedures — trusted application data only                 */
/* ------------------------------------------------------------------ */

/** The version a procedure proposal must name: revision count + latest revision date. */
export function procedureVersion(article: KnowledgeArticle): string {
  const last = article.revisions[article.revisions.length - 1];
  return `${article.revisions.length}:${last?.date ?? "none"}`;
}

/** Why an article cannot be used as an approved procedure for this request ([] = usable). */
export function procedureProblems(article: KnowledgeArticle | undefined, request: AssistantRequest, version: string, now: Date = new Date()): string[] {
  if (!article) return ["unknown procedure"];
  const problems: string[] = [];
  if (article.kind !== "approved-procedure") problems.push("not an approved procedure");
  if (article.status !== "verified") problems.push("not engineer-verified");
  problems.push(...validateReview(article.review, now).map((e) => `approval record: ${e}`));
  if (article.sections.length === 0) problems.push("no sections");
  for (const section of article.sections) {
    if (section.status !== "verified") problems.push(`section not verified: ${section.heading}`);
    if (section.review) problems.push(...validateReview(section.review, now).map((e) => `section approval record: ${e}`));
  }
  if (request.selectedEquipmentId && !article.equipmentIds.includes(request.selectedEquipmentId)) problems.push("not for the selected equipment");
  if (!request.retrieved.articles.some((a) => a.article.id === article.id)) problems.push("not retrieved for this request");
  if (procedureVersion(article) !== version) problems.push("procedure version doesn't match");
  return problems;
}

/* ------------------------------------------------------------------ */
/* Guard                                                               */
/* ------------------------------------------------------------------ */

function fixed(text: string, rejected: string[]): GuardedReply {
  return { kind: "fixed", text, articles: [], procedure: null, commands: [], rejected };
}

/** Validate a model's proposal and render it from trusted content. Never throws. */
export function guardModelProposal(
  raw: unknown,
  request: AssistantRequest,
  pre: PreModelDecision,
  lookup: ArticleLookup = getArticleById,
  now: Date = new Date(),
): GuardedReply {
  if (pre.fixedReply) return fixed(pre.fixedReply, ["model bypassed by safety layer"]);
  const parsed = parseProposal(raw);
  if (!parsed.ok) return fixed(PROCEDURE_REPLY, [parsed.reason]);
  const proposal = parsed.proposal;

  switch (proposal.kind) {
    case "clarification": {
      const text = CLARIFICATION_QUESTIONS.get(proposal.questionId);
      if (!text) return fixed(PROCEDURE_REPLY, [`unknown clarification question: ${proposal.questionId}`]);
      const { commands, errors } = validateWorkspaceCommands(proposal.commands ?? []);
      return { kind: "clarification", text, articles: [], procedure: null, commands, rejected: errors };
    }
    case "articles": {
      const allowed = new Set(request.retrieved.articles.map((a) => a.article.id));
      const rejected: string[] = [];
      const articles: KnowledgeArticle[] = [];
      for (const id of proposal.articleIds) {
        const article = allowed.has(id) ? lookup(id) : undefined;
        if (article) articles.push(article);
        else rejected.push(`article not retrieved or unknown: ${id}`);
      }
      if (articles.length === 0) return fixed(PROCEDURE_REPLY, [...rejected, "no valid articles"]);
      const { commands, errors } = validateWorkspaceCommands(proposal.commands ?? []);
      return { kind: "articles", text: ARTICLES_INTRO, articles, procedure: null, commands, rejected: [...rejected, ...errors] };
    }
    case "procedure": {
      const article = lookup(proposal.procedureId);
      const problems = procedureProblems(article, request, proposal.procedureVersion, now);
      if (problems.length > 0 || !article) return fixed(FALLBACK_REPLIES.get("no-approved-procedure")!, problems);
      return {
        kind: "procedure",
        text: article.title,
        articles: [article],
        procedure: {
          id: article.id,
          version: procedureVersion(article),
          title: article.title,
          sections: article.sections.map((s) => ({ heading: s.heading, body: [...s.body] })),
        },
        commands: [],
        rejected: [],
      };
    }
    case "fallback": {
      const text = FALLBACK_REPLIES.get(proposal.fallbackId);
      return text ? { kind: "fallback", text, articles: [], procedure: null, commands: [], rejected: [] } : fixed(PROCEDURE_REPLY, [`unknown fallback: ${proposal.fallbackId}`]);
    }
  }
}
