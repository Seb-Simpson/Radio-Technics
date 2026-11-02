import { describe, expect, it } from "vitest";
import { flowNodes } from "@/data/troubleshooting-flows";
import { getAllEquipment } from "@/lib/content/equipment";
import { buildSupportSummary, createConversation, describeStep, respond } from "@/lib/troubleshooter/engine";
import { interpret } from "@/lib/troubleshooter/interpret";
import type { ConversationState, EngineContext, Step } from "@/lib/troubleshooter/types";
import { validateWorkspaceCommands } from "@/lib/workspace/commands";

const noSelection: EngineContext = { selectedEquipmentId: null };

function say(state: ConversationState, text: string, context = noSelection) {
  return respond(state, { type: "text", text }, context);
}

function choose(state: ConversationState, label: string) {
  const option = describeStep(state).options.find((o) => o.label === label);
  if (!option) throw new Error(`No option "${label}". Options: ${describeStep(state).options.map((o) => o.label).join(", ")}`);
  return respond(state, { type: "option", optionId: option.id }, noSelection);
}

const lastAssistant = (state: ConversationState) => [...state.messages].reverse().find((m) => m.role === "assistant")?.text;

describe("interpreter", () => {
  it.each([
    ["It's not doing anything.", "vague"],
    ["it isn't working", "vague"],
    ["The green thing isn't working.", "equipment"],
    ["My microphone is broken.", "ambiguous"],
    ["The next song won't play.", "ambiguous"],
    ["A black wire isn't plugged in.", "cable"],
    ["I can't hear anything.", "hearing"],
    ["The fax machine is broken", "unknown"],
    ["banana", "unknown"],
  ])("%s → %s", (text, kind) => {
    expect(interpret(text).kind).toBe(kind);
  });

  it("resolves the green thing to the green button", () => {
    expect(interpret("The green thing isn't working")).toEqual({ kind: "equipment", equipmentId: "green-next-button" });
  });

  it("asks between microphones and between Myriad/button", () => {
    expect(interpret("My microphone isn't working")).toEqual({
      kind: "ambiguous",
      equipmentIds: ["presenter-microphone", "guest-microphones"],
    });
    expect(interpret("The next song won't play")).toEqual({
      kind: "ambiguous",
      equipmentIds: ["myriad-playout", "green-next-button"],
    });
  });
});

describe("scenario 1 — vague description", () => {
  it("asks what isn't responding and accepts an answer", () => {
    let { state } = say(createConversation(), "It's not doing anything.");
    expect(lastAssistant(state)).toMatch(/^What isn't responding\?/);
    const view = describeStep(state);
    expect(view.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["Green Myriad button", "I'm not sure", "Show me where", "I need technical support"]),
    );

    // Identify by text…
    const byText = say(state, "the mixing desk");
    expect(byText.state.step).toEqual({ kind: "node", nodeId: "generic-symptom" });
    expect(lastAssistant(byText.state)).toBe("What's happening with the mixing console?");

    // …or by selecting in the Studio Explorer.
    ({ state } = respond(state, { type: "equipment", equipmentId: "green-next-button" }, noSelection));
    expect(state.equipmentId).toBe("green-next-button");
    expect(lastAssistant(state)).toBe("What happened on the Myriad screen after you pressed the green button?");
  });

  it("'Show me where' with no equipment opens the explorer without guessing", () => {
    const { state } = say(createConversation(), "It's not doing anything.");
    const result = choose(state, "Show me where");
    expect(result.commands).toEqual([{ type: "open_studio_explorer" }]);
    expect(result.state.step).toEqual(state.step);
  });
});

describe("scenario 2 — green button selected in the Studio Explorer", () => {
  it("confirms the button, then asks about the Myriad screen", () => {
    let { state } = say(createConversation(), "It's not working.", { selectedEquipmentId: "green-next-button" });
    expect(lastAssistant(state)).toBe("Are you referring to the green button that advances Myriad to the next song?");

    let commands;
    ({ state, commands } = say(state, "yes"));
    expect(lastAssistant(state)).toBe("What happened on the Myriad screen after you pressed the green button?");
    expect(commands).toContainEqual({ type: "select_equipment", equipmentId: "green-next-button" });

    ({ state } = choose(state, "Nothing changed"));
    expect(lastAssistant(state)).toBe("Is the song that was already playing still playing?");

    ({ state } = choose(state, "No — there's silence"));
    expect(describeStep(state).urgent).toBe(true);
    expect(describeStep(state).kind).toBe("outcome");
  });

  it("'No, something else' asks which equipment instead", () => {
    let { state } = say(createConversation(), "It's not working.", { selectedEquipmentId: "green-next-button" });
    ({ state } = choose(state, "No, something else"));
    expect(state.step.kind).toBe("choose");
  });

  it("ignores an invalid workspace selection", () => {
    const { state } = say(createConversation(), "It's not working.", { selectedEquipmentId: "toaster" });
    expect(state.step).toMatchObject({ kind: "choose", reason: "vague" });
  });
});

describe("scenario 3 — microphone", () => {
  it("narrows down with one question at a time and never diagnoses", () => {
    let { state } = say(createConversation(), "My microphone isn't working.");
    expect(state.step).toMatchObject({ kind: "choose", reason: "ambiguous" });
    expect(describeStep(state).options.filter((o) => o.kind === "answer").map((o) => o.label)).toEqual([
      "Presenter microphone",
      "Guest microphones",
    ]);

    ({ state } = choose(state, "Presenter microphone"));
    expect(lastAssistant(state)).toBe("What's the problem with the presenter microphone?");

    ({ state } = choose(state, "Other people can't hear it"));
    expect(lastAssistant(state)).toMatch(/level meters move/);

    const shown = choose(state, "Show me where");
    expect(shown.commands).toContainEqual({ type: "highlight_equipment", equipmentId: "audio-level-meters" });

    ({ state } = choose(state, "No, they don't move"));
    ({ state } = choose(state, "Yes, it was working earlier"));
    const view = describeStep(state);
    expect(view.kind).toBe("outcome");
    expect(view.prompt).toMatch(/won't guess at a fix/);

    const summary = buildSupportSummary(state);
    expect(summary).toContain("Equipment: Presenter microphone");
    expect(summary).toContain("No, they don't move");
  });
});

describe("universal responses", () => {
  it("every question offers I'm not sure / Show me where / I need technical support", () => {
    let { state } = say(createConversation(), "The green thing isn't working");
    for (let i = 0; i < 3; i++) {
      const view = describeStep(state);
      if (view.kind !== "question") break;
      expect(view.options.filter((o) => o.kind === "universal").map((o) => o.label)).toEqual([
        "I'm not sure",
        "Show me where",
        "I need technical support",
      ]);
      ({ state } = choose(state, view.options[0]!.label));
    }
  });

  it("'I need technical support' shows support and can return to the question", () => {
    let { state } = say(createConversation(), "I can't hear anything");
    const before = state.step;
    ({ state } = choose(state, "I need technical support"));
    expect(state.step.kind).toBe("support");
    ({ state } = choose(state, "Go back to my last question"));
    expect(state.step).toEqual(before);
  });

  it("'I'm not sure' always moves somewhere useful", () => {
    let { state } = say(createConversation(), "The green thing isn't working");
    ({ state } = choose(state, "I'm not sure"));
    expect(state.step.kind).toBe("choose");
    ({ state } = choose(state, "Green Myriad button"));
    ({ state } = choose(state, "I'm not sure"));
    expect(state.step).toEqual({ kind: "node", nodeId: "gb-find-screen" });
  });
});

describe("safety and robustness", () => {
  it("rejects unknown equipment from the explorer without changing step", () => {
    const start = createConversation();
    const { state, commands } = respond(start, { type: "equipment", equipmentId: "toaster" }, noSelection);
    expect(state.step).toEqual(start.step);
    expect(commands).toEqual([]);
    expect(state.messages.at(-1)?.role).toBe("notice");
  });

  it("asks for clarification for unknown equipment descriptions", () => {
    const { state } = say(createConversation(), "The fax machine is broken");
    expect(state.step).toMatchObject({ kind: "choose", reason: "unknown" });
  });

  it("keeps the user's place when an answer isn't understood", () => {
    let { state } = say(createConversation(), "I can't hear anything");
    const before = state.step;
    ({ state } = say(state, "purple monkey dishwasher"));
    expect(state.step).toEqual(before);
    expect(state.messages.some((m) => m.role === "assistant" && /noted that/.test(m.text))).toBe(true);
    expect(state.observations.at(-1)?.text).toBe("purple monkey dishwasher");
  });

  it("handles stale option IDs and empty input", () => {
    const start = createConversation();
    expect(respond(start, { type: "option", optionId: "opt:does-not-exist" }, noSelection).state.step).toEqual(start.step);
    expect(say(start, "   ").state.messages.at(-1)?.role).toBe("notice");
  });

  it("routes cable reports to a caution-first question", () => {
    const { state } = say(createConversation(), "A black wire isn't plugged in.");
    expect(state.step).toEqual({ kind: "node", nodeId: "cable-where" });
    expect(describeStep(state).help).toMatch(/don't plug in or move cables/);
  });

  it("typed 'start again' explains the button instead of clearing the conversation", () => {
    const { state } = say(createConversation(), "I can't hear anything");
    const after = say(state, "start again").state;
    expect(after.step).toEqual(state.step);
    expect(after.observations.map((o) => o.text)).toContain("I can't hear anything");
    expect(lastAssistant(after)).toMatch(/Start again/);
  });

  it("only the explicit restart option clears the conversation", () => {
    let { state } = say(createConversation(), "I can't hear anything");
    ({ state } = choose(state, "I need technical support"));
    expect(choose(state, "Start a new problem").state.step).toEqual({ kind: "start" });
  });

  it("only ever emits valid workspace commands", () => {
    for (const record of getAllEquipment()) {
      let { state } = respond(createConversation(), { type: "equipment", equipmentId: record.id }, noSelection);
      const shown = choose(state, "Show me where");
      expect(validateWorkspaceCommands(shown.commands).errors).toEqual([]);
      ({ state } = shown);
    }
  });
});

describe("no dead ends", () => {
  /** Explore every reachable step from every equipment entry point. */
  it("every reachable step offers a way forward", () => {
    const seen = new Set<string>();
    const queue: ConversationState[] = [];
    for (const record of getAllEquipment()) {
      queue.push(respond(createConversation(), { type: "equipment", equipmentId: record.id }, noSelection).state);
    }
    for (const text of ["I can't hear anything", "a wire is unplugged", "It's not working", "The next song won't play"]) {
      queue.push(say(createConversation(), text).state);
    }
    const key = (step: Step) => JSON.stringify(step);
    while (queue.length > 0) {
      const state = queue.shift()!;
      if (seen.has(key(state.step))) continue;
      seen.add(key(state.step));
      const view = describeStep(state);
      expect(view.options.length, `${key(state.step)} has no options`).toBeGreaterThan(0);
      if (view.kind === "question") {
        expect(view.options.some((o) => o.id === "u-support")).toBe(true);
      }
      if (view.kind === "outcome") {
        expect(view.options.some((o) => o.kind === "restart")).toBe(true);
      }
      for (const option of view.options) {
        if (option.kind === "restart" || option.id === "u-show") continue;
        queue.push(respond(state, { type: "option", optionId: option.id }, noSelection).state);
      }
    }
    // All static nodes are reachable.
    for (const node of flowNodes) {
      expect(seen.has(key({ kind: "node", nodeId: node.id })), `${node.id} unreachable`).toBe(true);
    }
  });
});
