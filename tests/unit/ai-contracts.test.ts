/**
 * RT-004 AI boundary (RT-002D redesign). RT-QA-002C found that the previous
 * guard trusted a model-declared `givesInstructions: false`. These tests are
 * adversarial: proposals that falsely declare themselves safe, disguise
 * instructions, invent procedures or cite unapproved ones must all fail.
 */
import { describe, expect, it } from "vitest";
import {
  ARTICLE_FALLBACK_TEXT,
  containsOperationalInstruction,
  foldForDetection,
  guardModelProposal,
  isApprovedProcedure,
  preModelSafety,
  QUESTION_FALLBACK_TEXT,
  SUPPORT_REPLY,
  URGENT_REPLY,
  type AssistantRequest,
  type PreModelDecision,
} from "@/lib/ai/contracts";
import { articles } from "@/data/articles";
import { getArticleById } from "@/lib/knowledge/search";
import { searchKnowledge } from "@/lib/knowledge/search-engine";
import { PROCEDURE_REPLY } from "@/lib/troubleshooter/engine";
import type { KnowledgeArticle } from "@/types";

function request(message: string): AssistantRequest {
  const r = searchKnowledge(message, { selectedEquipmentId: null });
  return { message, selectedEquipmentId: null, retrieved: { articles: r.articles, interpretations: r.interpretations } };
}
const open: PreModelDecision = { urgent: false, fixedReply: null };
const greenReq = () => request("the green button stopped working");

describe("before any model call (deterministic)", () => {
  it.each([
    "We're off air, there's dead air",
    "We have stopped broadcasting.",
    "Are we off air? Actually, I need a human.",
    "Can someone help? No sound is going out to listeners.",
  ])("%j gets the fixed urgent reply", (text) => {
    expect(preModelSafety(text)).toEqual({ urgent: true, fixedReply: URGENT_REPLY });
  });

  it("restart questions and requests for a person never reach a model", () => {
    expect(preModelSafety("Should I restart the computer?").fixedReply).toBe(PROCEDURE_REPLY);
    expect(preModelSafety("I need a human").fixedReply).toBe(SUPPORT_REPLY);
  });

  it.each(["We were off air earlier, but everything's working now.", "We would be off air if I restarted.", "It is not true that we're off air."])(
    "%j is not treated as a current outage",
    (text) => {
      expect(preModelSafety(text).urgent).toBe(false);
    },
  );

  it("whatever the model returns, a fixed reply wins", () => {
    const out = guardModelProposal({ kind: "approved_procedure", procedureId: "ts-next-song-wont-play" }, request("off air"), preModelSafety("We're off air"));
    expect(out).toMatchObject({ kind: "fixed", text: URGENT_REPLY, procedure: null, commands: [] });
  });
});

describe("a model cannot declare itself safe", () => {
  it.each([
    { kind: "clarifying_question", text: "Restart Myriad?", givesInstructions: false },
    { kind: "article_suggestion", text: "See this.", articleIds: ["guide-green-button"], safe: true },
    { kind: "article_suggestion", text: "See this.", articleIds: ["guide-green-button"], approved: true, reviewer: "Station engineer" },
    { kind: "approved_procedure", procedureId: "guide-green-button", status: "verified" },
    // The RT-003 schema shape is no longer accepted at all.
    { reply: "Press the button twice.", citedArticleIds: [], commands: [], givesInstructions: false },
  ])("rejects %j", (raw) => {
    const out = guardModelProposal(raw, greenReq(), open);
    expect(out.kind).toBe("fixed");
    expect(out.text).toBe(PROCEDURE_REPLY);
    expect(out.procedure).toBeNull();
    expect(out.commands).toEqual([]);
  });
});

describe("instructions in model text are rejected, however they are phrased", () => {
  it.each([
    "Restart Myriad and it should come back.",
    "It may help to power-cycle the rack.",
    "You could try turning it off and on again.",
    "Unplugging the USB cable usually fixes this.",
    "Just press the green button twice.",
    "Try moving the fader up.",
    "The fix is to re-route the output to bus 2.",
    "I'd suggest a quick reboot.",
    // Disguised spellings
    "Ｒｅｓｔａｒｔ Myriad.",
    "Re​start Myriad.",
    "r e s t a r t the playout PC",
    "r.e.b.o.o.t the computer",
    "Rеstart Myriad (Cyrillic e).",
    "UNPLUG IT",
  ])("%j", (text) => {
    expect(containsOperationalInstruction(text)).toBe(true);
    const asArticle = guardModelProposal({ kind: "article_suggestion", text, articleIds: ["guide-green-button"] }, greenReq(), open);
    expect(asArticle.text).toBe(ARTICLE_FALLBACK_TEXT);
    expect(asArticle.rejected).toContain("operational instruction in model text");
    const asQuestion = guardModelProposal({ kind: "clarifying_question", text: `${text}?` }, greenReq(), open);
    expect(asQuestion.text).toBe(QUESTION_FALLBACK_TEXT);
  });

  it("plain explanations and questions pass", () => {
    for (const text of ["This article explains what the green button is for.", "What do you see on the Myriad screen?"]) {
      expect(containsOperationalInstruction(text)).toBe(false);
    }
    const out = guardModelProposal({ kind: "clarifying_question", text: "What do you see on the Myriad screen?" }, greenReq(), open);
    expect(out).toMatchObject({ kind: "clarifying_question", text: "What do you see on the Myriad screen?", rejected: [] });
  });

  it("folds disguises to plain letters", () => {
    expect(foldForDetection("Ｒｅ​s t a r t")).toBe("restart");
  });
});

describe("procedures come only from trusted, engineer-approved data", () => {
  it("no article in the current knowledge base is an approved procedure, so every procedure reference fails", () => {
    expect(articles.filter(isApprovedProcedure)).toEqual([]);
    for (const article of articles) {
      const out = guardModelProposal({ kind: "approved_procedure", procedureId: article.id }, greenReq(), open);
      expect(out.kind).toBe("fixed");
      expect(out.procedure).toBeNull();
    }
  });

  it.each(["made-up-procedure", "", 42, null, "../admin"])("unknown procedure ID %j is rejected", (procedureId) => {
    const out = guardModelProposal({ kind: "approved_procedure", procedureId }, greenReq(), open);
    expect(out.kind).toBe("fixed");
  });

  const base = getArticleById("ts-next-song-wont-play")!;
  const approved: KnowledgeArticle = {
    ...base,
    id: "fixture-approved",
    kind: "approved-procedure",
    status: "verified",
    review: { reviewer: "Fixture engineer", date: "2026-11-01", source: "Fixture used only in tests" },
    sections: [{ heading: "Steps", body: ["Trusted step text from the knowledge base."], status: "verified" }],
  };
  const lookup = (id: string) => (id === approved.id ? approved : getArticleById(id));

  it("an approved, verified procedure is rendered from the knowledge base, never from model text", () => {
    const out = guardModelProposal({ kind: "approved_procedure", procedureId: "fixture-approved" }, greenReq(), open, lookup);
    expect(out.kind).toBe("approved_procedure");
    expect(out.procedure?.sections).toEqual([{ heading: "Steps", body: ["Trusted step text from the knowledge base."] }]);
    // A model can't attach its own steps.
    const withSteps = guardModelProposal({ kind: "approved_procedure", procedureId: "fixture-approved", steps: ["Unplug everything"] }, greenReq(), open, lookup);
    expect(withSteps.kind).toBe("fixed");
  });

  it.each<[string, Partial<KnowledgeArticle>]>([
    ["not verified", { status: "station-reported" }],
    ["no review record", { review: undefined }],
    ["informational, not a procedure", { kind: "informational" }],
    ["a section not verified", { sections: [{ heading: "Steps", body: ["x"], status: "draft" }] }],
    ["manufacturer documentation only", { status: "manufacturer-documented" }],
  ])("is rejected when %s", (_label, change) => {
    const broken = { ...approved, ...change };
    const out = guardModelProposal({ kind: "approved_procedure", procedureId: "fixture-approved" }, greenReq(), open, (id) => (id === broken.id ? broken : undefined));
    expect(out.kind).toBe("fixed");
    expect(out.procedure).toBeNull();
  });
});

describe("articles and commands", () => {
  it("drops invented commands and unretrieved or unknown articles", () => {
    const out = guardModelProposal(
      {
        kind: "article_suggestion",
        text: "This explains the button.",
        articleIds: ["guide-green-button", "made-up-article", "help-cables"],
        commands: [{ type: "highlight_equipment", equipmentId: "green-next-button" }, { type: "power_off", equipmentId: "myriad-playout" }, { type: "select_equipment", equipmentId: "fake" }],
      },
      greenReq(),
      open,
    );
    expect(out.text).toBe("This explains the button.");
    expect(out.articles.map((a) => a.id)).toEqual(["guide-green-button"]);
    expect(out.commands).toEqual([{ type: "highlight_equipment", equipmentId: "green-next-button" }]);
    expect(out.rejected).toHaveLength(4);
  });

  it("a suggestion with no valid article falls back to the safe reply", () => {
    expect(guardModelProposal({ kind: "article_suggestion", text: "See this.", articleIds: ["nope"] }, greenReq(), open).kind).toBe("fixed");
  });

  it("never throws on malformed output", () => {
    for (const raw of [null, "text", 42, [], {}, { kind: "teleport" }, { kind: "clarifying_question" }, { kind: "clarifying_question", text: "x".repeat(601) + "?" }, Object.create({ kind: "clarifying_question" })]) {
      const out = guardModelProposal(raw, greenReq(), open);
      expect(out.procedure).toBeNull();
      expect(out.commands).toEqual([]);
      expect([PROCEDURE_REPLY, QUESTION_FALLBACK_TEXT]).toContain(out.text);
    }
  });
});
