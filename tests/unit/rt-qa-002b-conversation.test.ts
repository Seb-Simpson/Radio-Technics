/**
 * RT-QA-002B Priority 1 regressions (RT-002C).
 *
 * The audit report itself was not available to the development team, so
 * these reproductions were written by the team for each finding category in
 * the RT-002C brief. Every phrase below was run against the audited baseline
 * (2ae5b26) and failed there; the failing behaviour is noted beside it.
 */
import { describe, expect, it } from "vitest";
import { buildSupportSummary, createConversation, describeStep, respond } from "@/lib/troubleshooter/engine";
import type { ConversationState } from "@/lib/troubleshooter/types";
import { understand } from "@/lib/troubleshooter/understand";

const ctx = { selectedEquipmentId: null };
const type = (s: ConversationState, text: string) => respond(s, { type: "text", text }, ctx).state;
const press = (s: ConversationState, optionId: string) => respond(s, { type: "option", optionId }, ctx).state;
const at = (s: ConversationState) => (s.step.kind === "node" ? s.step.nodeId : s.step.kind);
const fresh = (text: string) => type(createConversation(), text);

function onNode(nodeId: string): ConversationState {
  const confirmed = press(type(createConversation(), "The green thing isn't working"), "confirm:yes");
  return { ...confirmed, step: { kind: "node", nodeId } };
}
/** Reply on a node; returns the new state and whether an answer was recorded. */
function reply(nodeId: string, text: string) {
  const before = onNode(nodeId);
  const after = type(before, text);
  return { s: after, recorded: after.answers.slice(before.answers.length) };
}

describe("1. questions, hypotheticals, uncertainty and denials are never confirmed observations", () => {
  it.each([
    // [phrase, baseline behaviour]
    ["Are we off air?", "confirmed urgent"],
    ["Could we be off air?", "confirmed urgent"],
    ["I think we might be off air", "confirmed urgent"],
    ["Not sure if we're off air", "confirmed urgent"],
    ["We might have dead air", "confirmed urgent"],
  ])("%j is escalated as POSSIBLE, not confirmed (baseline: %s)", (text) => {
    const u = understand(text);
    expect(u.offAir).toBe("possible");
    expect(u.clearAirSilence).toBe(false);
    const s = fresh(text);
    expect(at(s)).toBe("outcome-urgent");
    expect(s.urgent).toBe(true);
    expect(s.confirmedOffAir).toBe(false);
    expect(s.messages.some((m) => /possible silence on air, not confirmed/.test(m.text))).toBe(true);
    const summary = buildSupportSummary(s);
    expect(summary).toMatch(/^URGENT \(precaution\): possible silence on air — not confirmed by the presenter$/m);
    expect(summary).not.toMatch(/^URGENT: silence on air reported$/m);
  });

  it.each([
    ["What if we go off air?", "confirmed urgent"],
    ["If there's dead air what do I do?", "confirmed urgent"],
    ["What should I do if we go off air?", "confirmed urgent"],
  ])("hypothetical %j records nothing (baseline: %s)", (text) => {
    const s = fresh(text);
    expect(understand(text).offAir).toBeNull();
    expect(s.urgent).toBe(false);
    expect(s.possibleSilence).toBe(false);
    expect(s.answers).toEqual([]);
    expect(s.messages.some((m) => /If the station ever goes silent on air, treat it as urgent/.test(m.text))).toBe(true);
    expect(s.observations.map((o) => o.text)).toEqual([text]);
  });

  it.each([
    ["I don't think we're off air", "confirmed urgent"],
    ["We're not off air", "already correct; kept as a guard"],
  ])("denial %j does not escalate (baseline: %s)", (text) => {
    const s = fresh(text);
    expect(s.urgent).toBe(false);
    expect(understand(text).offAir).toBeNull();
  });

  it.each([
    ["mic-meters", "Do they move?", "recorded 'Yes, they move'"],
    ["mic-since", "If it was working earlier, would that matter?", "recorded 'Yes, it was working earlier'"],
    ["mic-headphones", "Can I hear other sounds?", "already correct; kept as a guard"],
    ["hear-on-air", "Is it silent?", "recorded 'Yes, it might be silent' as confirmed"],
  ])("on %s, the question/hypothetical %j records no answer (baseline: %s)", (node, text) => {
    const { s, recorded } = reply(node, text);
    expect(recorded).toEqual([]);
    expect(at(s)).toBe(node);
  });

  it("an uncertain observation is recorded as 'not sure', never as the observation (baseline: confirmed)", () => {
    const { recorded } = reply("mic-headphones", "Maybe I can hear other sounds");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ answer: "I'm not sure", certainty: "uncertain" });
  });

  it("uncertain silence is checked, not recorded", () => {
    const s = fresh("Maybe nothing is playing");
    expect(at(s)).toBe("hear-on-air");
    expect(s.possibleSilence).toBe(true);
    expect(s.urgent).toBe(false);
    expect(understand("Maybe nothing is playing").audio).toBeNull();
  });
});

describe("2. polite words after an off-air report don't retract it", () => {
  it.each([
    "We're off air, sorry",
    "We're off air. Hang on.",
    "Off air - sorry, hang on a sec",
    "Dead air, sorry about that",
    "We're off air, bear with me",
    "Sorry, we're off air",
  ])("%j stays a confirmed off-air report (baseline: not urgent at all)", (text) => {
    const s = fresh(text);
    expect(at(s)).toBe("outcome-urgent");
    expect(s.urgent).toBe(true);
    expect(s.confirmedOffAir).toBe(true);
    expect(buildSupportSummary(s)).toMatch(/^URGENT: silence on air reported$/m);
  });

  it("as an answer: 'Yes it's off air, sorry' (baseline: re-asked, not urgent)", () => {
    const { s } = reply("hear-on-air", "Yes it's off air, sorry");
    expect(at(s)).toBe("outcome-urgent");
    expect(s.confirmedOffAir).toBe(true);
  });

  it.each([
    "We're off air, sorry, no we're not, it's fine",
    "Dead air - actually no, false alarm",
    "We're off air. Sorry, my mistake, we're still on air",
  ])("an explicit correction %j does retract it", (text) => {
    const s = fresh(text);
    expect(s.urgent).toBe(false);
    expect(s.confirmedOffAir).toBe(false);
  });

  it("a correction that doesn't address the off-air fact keeps it urgent, as unconfirmed", () => {
    const s = fresh("We're off air, sorry, I mean the headphones are silent");
    expect(s.urgent).toBe(true);
    expect(s.confirmedOffAir).toBe(false);
    expect(buildSupportSummary(s)).toMatch(/not confirmed by the presenter/);
  });

  it("existing corrections still work: 'Yes, no, sorry it is not playing'", () => {
    // RT-002D: proposed for confirmation, then recorded.
    const { s, recorded } = reply("gb-current-song", "Yes, no, sorry it is not playing");
    expect(recorded).toEqual([]);
    expect(describeStep(s).options[0]?.label).toBe("No — there's silence");
    expect(press(s, describeStep(s).options[0]!.id).answers.at(-1)?.answer).toBe("No — there's silence");
  });
});

describe("3. confirmed and possible off-air are kept apart in the conversation and summary", () => {
  it("unsure on the on-air check is escalated but summarised as unconfirmed (baseline: 'URGENT: silence on air reported')", () => {
    const s = type(onNode("hear-on-air"), "Maybe");
    expect(at(s)).toBe("outcome-urgent");
    expect(s.confirmedOffAir).toBe(false);
    const summary = buildSupportSummary(s);
    expect(summary).toMatch(/URGENT \(precaution\): possible silence on air/);
    expect(summary).not.toMatch(/^URGENT: silence on air reported$/m);
  });

  it("a later confirmation upgrades a possible report, and it is never downgraded", () => {
    let s = fresh("Are we off air?");
    expect(s.confirmedOffAir).toBe(false);
    s = type(s, "Yes, we're definitely off air");
    expect(s.confirmedOffAir).toBe(true);
    s = type(s, "Are we off air?");
    expect(s.confirmedOffAir).toBe(true);
  });

  it("the support step says whether silence was confirmed", () => {
    const possible = type(fresh("Are we off air?"), "I need technical support");
    expect(describeStep(possible).prompt).toMatch(/may be silent on air \(not confirmed\)/);
    const confirmed = type(fresh("We're off air"), "I need technical support");
    expect(describeStep(confirmed).prompt).toMatch(/silence on air has been reported/);
  });

  it("the presenter's exact words are kept either way", () => {
    const s = fresh("I think we might be off air");
    expect(buildSupportSummary(s)).toContain("“I think we might be off air”");
  });
});

describe("4. a yes/no prefix never overrides the rest of the sentence", () => {
  it.each([
    ["mic-meters", "Yes, they don't move", "recorded 'Yes, they move'"],
    ["mic-meters", "No, they're moving", "recorded 'No, they don't move'"],
    ["hear-meters", "Yes, they aren't moving", "recorded 'Yes, they move'"],
    ["mic-since", "Yes, it wasn't working earlier", "recorded 'Yes, it was working earlier'"],
    ["mic-since", "No, it was working earlier", "recorded 'No, it hasn't worked today'"],
    ["generic-since", "Yes, it hasn't worked today", "recorded 'Yes, it was working earlier'"],
    ["gb-find-screen", "Yes, I can't find it", "recorded 'Yes, I've found it'"],
  ])("on %s, %j records nothing (baseline: %s)", (node, text) => {
    const { s, recorded } = reply(node, text);
    expect(recorded).toEqual([]);
    expect(at(s)).toBe(node);
    expect(s.messages.some((m) => /(won't|haven't) record(ed)? an answer/.test(m.text))).toBe(true);
  });

  it.each([
    ["mic-meters", "Yes, they move", "Yes, they move"],
    ["mic-meters", "No, they don't move", "No, they don't move"],
    ["mic-since", "Yes, it was working earlier", "Yes, it was working earlier"],
    ["mic-since", "No", "No, it hasn't worked today"],
    ["mic-headphones", "Yes, but not my own voice", "Yes, I can hear other sounds"],
  ])("consistent replies still work: %s %j", (node, text, answer) => {
    // Recorded directly (exact label or bare yes/no), or — for descriptive
    // replies to safety-relevant questions — proposed and then confirmed (RT-002D).
    const { s, recorded } = reply(node, text);
    if (s.step.kind === "check") {
      expect(recorded).toEqual([]);
      expect(describeStep(s).options[0]?.label).toBe(answer);
      expect(press(s, describeStep(s).options[0]!.id).answers.at(-1)?.answer).toBe(answer);
    } else {
      expect(recorded[0]?.answer).toBe(answer);
    }
  });

  it("'Yes, it's the guest mic' while confirming another item asks which (baseline: confirmed the wrong item)", () => {
    const s0 = fresh("The presenter microphone isn't working");
    expect(s0.step.kind).toBe("confirm");
    const s = type(s0, "Yes, it's the guest mic");
    expect(s.step).toMatchObject({ kind: "choose", reason: "ambiguous" });
    expect(s.answers.slice(s0.answers.length)).toEqual([]);
    expect(s.equipmentId).toBeNull();
  });

  it("'Is it the green button?' as a reply to a confirmation records nothing", () => {
    const s0 = fresh("The green thing isn't working");
    const s = type(s0, "Is that the green button?");
    expect(s.answers.slice(s0.answers.length)).toEqual([]);
    expect(s.step.kind).toBe("confirm");
  });
});
