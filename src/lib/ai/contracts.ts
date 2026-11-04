/**
 * RT-004 AI contract (not yet connected to any model). Redesigned in RT-002D.
 *
 * A future language model may only PROPOSE one of three things:
 *   - a clarifying question,
 *   - a suggestion of articles the local retriever already found,
 *   - a reference to an ENGINEER-APPROVED procedure by its ID.
 * Everything it returns is untrusted. The model can never authorise its own
 * output: there is no "this is safe" flag, and any field it adds that isn't
 * in the schema rejects the whole proposal.
 *
 *   1. `preModelSafety` runs BEFORE any model call: current or possible
 *      broadcast interruptions, restart/unplug questions and requests for a
 *      person are answered from fixed text, without waiting on a model.
 *   2. `guardModelProposal` runs AFTER the call, on the server:
 *      - strict schema; unknown keys or kinds → rejected;
 *      - model text is normalised (Unicode compatibility forms, invisible
 *        characters, spaced-out letters) and rejected if it contains anything
 *        that tells the presenter to operate equipment — whatever it claims;
 *      - procedure steps are NEVER model text: they are rendered from the
 *        knowledge base, and only for an article that trusted application data
 *        says is an approved procedure, verified, with a review record and
 *        every section verified;
 *      - articles must be ones retrieved for this request; commands must pass
 *        `validateWorkspaceCommands`.
 *
 * Credentials for any provider stay server-side (a route handler reading an
 * environment variable); nothing here makes a network call.
 */
import { getArticleById } from "@/lib/knowledge/search";
import type { SearchResponse } from "@/lib/knowledge/search-engine";
import { PROCEDURE_REPLY } from "@/lib/troubleshooter/engine";
import { isCurrentConcern } from "@/lib/troubleshooter/safety";
import { understand } from "@/lib/troubleshooter/understand";
import { validateWorkspaceCommands, type WorkspaceCommand } from "@/lib/workspace/commands";
import type { KnowledgeArticle } from "@/types";

export const URGENT_REPLY =
  "If listeners may be hearing silence, treat it as urgent: contact technical support now. I'll keep a note of what you've told me for them.";
export const SUPPORT_REPLY = "Please contact the station's technical support and read them the summary of this conversation.";
export const ARTICLE_FALLBACK_TEXT = "These articles may help explain what you're seeing. They are information only, not instructions.";
export const QUESTION_FALLBACK_TEXT = "Can you tell me a bit more about what you can see or hear?";
const MAX_TEXT = 600;

/** What a server route would send to a model. Built only from local, validated data. */
export interface AssistantRequest {
  message: string;
  selectedEquipmentId: string | null;
  /** Articles found by the local retriever; the model may only cite these. */
  retrieved: Pick<SearchResponse, "articles" | "interpretations">;
}

/** The ONLY shapes a model may return. Treated as untrusted input. */
export type ModelProposal =
  | { kind: "clarifying_question"; text: string; commands?: unknown[] }
  | { kind: "article_suggestion"; text: string; articleIds: string[]; commands?: unknown[] }
  | { kind: "approved_procedure"; procedureId: string; commands?: unknown[] };

const ALLOWED_KEYS: Record<ModelProposal["kind"], readonly string[]> = {
  clarifying_question: ["kind", "text", "commands"],
  article_suggestion: ["kind", "text", "articleIds", "commands"],
  approved_procedure: ["kind", "procedureId", "commands"],
};

export interface PreModelDecision {
  urgent: boolean;
  /** When set, reply with this fixed text and do not call a model. */
  fixedReply: string | null;
}

export function preModelSafety(text: string): PreModelDecision {
  const u = understand(text);
  if (isCurrentConcern(u.broadcast.status) || u.signals.includes("silence")) return { urgent: true, fixedReply: URGENT_REPLY };
  if (u.procedureQuestion) return { urgent: false, fixedReply: PROCEDURE_REPLY };
  if (u.helpRequest) return { urgent: false, fixedReply: SUPPORT_REPLY };
  return { urgent: false, fixedReply: null };
}

export interface RenderedProcedure {
  id: string;
  title: string;
  /** Rendered from the knowledge base, never from model output. */
  sections: { heading: string; body: string[] }[];
}

export interface GuardedReply {
  kind: "fixed" | "clarifying_question" | "article_suggestion" | "approved_procedure";
  text: string;
  articles: KnowledgeArticle[];
  procedure: RenderedProcedure | null;
  commands: WorkspaceCommand[];
  /** Everything removed or replaced, for logging and engineer review. */
  rejected: string[];
}

/** Trusted lookup of articles by ID. Defaults to the app's own knowledge base; tests can supply fixtures. */
export type ArticleLookup = (id: string) => KnowledgeArticle | undefined;

/* ------------------------------------------------------------------ */
/* Instruction detection                                               */
/* ------------------------------------------------------------------ */

const ZERO_WIDTH = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯︀-️﻿]/g;
/** Common look-alike letters from other scripts. */
const CONFUSABLES: Record<string, string> = { а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", ɡ: "g", һ: "h", ⅼ: "l", ｒ: "r" };

/** Fold text so disguised words can be recognised: "Ｒｅ​s t a r t" → "restart". */
export function foldForDetection(text: string): string {
  let t = text.normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase();
  t = [...t].map((ch) => CONFUSABLES[ch] ?? ch).join("");
  // Join letters spelled out with spaces, dots or dashes: "r e s t a r t", "r.e.s.t.a.r.t".
  // Also a fragment followed by spaced letters: "res t a r t".
  t = t.replace(/\b([a-z]+)((?:[\s.\-_*][a-z]\b){2,})/g, (_run, head: string, tail: string) => head + tail.replace(/[\s.\-_*]/g, ""));
  return t.replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Words that operate studio equipment or change the broadcast. Model text may
 * not contain them at all — not as a suggestion, a hedge ("it may help to…")
 * or an explanation. Approved steps come from the knowledge base instead.
 */
const OPERATIONAL = new RegExp(
  "\\b(" +
    [
      "restart\\w*", "reboot\\w*", "reset\\w*", "power(ed|ing)? (it )?(off|on|down|up|cycle)", "power ?cycl\\w*", "shut\\w* (it )?down",
      "turn\\w* (it |them |the \\w+ )?(off|on|up|down)", "switch\\w* (it |them |the \\w+ )?(off|on|over)", "unplug\\w*", "re ?plug\\w*", "plug\\w* (it |them )?(in|back)",
      "disconnect\\w*", "reconnect\\w*", "pull\\w* (out|the)", "press\\w*", "push\\w*", "hold\\w* (down|the)", "hit\\w* (the|it)", "click\\w*", "tap\\w*",
      "toggle\\w*", "flip\\w*", "re ?rout\\w*", "rout(e|ing) (the|it|audio)", "patch\\w*", "fader\\w*", "slide\\w* (up|down)", "adjust\\w*", "change\\w* (the )?(routing|source|input|output|setting)",
      "swap\\w*", "replace\\w*", "reinstall\\w*", "uninstall\\w*", "force quit", "end task", "kill\\w*", "log\\w* (out|off)", "sign\\w* out", "open\\w* the (rack|cabinet)",
      "go to (the )?settings", "set (it|the \\w+) to", "move\\w* the (fader|slider|knob)", "rotate\\w*", "twist\\w*", "jiggle\\w*",
    ].join("|") +
    ")\\b",
);

export function containsOperationalInstruction(text: string): boolean {
  return OPERATIONAL.test(foldForDetection(text));
}

/* ------------------------------------------------------------------ */
/* Guard                                                               */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** Approval comes from trusted application data, never from the model. */
export function isApprovedProcedure(article: KnowledgeArticle | undefined): article is KnowledgeArticle {
  return Boolean(
    article &&
      article.kind === "approved-procedure" &&
      article.status === "verified" &&
      article.review &&
      article.sections.length > 0 &&
      article.sections.every((s) => s.status === "verified"),
  );
}

function fixed(text: string, rejected: string[]): GuardedReply {
  return { kind: "fixed", text, articles: [], procedure: null, commands: [], rejected };
}

/**
 * Validate a model's proposal. Never throws. Anything that fails becomes the
 * safe procedure reply with no commands.
 */
export function guardModelProposal(raw: unknown, request: AssistantRequest, pre: PreModelDecision, lookup: ArticleLookup = getArticleById): GuardedReply {
  if (pre.fixedReply) return fixed(pre.fixedReply, ["model bypassed by safety layer"]);
  if (!isRecord(raw) || typeof raw.kind !== "string" || !(raw.kind in ALLOWED_KEYS)) return fixed(PROCEDURE_REPLY, ["malformed proposal"]);
  const kind = raw.kind as ModelProposal["kind"];
  const extra = Object.keys(raw).filter((k) => !ALLOWED_KEYS[kind].includes(k));
  // e.g. a self-declared "givesInstructions: false" or "safe: true".
  if (extra.length > 0) return fixed(PROCEDURE_REPLY, [`unexpected fields: ${extra.join(", ")}`]);

  const rejected: string[] = [];
  const { commands, errors } = validateWorkspaceCommands(raw.commands ?? []);
  rejected.push(...errors);

  const checkText = (fallback: string): string => {
    const text = raw.text;
    if (typeof text !== "string" || text.trim() === "" || text.length > MAX_TEXT) {
      rejected.push("missing, empty or oversized text");
      return fallback;
    }
    if (containsOperationalInstruction(text)) {
      rejected.push("operational instruction in model text");
      return fallback;
    }
    return text.trim();
  };

  switch (kind) {
    case "clarifying_question": {
      let text = checkText(QUESTION_FALLBACK_TEXT);
      if (!text.endsWith("?")) {
        rejected.push("clarifying question is not a question");
        text = QUESTION_FALLBACK_TEXT;
      }
      return { kind, text, articles: [], procedure: null, commands, rejected };
    }
    case "article_suggestion": {
      const allowed = new Set(request.retrieved.articles.map((a) => a.article.id));
      const articles: KnowledgeArticle[] = [];
      for (const id of Array.isArray(raw.articleIds) ? raw.articleIds : []) {
        const article = typeof id === "string" && allowed.has(id) ? lookup(id) : undefined;
        if (article) articles.push(article);
        else rejected.push(`article not retrieved or unknown: ${String(id)}`);
      }
      if (articles.length === 0) return fixed(PROCEDURE_REPLY, [...rejected, "no valid articles"]);
      return { kind, text: checkText(ARTICLE_FALLBACK_TEXT), articles, procedure: null, commands, rejected };
    }
    case "approved_procedure": {
      const id = raw.procedureId;
      const article = typeof id === "string" ? lookup(id) : undefined;
      if (!isApprovedProcedure(article)) {
        return fixed(PROCEDURE_REPLY, [...rejected, `not an engineer-approved procedure: ${String(id)}`]);
      }
      const procedure: RenderedProcedure = {
        id: article.id,
        title: article.title,
        sections: article.sections.map((s) => ({ heading: s.heading, body: [...s.body] })),
      };
      return { kind, text: article.title, articles: [article], procedure, commands, rejected };
    }
  }
}
