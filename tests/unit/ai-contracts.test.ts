import { describe, expect, it } from "vitest";
import { guardModelProposal, preModelSafety, URGENT_REPLY, type AssistantRequest } from "@/lib/ai/contracts";
import { searchKnowledge } from "@/lib/knowledge/search-engine";
import { PROCEDURE_REPLY } from "@/lib/troubleshooter/engine";

function request(message: string): AssistantRequest {
  const r = searchKnowledge(message, { selectedEquipmentId: null });
  return { message, selectedEquipmentId: null, retrieved: { articles: r.articles, interpretations: r.interpretations } };
}

describe("RT-004 deterministic safety layer", () => {
  it("handles silence on air before any model call", () => {
    const pre = preModelSafety("We're off air, there's dead air");
    expect(pre).toEqual({ urgent: true, fixedReply: URGENT_REPLY });
    const out = guardModelProposal({ reply: "Try restarting Myriad", citedArticleIds: [], commands: [], givesInstructions: true }, request("off air"), pre);
    expect(out.reply).toBe(URGENT_REPLY);
  });

  it("answers restart questions with the safe reply, whatever the model says", () => {
    const pre = preModelSafety("Should I restart the computer?");
    expect(pre.fixedReply).toBe(PROCEDURE_REPLY);
  });

  it("rejects invented commands and unretrieved citations", () => {
    const req = request("the green button stopped working");
    const pre = preModelSafety(req.message);
    expect(pre.fixedReply).toBeNull();
    const out = guardModelProposal(
      {
        reply: "This explains the button.",
        citedArticleIds: ["guide-green-button", "made-up-article", "help-cables"],
        commands: [{ type: "highlight_equipment", equipmentId: "green-next-button" }, { type: "power_off", equipmentId: "myriad-playout" }, { type: "select_equipment", equipmentId: "fake" }],
        givesInstructions: false,
      },
      req,
      pre,
    );
    expect(out.reply).toBe("This explains the button.");
    expect(out.citedArticles.map((a) => a.id)).toEqual(["guide-green-button"]);
    expect(out.commands).toEqual([{ type: "highlight_equipment", equipmentId: "green-next-button" }]);
    expect(out.rejected).toHaveLength(4);
  });

  it("replaces instructions that no verified procedure supports", () => {
    const req = request("the next song won't play");
    const out = guardModelProposal({ reply: "Press the button twice.", citedArticleIds: ["ts-next-song-wont-play"], commands: [], givesInstructions: true }, req, { urgent: false, fixedReply: null });
    expect(out.reply).toBe(PROCEDURE_REPLY);
    // Unknown whether it instructs → treated as instructing.
    const unsure = guardModelProposal({ reply: "Press it.", citedArticleIds: [], commands: [] }, req, { urgent: false, fixedReply: null });
    expect(unsure.reply).toBe(PROCEDURE_REPLY);
  });

  it("never throws on malformed model output", () => {
    for (const raw of [null, "text", 42, [], { reply: "" }, { reply: 3 }]) {
      const out = guardModelProposal(raw, request("x"), { urgent: false, fixedReply: null });
      expect(out.reply).toBe(PROCEDURE_REPLY);
      expect(out.commands).toEqual([]);
    }
  });
});
