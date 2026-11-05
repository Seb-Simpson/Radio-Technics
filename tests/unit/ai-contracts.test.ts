/**
 * RT-004 AI boundary — constrained output contract (RT-002D-R1).
 *
 * RT-QA-002D showed a word-list filter over model prose let 37 of 42 new
 * operational texts through. The contract now accepts IDENTIFIERS only and
 * renders every word from trusted local content. These tests are adversarial:
 * prototype-polluting keys, inherited properties, exotic objects, unknown
 * kinds, self-declared safety, prose in any field, and procedures that fail
 * any single approval condition.
 */
import { describe, expect, it } from "vitest";
import {
  ARTICLES_INTRO,
  CLARIFICATION_QUESTIONS,
  FALLBACK_REPLIES,
  guardModelProposal,
  parseProposal,
  preModelSafety,
  procedureProblems,
  procedureVersion,
  SUPPORT_REPLY,
  TOO_LONG_REPLY,
  URGENT_REPLY,
  type AssistantRequest,
  type PreModelDecision,
} from "@/lib/ai/contracts";
import { articles } from "@/data/articles";
import { getArticleById } from "@/lib/knowledge/search";
import { searchKnowledge } from "@/lib/knowledge/search-engine";
import { PROCEDURE_REPLY } from "@/lib/troubleshooter/engine";
import type { KnowledgeArticle } from "@/types";

function request(message: string, selectedEquipmentId: string | null = null): AssistantRequest {
  const r = searchKnowledge(message, { selectedEquipmentId });
  return { message, selectedEquipmentId, retrieved: { articles: r.articles, interpretations: r.interpretations } };
}
const open: PreModelDecision = { urgent: false, fixedReply: null };
const greenReq = () => request("the green button stopped working");
const NOW = new Date("2026-11-05T12:00:00Z");
const TRUSTED_TEXT = new Set<string>([...CLARIFICATION_QUESTIONS.values(), ...FALLBACK_REPLIES.values(), ARTICLES_INTRO, PROCEDURE_REPLY]);

describe("before any model call (deterministic)", () => {
  it.each(["We're off air, there's dead air", "We have stopped broadcasting.", "Are we off air? Actually, I need a human.", "The transmitter has failed and nobody can receive us."])(
    "%j gets the fixed urgent reply",
    (text) => {
      expect(preModelSafety(text)).toEqual({ urgent: true, fixedReply: URGENT_REPLY });
    },
  );

  it("restart questions, requests for a person and over-long input never reach a model", () => {
    expect(preModelSafety("Should I restart the computer?").fixedReply).toBe(PROCEDURE_REPLY);
    expect(preModelSafety("I need a human").fixedReply).toBe(SUPPORT_REPLY);
    expect(preModelSafety(`${"x ".repeat(260)}we are off air`).fixedReply).toBe(TOO_LONG_REPLY);
  });

  it("a fixed reply wins over anything the model returns", () => {
    const out = guardModelProposal({ kind: "fallback", fallbackId: "contact-support" }, request("off air"), preModelSafety("We're off air"));
    expect(out).toMatchObject({ kind: "fixed", text: URGENT_REPLY, procedure: null, commands: [] });
  });
});

describe("only identifiers are accepted; every word shown is trusted local text", () => {
  it.each([
    [{ kind: "clarification", questionId: "listeners-or-studio" }, "Is the sound missing for listeners, or only in the studio (headphones or speakers)?"],
    [{ kind: "fallback", fallbackId: "contact-support" }, SUPPORT_REPLY],
  ])("%j renders local text", (raw, text) => {
    expect(guardModelProposal(raw, greenReq(), open).text).toBe(text);
  });

  it.each([
    // Operational instructions without obvious "prohibited verbs" (RT-QA-002D examples and new ones).
    { kind: "clarification", questionId: "what-do-you-see", text: "Have you tried giving the power lead a firm reseat?" },
    { kind: "clarification", questionId: "what-do-you-see", text: "Would holding the top-left key for five seconds help?" },
    { kind: "fallback", fallbackId: "safe-default", reply: "Swap the XLR into channel 2 and you're sorted." },
    { kind: "articles", articleIds: ["guide-green-button"], text: "Nudge fader 3 to the top." },
    // The old schema, and self-declared safety.
    { kind: "clarifying_question", text: "Restart Myriad?" },
    { reply: "Press the button twice.", citedArticleIds: [], commands: [], givesInstructions: false },
    { kind: "fallback", fallbackId: "safe-default", givesInstructions: false },
    { kind: "procedure", procedureId: "guide-green-button", procedureVersion: "1", steps: ["Unplug everything"] },
  ])("prose or extra fields reject the whole proposal: %j", (raw) => {
    const out = guardModelProposal(raw, greenReq(), open);
    expect(out.kind).toBe("fixed");
    expect(out.text).toBe(PROCEDURE_REPLY);
    expect(out.procedure).toBeNull();
    expect(out.commands).toEqual([]);
  });

  it.each(["made-up-question", "constructor", "toString", "__proto__", "hasOwnProperty"])("an unknown clarification ID %j is rejected", (questionId) => {
    expect(guardModelProposal({ kind: "clarification", questionId }, greenReq(), open).kind).toBe("fixed");
  });

  it.each(["make-something-up", "constructor", "toString"])("an unknown fallback ID %j is rejected", (fallbackId) => {
    expect(guardModelProposal({ kind: "fallback", fallbackId }, greenReq(), open).kind).toBe("fixed");
  });
});

describe("malformed and hostile structures never crash the guard (RT-QA-002D: kind 'toString' threw)", () => {
  const hostile: [string, unknown][] = [
    ["kind toString", { kind: "toString" }],
    ["kind constructor", { kind: "constructor" }],
    ["kind __proto__", JSON.parse('{"kind":"__proto__"}')],
    ["kind hasOwnProperty", { kind: "hasOwnProperty" }],
    ["kind valueOf", { kind: "valueOf" }],
    ["kind prototype", { kind: "prototype" }],
    ["__proto__ key smuggling a kind", JSON.parse('{"__proto__":{"kind":"fallback","fallbackId":"safe-default"}}')],
    ["constructor key", JSON.parse('{"kind":"fallback","fallbackId":"safe-default","constructor":{"name":"x"}}')],
    ["prototype key", { kind: "fallback", fallbackId: "safe-default", prototype: {} }],
    ["toString key", { kind: "fallback", fallbackId: "safe-default", toString: "x" }],
    ["inherited kind", Object.create({ kind: "fallback", fallbackId: "safe-default" })],
    ["class instance", new (class X { kind = "fallback"; fallbackId = "safe-default"; })()],
    ["array", [{ kind: "fallback" }]],
    ["null", null],
    ["string", "fallback"],
    ["number", 42],
    ["kind not a string", { kind: 7 }],
    ["missing kind", { fallbackId: "safe-default" }],
    ["unknown kind", { kind: "teleport" }],
    ["symbol key", { kind: "fallback", fallbackId: "safe-default", [Symbol("x")]: 1 }],
    ["throwing getter", Object.defineProperty({ kind: "fallback" }, "fallbackId", { enumerable: true, get: () => { throw new Error("boom"); } })],
    ["articleIds not a list", { kind: "articles", articleIds: "guide-green-button" }],
    ["too many articles", { kind: "articles", articleIds: ["a", "b", "c", "d", "e", "f"] }],
    ["commands not a list", { kind: "clarification", questionId: "since-when", commands: {} }],
  ];
  it.each(hostile)("%s → safe reply, no throw", (_label, raw) => {
    expect(() => guardModelProposal(raw, greenReq(), open)).not.toThrow();
    const out = guardModelProposal(raw, greenReq(), open);
    expect(out.kind).toBe("fixed");
    expect(TRUSTED_TEXT.has(out.text)).toBe(true);
    expect(({} as Record<string, unknown>).kind).toBeUndefined(); // nothing polluted
  });

  it("parseProposal reports reasons and never throws", () => {
    for (const [, raw] of hostile) expect(parseProposal(raw).ok).toBe(false);
  });
});

describe("articles and commands", () => {
  it("keeps only retrieved, known articles and valid commands", () => {
    const out = guardModelProposal(
      {
        kind: "articles",
        articleIds: ["guide-green-button", "made-up-article", "help-cables"],
        commands: [{ type: "highlight_equipment", equipmentId: "green-next-button" }, { type: "power_off", equipmentId: "myriad-playout" }],
      },
      greenReq(),
      open,
    );
    expect(out.kind).toBe("articles");
    expect(out.text).toBe(ARTICLES_INTRO);
    expect(out.articles.map((a) => a.id)).toEqual(["guide-green-button"]);
    expect(out.commands).toEqual([{ type: "highlight_equipment", equipmentId: "green-next-button" }]);
  });

  it("with no valid article, falls back to the safe reply", () => {
    expect(guardModelProposal({ kind: "articles", articleIds: ["nope"] }, greenReq(), open).kind).toBe("fixed");
  });
});

describe("procedures: every approval condition is checked against trusted data", () => {
  it("no article in today's knowledge base is usable as a procedure (none has been approved)", () => {
    for (const article of articles) {
      const out = guardModelProposal({ kind: "procedure", procedureId: article.id, procedureVersion: procedureVersion(article) }, greenReq(), open, getArticleById, NOW);
      expect(out.kind, article.id).toBe("fixed");
      expect(out.procedure).toBeNull();
    }
  });

  const base = getArticleById("guide-green-button")!;
  const approved: KnowledgeArticle = {
    ...base,
    id: "fixture-approved",
    kind: "approved-procedure",
    status: "verified",
    equipmentIds: ["green-next-button"],
    review: { reviewer: "Fixture station engineer", date: "2026-11-01", source: "Fixture written only for this test" },
    sections: [{ heading: "Steps", body: ["Trusted step text from the knowledge base."], status: "verified" }],
  };
  // The fixture is "retrieved" for the request and found by the trusted lookup.
  const req = (selected: string | null = "green-next-button"): AssistantRequest => ({
    message: "x",
    selectedEquipmentId: selected,
    retrieved: { articles: [{ article: approved, score: 1, reasons: [] }], interpretations: [] },
  });
  const lookup = (a: KnowledgeArticle) => (id: string) => (id === a.id ? a : undefined);

  it("an approved, applicable, retrieved procedure at the right version renders trusted steps only", () => {
    const out = guardModelProposal({ kind: "procedure", procedureId: approved.id, procedureVersion: procedureVersion(approved) }, req(), open, lookup(approved), NOW);
    expect(out.kind).toBe("procedure");
    expect(out.procedure?.sections).toEqual([{ heading: "Steps", body: ["Trusted step text from the knowledge base."] }]);
  });

  it.each<[string, Partial<KnowledgeArticle>, AssistantRequest?, string?]>([
    ["not verified", { status: "station-reported" }],
    ["manufacturer documentation only", { status: "manufacturer-documented" }],
    ["informational, not a procedure", { kind: "informational" }],
    ["no approval record", { review: undefined }],
    ["placeholder reviewer", { review: { reviewer: "TBC", date: "2026-11-01", source: "Fixture written only for this test" } }],
    ["approval dated in the future", { review: { reviewer: "Fixture station engineer", date: "2027-01-01", source: "Fixture written only for this test" } }],
    ["placeholder source", { review: { reviewer: "Fixture station engineer", date: "2026-11-01", source: "n/a" } }],
    ["a section not verified", { sections: [{ heading: "Steps", body: ["x"], status: "draft" }] }],
    ["no sections", { sections: [] }],
    ["for different equipment", {}, req("mixing-console")],
    ["not retrieved for this request", {}, { message: "x", selectedEquipmentId: null, retrieved: { articles: [], interpretations: [] } }],
    ["wrong version", {}, undefined, "99:2020-01-01"],
  ])("is rejected when %s", (_label, change, request, version) => {
    const broken = { ...approved, ...change };
    const out = guardModelProposal(
      { kind: "procedure", procedureId: broken.id, procedureVersion: version ?? procedureVersion(broken) },
      request ?? req(),
      open,
      lookup(broken),
      NOW,
    );
    expect(out.kind).toBe("fixed");
    expect(out.procedure).toBeNull();
    expect(procedureProblems(broken, request ?? req(), version ?? procedureVersion(broken), NOW).length).toBeGreaterThan(0);
  });
});
