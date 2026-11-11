import { describe, expect, it } from "vitest";
import { getEquipmentById } from "@/lib/content/equipment";
import { buildSupportSummary, createConversation, describeStep, respond } from "@/lib/troubleshooter/engine";
import { interpret } from "@/lib/troubleshooter/interpret";
import type { ConversationState, EngineContext } from "@/lib/troubleshooter/types";

const noSelection: EngineContext = { selectedEquipmentId: null };

const say = (state: ConversationState, text: string) => respond(state, { type: "text", text }, noSelection).state;

function choose(state: ConversationState, label: string) {
  const option = describeStep(state).options.find((o) => o.label === label);
  if (!option) throw new Error(`No option "${label}". Options: ${describeStep(state).options.map((o) => o.label).join(", ")}`);
  return respond(state, { type: "option", optionId: option.id, instanceId: state.instance }, noSelection).state;
}

const nodeId = (state: ConversationState) => (state.step.kind === "node" ? state.step.nodeId : state.step.kind);

/** Start the headphones flow the way the Studio Explorer does. */
const start = () => respond(createConversation(), { type: "equipment", equipmentId: "headphone-monitoring" }, noSelection).state;

describe("headphones flow", () => {
  it("is the headphones' entry point", () => {
    expect(getEquipmentById("headphone-monitoring")?.flowEntryNodeId).toBe("hp-start");
    const s = start();
    expect(nodeId(s)).toBe("hp-start");
    expect(describeStep(s).options.map((o) => o.label)).toEqual(
      expect.arrayContaining([
        "I can't hear anything in them",
        "I can hear some sounds, but not everything",
        "They're too loud or too quiet",
        "It sounds crackly, buzzing or distorted",
        "I'm not sure",
        "I need technical support",
      ]),
    );
  });

  it("is offered as a common problem and reaches the flow", () => {
    expect(interpret("My headphones aren't working")).toEqual({ kind: "equipment", equipmentId: "headphone-monitoring" });
    const topic = describeStep(createConversation()).options.find((o) => o.label === "My headphones aren't working");
    expect(topic).toBeDefined();
    let s = respond(createConversation(), { type: "option", optionId: topic!.id, instanceId: 0 }, noSelection).state;
    expect(s.step).toEqual({ kind: "confirm", equipmentId: "headphone-monitoring" });
    s = choose(s, describeStep(s).options[0]!.label);
    expect(nodeId(s)).toBe("hp-start");
  });

  it("silent headphones check the broadcast first; 'only the headphones' continues", () => {
    let s = choose(start(), "I can't hear anything in them");
    expect(nodeId(s)).toBe("hp-on-air");
    expect(s.urgent).toBe(false);
    s = choose(s, "No, it's only the headphones");
    expect(nodeId(s)).toBe("hp-meters");
    s = choose(s, "Yes, they move");
    s = choose(s, "Only mine");
    s = choose(s, "Yes, they were working earlier");
    expect(nodeId(s)).toBe("outcome-report");
    expect(s.urgent).toBe(false);
    const summary = buildSupportSummary(s);
    expect(summary).toContain("I can't hear anything in them");
    expect(summary).toContain("No, it's only the headphones");
    expect(summary).toContain("Only mine");
  });

  it("possible silence on air from the headphones flow is urgent", () => {
    let s = choose(start(), "I can't hear anything in them");
    s = choose(s, "Yes, it might be silent on air");
    expect(nodeId(s)).toBe("outcome-urgent");
    expect(s.urgent).toBe(true);
  });

  it("not knowing whether the station is silent is treated as urgent", () => {
    let s = choose(start(), "I can't hear anything in them");
    s = choose(s, "I'm not sure");
    expect(nodeId(s)).toBe("outcome-urgent");
    expect(s.urgent).toBe(true);
  });

  it("'I'm not sure' at the start checks the broadcast", () => {
    expect(nodeId(choose(start(), "I'm not sure"))).toBe("hp-on-air");
  });

  it.each([
    [["I can hear some sounds, but not everything", "My own voice"]],
    [["I can hear some sounds, but not everything", "A guest or caller"]],
    [["They're too loud or too quiet"]],
    [["It sounds crackly, buzzing or distorted", "Only one ear"]],
  ])("%j → whose → since → report", (path) => {
    let s = start();
    for (const label of path) s = choose(s, label);
    expect(nodeId(s)).toBe("hp-whose");
    s = choose(s, "Everyone's in the studio");
    expect(nodeId(s)).toBe("hp-since");
    s = choose(s, "No, they haven't worked today");
    expect(nodeId(s)).toBe("outcome-report");
    expect(s.urgent).toBe(false);
  });

  it("typed text only suggests an answer; nothing is recorded until a button is pressed", () => {
    const before = start();
    const s = say(before, "they're far too quiet");
    expect(s.step).toMatchObject({ kind: "check", nodeId: "hp-start", optionId: "volume" });
    expect(s.answers).toEqual(before.answers);
  });

  it("typing that you can't hear anything stays in the headphones flow", () => {
    const s = say(choose(start(), "They're too loud or too quiet"), "now I can't hear anything");
    expect(["hear-where"]).not.toContain(nodeId(s));
  });

  it("a report of silence on air while in the flow escalates", () => {
    const s = say(choose(start(), "They're too loud or too quiet"), "We're off air");
    expect(s.urgent).toBe(true);
  });

  it("never prescribes a fix", () => {
    const s = start();
    const text = [describeStep(s).prompt, describeStep(s).help ?? ""].join(" ");
    expect(text).toMatch(/hasn't confirmed/);
    expect(text).not.toMatch(/\b(turn|press|unplug|restart|switch)\b/i);
  });
});
