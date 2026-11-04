/**
 * Regression tests for the RT-QA-001 audit findings (Stage A).
 * Each test reproduces a reported failure from the RT-001 prototype.
 */
import { describe, expect, it } from "vitest";
import { buildSupportSummary, createConversation, describeStep, respond } from "@/lib/troubleshooter/engine";
import type { ConversationState, EngineContext } from "@/lib/troubleshooter/types";
import { understand } from "@/lib/troubleshooter/understand";

const ctx: EngineContext = { selectedEquipmentId: null };

function type(state: ConversationState, text: string, context = ctx) {
  return respond(state, { type: "text", text }, context).state;
}
function press(state: ConversationState, label: string) {
  const option = describeStep(state).options.find((o) => o.label === label);
  if (!option) throw new Error(`No option "${label}" in ${describeStep(state).options.map((o) => o.label).join(" | ")}`);
  return respond(state, { type: "option", optionId: option.id }, ctx).state;
}
const STILL_PLAYING = "Is the song that was already playing still playing?";
const answeredStillPlaying = (s: ConversationState) => s.answers.filter((a) => a.question === STILL_PLAYING);
const nodeId = (s: ConversationState) => (s.step.kind === "node" ? s.step.nodeId : s.step.kind);

/** Conversation positioned at "Is the song that was already playing still playing?" */
function atStillPlaying() {
  let s = type(createConversation(), "The green thing isn't working");
  s = press(s, "Yes, that's it");
  s = press(s, "Nothing changed");
  expect(nodeId(s)).toBe("gb-current-song");
  return s;
}

describe("A1 — understanding negation, uncertainty and observations", () => {
  it.each([
    ["No, it is silent.", "negate", ["silence"]],
    ["No, nothing is playing.", "negate", ["silence"]],
    ["It isn't working.", "none", ["not-working"]],
    ["I can't hear anything.", "none", ["no-sound"]],
    ["No, that's not the green button.", "negate", []],
    ["Yes, but there's no sound", "affirm", ["no-sound"]],
    ["I don't know whether we're on air.", "uncertain", ["on-air-unknown"]],
    ["Yes it is", "affirm", []],
    ["It is not", "negate", []],
    ["No idea", "uncertain", []],
    ["It's not silent", "none", []],
  ])("%s → %s", (text, stance, signals) => {
    const u = understand(text);
    expect(u.stance).toBe(stance);
    expect(u.signals).toEqual(signals);
  });

  it("'No, it is silent' is never recorded as 'still playing' and escalates", () => {
    // RT-002D: escalation is immediate (as possible silence); the answer itself is confirmed first.
    const s = type(atStillPlaying(), "No, it is silent.");
    expect(s.urgent).toBe(true);
    expect(s.confirmedOffAir).toBe(false);
    expect(answeredStillPlaying(s)).toEqual([]);
    expect(describeStep(s).options[0]?.label).toBe("No — there's silence");
    const confirmed = press(s, "No — there's silence");
    expect(nodeId(confirmed)).toBe("outcome-urgent");
    expect(confirmed.answers.at(-1)).toMatchObject({ answer: "No — there's silence", source: "confirmed-interpretation", typedText: "No, it is silent." });
    expect(answeredStillPlaying(confirmed).map((a) => a.answer)).toEqual(["No — there's silence"]);
  });

  it("'No, nothing is playing' escalates", () => {
    const s = type(atStillPlaying(), "No, nothing is playing.");
    expect(s.urgent).toBe(true);
    expect(nodeId(press(s, "No — there's silence"))).toBe("outcome-urgent");
  });

  it("'Yes, but there's no sound' asks for clarification instead of recording yes", () => {
    const s = type(atStillPlaying(), "Yes, but there's no sound");
    expect(nodeId(s)).toBe("gb-current-song");
    expect(answeredStillPlaying(s)).toEqual([]);
    expect(s.messages.some((m) => /also that there's no sound/.test(m.text))).toBe(true);
  });

  it("answers are judged against the exact question: meters moving with no sound is consistent, and both facts are kept", () => {
    let s = type(createConversation(), "My microphone isn't working");
    s = press(s, "Presenter microphone");
    s = press(s, "Other people can't hear it");
    s = type(s, "Yes, but there's no sound at all");
    // RT-002D: proposed by the yes (the sound remark is a separate observation), then confirmed.
    expect(describeStep(s).options[0]?.label).toBe("Yes, they move");
    s = press(s, "Yes, they move");
    expect(s.answers.at(-1)).toMatchObject({ answer: "Yes, they move", source: "confirmed-interpretation", typedText: "Yes, but there's no sound at all" });
    expect(buildSupportSummary(s)).toContain("\u201cYes, but there's no sound at all\u201d");
  });

  it("'I don't know whether we're on air' leads to the on-air check, then urgent when still unsure", () => {
    let s = type(atStillPlaying(), "I don't know whether we're on air");
    expect(nodeId(s)).toBe("hear-on-air");
    s = type(s, "I'm not sure");
    expect(nodeId(s)).toBe("outcome-urgent");
  });

  it("uncertainty is recorded as uncertain, never as an answer", () => {
    let s = type(createConversation(), "The green thing isn't working");
    s = press(s, "Yes, that's it");
    s = type(s, "no idea");
    expect(s.answers.at(-1)).toMatchObject({ answer: "I'm not sure", certainty: "uncertain" });
  });

  it("hedged answers are marked as not certain", () => {
    let s = type(createConversation(), "The green thing isn't working");
    s = press(s, "Yes, that's it");
    s = press(s, "Nothing changed");
    s = type(s, "Yes I think so");
    // RT-002D: a hedged reply is proposed, and stays "not certain" once confirmed.
    s = press(s, "Yes, it's still playing");
    expect(s.answers.at(-1)).toMatchObject({ answer: "Yes, it's still playing", certainty: "uncertain" });
  });

  it("an explicit rejection of the equipment is respected", () => {
    let s = type(createConversation(), "The green thing isn't working");
    s = type(s, "No, that's not the green button.");
    expect(s.step).toMatchObject({ kind: "choose", reason: "other" });
    expect(s.equipmentId).toBeNull();
  });

  it("naming a different item while rejecting confirms that item instead", () => {
    let s = type(createConversation(), "The green thing isn't working");
    s = type(s, "No, it's the guest mic");
    expect(s.step).toEqual({ kind: "confirm", equipmentId: "guest-microphones" });
  });

  it("'It isn't working' as a reply doesn't pick an answer at random", () => {
    const s = type(atStillPlaying(), "It isn't working.");
    expect(nodeId(s)).toBe("gb-current-song");
    expect(s.answers.at(-1)?.question).not.toBe("Is the song that was already playing still playing?");
  });

  it("'I can't hear anything' mid-flow moves to finding where the sound is missing", () => {
    let s = type(createConversation(), "The green thing isn't working");
    s = press(s, "Yes, that's it");
    s = type(s, "I can't hear anything");
    expect(nodeId(s)).toBe("hear-where");
  });
});

describe("A2 — no accidental resets", () => {
  it("'Should I restart the computer?' keeps everything and gives a safe answer", () => {
    const before = atStillPlaying();
    const s = type(before, "Should I restart the computer?");
    expect(s.step).toEqual(before.step);
    expect(s.equipmentId).toBe("green-next-button");
    expect(s.answers).toEqual(before.answers);
    expect(s.messages.length).toBeGreaterThan(before.messages.length);
    expect(s.messages.some((m) => /don't restart, unplug or reset/.test(m.text))).toBe(true);
    expect(s.observations.at(-1)?.text).toBe("Should I restart the computer?");
  });

  it.each(["restart", "reset", "start again", "new problem", "Can I reset the desk?"])("typed %j never clears the conversation", (text) => {
    const before = atStillPlaying();
    const s = type(before, text);
    expect(s.step.kind).not.toBe("start");
    expect(s.answers.length).toBeGreaterThanOrEqual(before.answers.length);
  });
});

describe("A3 — the user's own words are preserved", () => {
  it("keeps both observations from one sentence, even if the screen problem isn't understood", () => {
    let s = type(createConversation(), "The green button isn't doing anything, and the screen has gone weird.");
    s = press(s, "Yes, that's it");
    s = press(s, "Something unexpected happened");
    s = type(s, "the screen flickers");
    const summary = buildSupportSummary(s);
    expect(summary).toContain("“The green button isn't doing anything, and the screen has gone weird.”");
    expect(summary).toContain("“the screen flickers”");
    // An unmatched observation must not hijack the conversation onto another item.
    expect(s.equipmentId).toBe("green-next-button");
    expect(nodeId(s)).toBe("gb-unexpected");
  });

  it("stores button selections separately from typed observations", () => {
    let s = type(createConversation(), "The green thing isn't working");
    s = press(s, "Yes, that's it");
    expect(s.observations).toEqual([{ text: "The green thing isn't working", inReplyTo: null }]);
    expect(s.answers).toEqual([
      expect.objectContaining({ answer: "Yes, that's it", source: "button", certainty: "confirmed" }),
    ]);
  });

  it("marks uncertain answers in the summary", () => {
    let s = type(createConversation(), "The green thing isn't working");
    s = press(s, "I'm not sure");
    expect(buildSupportSummary(s)).toMatch(/I'm not sure \(not certain\)/);
  });

  it("never invents a symptom: summary contains only what was said or chosen", () => {
    const s = type(createConversation(), "banana");
    const summary = buildSupportSummary(s);
    expect(summary).toContain("“banana”");
    expect(summary).not.toMatch(/Answers to questions/);
  });
});

describe("A4 — support requests", () => {
  it.each(["I need technical support.", "Can I speak to someone?", "Yes, I need help", "Get an engineer."])("%j goes to support", (text) => {
    const s = type(atStillPlaying(), text);
    expect(s.step.kind).toBe("support");
    expect(describeStep(s).prompt).toMatch(/have not been configured/);
    expect(answeredStillPlaying(s)).toEqual([]);
  });

  it("works from the very first message", () => {
    expect(type(createConversation(), "Can I talk to a person please").step.kind).toBe("support");
  });

  it("'I don't need help' is not a support request", () => {
    expect(understand("I don't need help, it's fine").helpRequest).toBe(false);
  });

  it("never shows a phone number or contact details", () => {
    const s = type(createConversation(), "get an engineer");
    expect(describeStep(s).prompt).not.toMatch(/\d{3}/);
  });
});

describe("A5 — silence on air", () => {
  it.each(["We're off air!", "dead air", "There's nothing going out", "the station is silent"])("%j is urgent immediately", (text) => {
    const s = type(createConversation(), text);
    expect(nodeId(s)).toBe("outcome-urgent");
    expect(s.urgent).toBe(true);
    expect(describeStep(s).urgent).toBe(true);
  });

  it("possible silence asks one short question first", () => {
    const s = type(createConversation(), "everything has gone silent");
    expect(nodeId(s)).toBe("hear-on-air");
    expect(nodeId(type(s, "yes"))).toBe("outcome-urgent");
  });

  it("the urgent outcome doesn't recommend restarting or pressing controls", () => {
    const s = type(createConversation(), "dead air");
    const prompt = describeStep(s).prompt;
    expect(prompt).toMatch(/don't restart equipment or press controls/);
    expect(prompt).not.toMatch(/press the|restart the|turn (it )?off/i);
  });

  it("urgency is kept in the summary even after moving on", () => {
    let s = type(createConversation(), "dead air");
    s = type(s, "the green button isn't working either");
    expect(buildSupportSummary(s)).toMatch(/^URGENT: silence on air reported$/m);
  });

  it("'it's not silent' does not escalate", () => {
    let s = atStillPlaying();
    s = type(s, "No, it's not silent but it's the wrong song");
    expect(nodeId(s)).not.toBe("outcome-urgent");
    expect(s.urgent).toBe(false);
    expect(understand("No, it's not silent").negatedSignals).toEqual(["silence"]);
  });
});
