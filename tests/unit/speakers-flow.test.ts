import { describe, expect, it } from "vitest";
import { getEquipmentById } from "@/lib/content/equipment";
import { buildSupportSummary, createConversation, describeStep, respond } from "@/lib/troubleshooter/engine";
import type { ConversationState, EngineContext } from "@/lib/troubleshooter/types";

const noSelection: EngineContext = { selectedEquipmentId: null };
const say = (state: ConversationState, text: string) => respond(state, { type: "text", text }, noSelection).state;
function choose(state: ConversationState, label: string) {
  const option = describeStep(state).options.find((o) => o.label === label);
  if (!option) throw new Error(`No option "${label}". Options: ${describeStep(state).options.map((o) => o.label).join(", ")}`);
  return respond(state, { type: "option", optionId: option.id, instanceId: state.instance }, noSelection).state;
}
const nodeId = (state: ConversationState) => (state.step.kind === "node" ? state.step.nodeId : state.step.kind);
const start = () => respond(createConversation(), { type: "equipment", equipmentId: "studio-monitor-speakers" }, noSelection).state;

describe("studio speakers flow", () => {
  it("is the speakers' entry point", () => {
    expect(getEquipmentById("studio-monitor-speakers")?.flowEntryNodeId).toBe("sp-start");
    expect(nodeId(start())).toBe("sp-start");
  });

  it("silent speakers check the broadcast first; 'only the speakers' continues to the report", () => {
    let s = choose(start(), "Nothing is coming out of them");
    expect(nodeId(s)).toBe("sp-on-air");
    s = choose(s, "No, it's only the speakers");
    expect(nodeId(s)).toBe("sp-mic-live");
    s = choose(s, "Yes, a microphone is live");
    s = choose(s, "Only one speaker");
    s = choose(s, "Yes, they were working earlier");
    expect(nodeId(s)).toBe("outcome-report");
    expect(s.urgent).toBe(false);
    const summary = buildSupportSummary(s);
    expect(summary).toContain("Yes, a microphone is live");
    expect(summary).toContain("Only one speaker");
  });

  it.each([["Yes, it might be silent on air"], ["I'm not sure"]])("'%s' on the broadcast check is urgent", (label) => {
    const s = choose(choose(start(), "Nothing is coming out of them"), label);
    expect(nodeId(s)).toBe("outcome-urgent");
    expect(s.urgent).toBe(true);
  });

  it.each([
    [["Some sounds, but not everything", "No, all microphones are off"]],
    [["They're too loud or too quiet"]],
    [["It sounds crackly, buzzing or distorted"]],
  ])("%j → side → since → report", (path) => {
    let s = start();
    for (const label of path) s = choose(s, label);
    expect(nodeId(s)).toBe("sp-side");
    s = choose(choose(s, "Both speakers"), "No, they haven't worked today");
    expect(nodeId(s)).toBe("outcome-report");
  });

  it("typed text only suggests an answer", () => {
    const before = start();
    const s = say(before, "they're way too loud");
    expect(s.step).toMatchObject({ kind: "check", nodeId: "sp-start", optionId: "volume" });
    expect(s.answers).toEqual(before.answers);
  });

  it("a report of silence on air escalates", () => {
    expect(say(choose(start(), "They're too loud or too quiet"), "We're off air").urgent).toBe(true);
  });

  it("the 'I can't hear anything' flow still reaches its own speakers question", () => {
    let s = say(createConversation(), "I can't hear anything");
    s = choose(s, "Through the studio speakers");
    expect(nodeId(s)).toBe("hear-speakers");
  });
});
