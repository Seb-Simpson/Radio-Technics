/**
 * RT-QA-002D regressions (RT-002D-R1).
 *
 * Every expected meaning below is written by hand from the audit's sentences
 * and the brief — no parser function (extractClaims, claimValue,
 * classifyBroadcast) is used to decide what a sentence "should" mean.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Troubleshooter } from "@/components/troubleshooter/Troubleshooter";
import { replayEvents, SESSION_KEY, type SessionEvent } from "@/lib/session/storage";
import { buildSupportSummary, createConversation, describeStep, MAX_INPUT_LENGTH, respond } from "@/lib/troubleshooter/engine";
import type { ConversationState, UserInput } from "@/lib/troubleshooter/types";
import { renderWithProviders } from "./render";

const ctx = { selectedEquipmentId: null };
const send = (s: ConversationState, input: UserInput) => respond(s, input, ctx);
const type = (s: ConversationState, text: string) => send(s, { type: "text", text }).state;
const press = (s: ConversationState, optionId: string) => send(s, { type: "option", optionId, instanceId: s.instance }).state;
const at = (s: ConversationState) => (s.step.kind === "node" || s.step.kind === "check" ? `${s.step.kind}:${s.step.nodeId}` : s.step.kind);

/** Walk the real flow to a question (no hand-built states). */
function toMicMeters() {
  let s = type(createConversation(), "My microphone isn't working");
  s = press(s, describeStep(s).options.find((o) => o.label === "Presenter microphone")!.id);
  if (s.step.kind === "confirm") s = press(s, "confirm:yes");
  return press(s, "opt:not-heard"); // → mic-meters
}
const toMicSince = () => press(toMicMeters(), "opt:move");
const toMicHeadphones = () => {
  let s = type(createConversation(), "My microphone isn't working");
  s = press(s, describeStep(s).options.find((o) => o.label === "Presenter microphone")!.id);
  if (s.step.kind === "confirm") s = press(s, "confirm:yes");
  return press(s, "opt:not-in-headphones");
};
const toFindScreen = () => press(press(type(createConversation(), "The green thing isn't working"), "confirm:yes"), "opt:cant-see");

describe("1. one authoritative path: typed text never creates an answer", () => {
  it.each([
    ["mic-since", toMicSince, "It was working last week, but not today."],
    ["gb-find-screen", toFindScreen, "I found it impossible to see the Myriad screen."],
    ["mic-meters", toMicMeters, "yes"],
    ["mic-meters", toMicMeters, "Yes, they move"],
    ["mic-headphones", toMicHeadphones, "No, I can't hear anything"],
  ])("on %s, %j records nothing (audit: recorded a false answer)", (_node, make, text) => {
    const s0 = make();
    const s = type(s0, text);
    expect(s.answers).toEqual(s0.answers);
  });

  it("a pending suggestion is never confirmed by typing — 'yes they do' against 'they don't move' (audit)", () => {
    let s = type(toMicMeters(), "The meters have stopped moving.");
    expect(describeStep(s).prompt).toMatch(/aren't moving/);
    const before = s.answers;
    s = type(s, "yes they do");
    expect(s.answers).toEqual(before);
    s = type(s, "yes");
    expect(s.answers).toEqual(before);
  });

  it("'I can' against 'I can't hear anything' records nothing (audit)", () => {
    let s = type(toMicHeadphones(), "I can't hear anything in them");
    const before = s.answers;
    s = type(s, "I can");
    expect(s.answers).toEqual(before);
  });

  it("the presenter sees exactly what they agree to: the recorded answer is the pressed button's label", () => {
    let s = type(toMicMeters(), "The meters have stopped moving.");
    const shown = describeStep(s).options.find((o) => o.id === "opt:still")!;
    s = press(s, "opt:still");
    expect(s.answers.at(-1)).toMatchObject({ answer: shown.label, optionId: "opt:still", source: "confirmed-interpretation" });
  });

  it("multi-turn: several typed replies, then button presses — only the presses are answers", () => {
    let s = toMicMeters();
    const start = s.answers.length;
    for (const t of ["they're not doing much", "hmm", "no", "they move I think", "not sure"]) s = type(s, t);
    expect(s.answers).toHaveLength(start);
    s = press(s, "opt:move");
    s = type(s, "It was working last week, but not today.");
    s = press(s, "opt:no");
    // Both answers come from presses (pressing a suggested answer is recorded as confirming it).
    expect(s.answers.slice(start).map((a) => a.answer)).toEqual(["Yes, they move", "No, it hasn't worked today"]);
    expect(s.answers.slice(start).every((a) => a.source === "button" || a.source === "confirmed-interpretation")).toBe(true);
  });
});

describe("2. every press is bound to its question instance", () => {
  it("an option from an earlier instance is refused, even when the ID exists on the new question", () => {
    const meters = toMicMeters(); // both mic-meters and mic-since have "opt:yes"/"opt:move" style IDs
    const next = press(meters, "opt:move");
    const stale = send(next, { type: "option", optionId: "opt:yes", instanceId: meters.instance });
    expect(stale.rejected).toBeTruthy();
    expect(stale.state).toBe(next);
  });

  it("a double activation can't answer the next question: the second press carries the old instance", () => {
    const s0 = toMicMeters();
    const first = send(s0, { type: "option", optionId: "opt:move", instanceId: s0.instance });
    const second = send(first.state, { type: "option", optionId: "opt:yes", instanceId: s0.instance });
    expect(second.rejected).toBeTruthy();
    expect(second.state.answers).toEqual(first.state.answers);
  });

  it("switching equipment makes a pending suggestion obsolete", () => {
    const pending = type(toMicMeters(), "The meters have stopped moving.");
    expect(pending.step.kind).toBe("check");
    const switched = send(pending, { type: "equipment", equipmentId: "green-next-button" }).state;
    const late = send(switched, { type: "option", optionId: "opt:still", instanceId: pending.instance });
    expect(late.rejected).toBeTruthy();
    expect(late.state.answers.some((a) => a.optionId === "opt:still")).toBe(false);
  });

  it("refused inputs are never replayable: a stored stale press makes the whole session unrestorable", () => {
    const events: SessionEvent[] = [
      { input: { type: "text", text: "The green thing isn't working" }, selectedEquipmentId: null },
      { input: { type: "option", optionId: "confirm:yes", instanceId: 1 }, selectedEquipmentId: null },
    ];
    expect(replayEvents(events)).not.toBeNull();
    expect(replayEvents([...events, { input: { type: "option", optionId: "confirm:yes", instanceId: 1 }, selectedEquipmentId: null }])).toBeNull();
  });
});

describe("3. broadcast incidents: facts separated from status", () => {
  const status = (text: string) => type(createConversation(), text);
  it.each([
    // [sentence, expected incident status, confirmed?] — written by hand from the audit and brief
    ["We are off air, not back on air yet.", "confirmed", true],
    ["We are off air. The headphones are working now.", "confirmed", true],
    ["I can hear it here, but the listeners can't.", "confirmed", true],
    ["Aren't we off air?", "possible", false],
    ["I'm not saying we're off air.", "possible", false],
    ["The transmitter has failed and nobody can receive us.", "confirmed", true],
    ["We cannot broadcast at all right now.", "confirmed", true],
    ["We have stopped broadcasting.", "confirmed", true],
    ["We aren't on air.", "confirmed", true],
    ["Are we off air?", "possible", false],
  ])("%j → %s", (text, expected, confirmed) => {
    const s = status(text);
    expect(s.incident.status).toBe(expected);
    expect(s.confirmedOffAir).toBe(confirmed);
    expect(s.urgent).toBe(true);
  });

  it.each([
    ["We were off air earlier, but everything's working now.", "historical"],
    ["We would be off air if I restarted.", "hypothetical"],
    ["It is not true that we're off air.", "denied"],
    ["What happens if we go off air?", "hypothetical"],
  ])("%j is recorded as %s and raises no urgency", (text, kind) => {
    const s = status(text);
    expect(s.incident.status).toBe("none");
    expect(s.urgent).toBe(false);
    expect(s.incident.entries.at(-1)).toMatchObject({ kind, evidence: text });
  });

  it("an outage followed later by LOCAL headphone recovery stays an outage", () => {
    let s = status("We're off air.");
    s = type(s, "The headphones are working now.");
    s = type(s, "Everything's working now in here.");
    expect(s.incident.status).toBe("confirmed");
  });

  it("a reported resumption is the presenter's report, never verified, and history is kept", () => {
    let s = status("We're off air.");
    s = type(s, "We're back on air now.");
    expect(s.incident.status).toBe("reported-resumed");
    expect(s.urgent).toBe(true); // urgency is history, never erased
    expect(s.incident.entries.map((e) => e.kind)).toEqual(["current", "resumed"]);
    const summary = buildSupportSummary(s);
    expect(summary).toMatch(/reports broadcasting has resumed \(not independently verified\)/);
    expect(summary).toMatch(/Reported as happening now — stated as fact: “We're off air\.”/);
  });

  it("a new report after a resumption reopens the incident", () => {
    let s = status("We're off air.");
    s = type(s, "We're back on air now.");
    s = type(s, "We're off air again!");
    expect(s.incident.status).toBe("confirmed");
  });
});

describe("4. urgent help without language understanding", () => {
  it("the off-air control works from any step, whatever was typed before", () => {
    let s = type(createConversation(), "asdf qwer zxcv");
    s = send(s, { type: "broadcast", report: "off-air" }).state;
    expect(at(s)).toBe("node:outcome-urgent");
    expect(s.incident).toMatchObject({ status: "confirmed" });
    expect(s.incident.entries.at(-1)).toMatchObject({ source: "button" });
  });

  it("'Broadcasting has resumed' needs an open incident, and is recorded as reported, not verified", () => {
    const none = send(createConversation(), { type: "broadcast", report: "resumed" });
    expect(none.rejected).toBeTruthy();
    let s = send(createConversation(), { type: "broadcast", report: "off-air" }).state;
    s = send(s, { type: "broadcast", report: "resumed" }).state;
    expect(s.incident.status).toBe("reported-resumed");
  });

  it("an ambiguous sound problem asks whether listeners or only the studio are affected", () => {
    const noSound = type(createConversation(), "there's no sound");
    expect(describeStep(noSound).prompt).toBe("Where are you trying to hear the sound?");
    expect(describeStep(noSound).options.map((o) => o.label)).toContain("Listeners say they can't hear the station");
    const silent = type(createConversation(), "everything has gone silent");
    expect(describeStep(silent).prompt).toMatch(/station might be silent on air/);
    expect(describeStep(silent).options.map((o) => o.label)).toContain("No, it's only in the studio (headphones or speakers)");
    expect(at(press(silent, "opt:studio-only"))).toBe("node:hear-where");
  });
});

describe("5. corrections supersede, never erase", () => {
  it("'My first answer was wrong' → choose the answer → choose the replacement → original kept as superseded", () => {
    let s = toMicMeters();
    s = press(s, "opt:move"); // mic-meters: "Yes, they move"
    s = type(s, "My first answer was wrong.");
    expect(s.step.kind).toBe("correct-select");
    const fix = describeStep(s).options.find((o) => o.label.includes("Yes, they move"))!;
    s = press(s, fix.id);
    expect(s.step.kind).toBe("correct");
    s = press(s, "opt:still");
    const original = s.answers.find((a) => a.answer === "Yes, they move")!;
    const replacement = s.answers.at(-1)!;
    expect(replacement).toMatchObject({ answer: "No, they don't move", corrects: s.answers.indexOf(original) });
    expect(original.supersededBy).toBe(s.answers.length - 1);
    const summary = buildSupportSummary(s);
    expect(summary).toMatch(/→ No, they don't move \(corrected — was “Yes, they move”\)/);
    expect(summary).toMatch(/Earlier answers the presenter corrected[\s\S]*Yes, they move \(superseded\)/);
    // Current answers section doesn't list the superseded one as current.
    const current = summary.split("Earlier answers the presenter corrected")[0]!;
    expect(current).not.toMatch(/→ Yes, they move/);
  });

  it("the 'Change an earlier answer' button works without any typing, and corrections replay", () => {
    let s = press(toMicMeters(), "opt:move");
    const events: UserInput[] = [];
    const go = (input: UserInput) => {
      events.push(input);
      s = send(s, input).state;
    };
    go({ type: "option", optionId: "correct", instanceId: s.instance });
    go({ type: "option", optionId: describeStep(s).options[describeStep(s).options.length - 3]!.id, instanceId: s.instance });
    expect(s.step.kind).toBe("correct");
    go({ type: "option", optionId: "back", instanceId: s.instance });
    expect(s.answers.every((a) => a.supersededBy === undefined)).toBe(true);
  });

  it("a correction to a silence answer applies its consequences (urgent), and urgency never goes back", () => {
    let s = press(press(type(createConversation(), "The green thing isn't working"), "confirm:yes"), "opt:nothing");
    s = press(s, "opt:yes"); // "Yes, it's still playing"
    s = press(s, "correct");
    s = press(s, describeStep(s).options.find((o) => o.label.includes("still playing"))!.id);
    s = press(s, "opt:no-silent");
    expect(at(s)).toBe("node:outcome-urgent");
    expect(s.urgent).toBe(true);
  });
});

describe("7. Knowledge Centre hand-off and input limits", () => {
  it("a search with a broadcast concern hands over as POSSIBLE, never as an answer", () => {
    const s = send(createConversation(), { type: "handoff", text: "we've gone off air" }).state;
    expect(s.incident.status).toBe("possible");
    expect(s.confirmedOffAir).toBe(false);
    expect(s.answers).toEqual([]);
    expect(s.incident.entries.at(-1)).toMatchObject({ source: "knowledge-handoff" });
  });

  it("a search with nothing safety-related is not handed over", () => {
    expect(send(createConversation(), { type: "handoff", text: "what is a stop chain" }).rejected).toBeTruthy();
  });

  it("the whole accepted message is classified: an outage at the very end of a long message is found", () => {
    const text = `${"The green button and the desk are both a bit odd today, ".repeat(8)}and we are off air.`;
    expect(text.length).toBeLessThanOrEqual(MAX_INPUT_LENGTH);
    expect(type(createConversation(), text).incident.status).toBe("confirmed");
  });

  it("over-long input is refused with a clear reason, never silently truncated", () => {
    const text = `${"x ".repeat(260)}we are off air`;
    const result = send(createConversation(), { type: "text", text });
    expect(result.rejected).toMatch(/longer than 500 characters/);
    expect(result.state).toEqual(createConversation());
  });

  it("the composer refuses over-long text and nothing is saved", async () => {
    renderWithProviders(<Troubleshooter />);
    fireEvent.change(screen.getByLabelText("Describe the problem"), { target: { value: "y".repeat(MAX_INPUT_LENGTH + 1) } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/the limit is 500/)).toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull());
  });
});
