import { flowNodes, troubleshootingTopics } from "@/data/troubleshooting-flows";
import { getAllEquipment, getEquipmentById, isKnownEquipmentId } from "@/lib/content/equipment";
import { showEquipmentCommands, type WorkspaceCommand } from "@/lib/workspace/commands";
import { containsPhrase, interpret, matchEquipment } from "./interpret";
import type {
  ChatMessage,
  ChooseReason,
  ConversationState,
  EngineContext,
  EngineResult,
  FlowNode,
  Step,
  StepOption,
  StepView,
  UserInput,
} from "./types";

/**
 * Deterministic troubleshooting engine for the RT-001 prototype.
 *
 * Pure functions only: (state, input, context) → (new state, UI commands).
 * Nothing here talks to a network, an AI model or studio hardware.
 */

const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
const FALLBACK_ENTRY_NODE = "generic-symptom";
const MAX_INPUT_LENGTH = 500;

export const UNIVERSAL_OPTIONS: StepOption[] = [
  { id: "u-unsure", label: "I'm not sure", kind: "universal" },
  { id: "u-show", label: "Show me where", kind: "universal" },
  { id: "u-support", label: "I need technical support", kind: "universal" },
];

const RESTART_OPTION: StepOption = { id: "restart", label: "Start a new problem", kind: "restart" };
const SUPPORT_OPTION = UNIVERSAL_OPTIONS[2]!;
const SHOW_OPTION = UNIVERSAL_OPTIONS[1]!;

const UNIVERSAL_MATCHES: Record<string, string[]> = {
  "u-unsure": ["not sure", "i'm not sure", "im not sure", "unsure", "don't know", "dont know", "i don't know", "no idea", "dunno"],
  "u-show": ["show me", "show me where", "where is it", "where is that", "where's that"],
  "u-support": ["technical support", "tech support", "support", "engineer", "call an engineer", "get help"],
};
const RESTART_MATCHES = ["start again", "start over", "restart", "new problem", "reset"];
const YES_MATCHES = ["yes", "yeah", "yep", "y", "correct", "that's right", "thats right", "that's it", "that one"];
const NO_MATCHES = ["no", "nope", "n", "not that", "something else", "wrong one"];

export const GREETING =
  "Hello. Tell me what's wrong in your own words — for example “the green button isn't working” — or choose a common problem below.";

/* ------------------------------------------------------------------ */
/* State helpers                                                       */
/* ------------------------------------------------------------------ */

export function getFlowNode(id: string): FlowNode | undefined {
  return nodesById.get(id);
}

function addMessage(state: ConversationState, message: Omit<ChatMessage, "id">): ConversationState {
  const seq = state.seq + 1;
  return { ...state, seq, messages: [...state.messages, { ...message, id: `m${seq}` }] };
}

function fillTemplate(text: string, equipmentId: string | null): string {
  const record = getEquipmentById(equipmentId);
  return text.replace(/\{equipment\}/g, record ? record.shortName : "equipment");
}

const choosePrompts: Record<ChooseReason, string> = {
  ambiguous: "I want to make sure I've got the right thing. Which of these do you mean?",
  vague: "What isn't responding? Choose it below, describe it, or pick it in the Studio Explorer.",
  unknown: "I couldn't match that to any equipment recorded for this studio. Which of these is closest?",
  other: "Which piece of equipment do you mean?",
};

export function describeStep(state: ConversationState): StepView {
  const { step } = state;
  switch (step.kind) {
    case "start":
      return {
        kind: "start",
        prompt: GREETING,
        options: [
          ...troubleshootingTopics.map((topic) => ({ id: `topic:${topic.id}`, label: topic.label, kind: "topic" as const })),
          SUPPORT_OPTION,
        ],
        equipmentId: null,
      };
    case "node": {
      const node = nodesById.get(step.nodeId);
      if (!node) {
        // Should be impossible (content is validated), but never strand the user.
        return { kind: "outcome", prompt: "Something went wrong with this conversation.", options: [SUPPORT_OPTION, RESTART_OPTION], equipmentId: null };
      }
      const equipmentId = node.showEquipmentId ?? state.equipmentId;
      if (node.kind === "outcome") {
        return {
          kind: "outcome",
          prompt: fillTemplate(node.prompt, state.equipmentId),
          help: node.help,
          urgent: node.urgent,
          options: [...(equipmentId ? [SHOW_OPTION] : []), RESTART_OPTION],
          equipmentId,
        };
      }
      return {
        kind: "question",
        prompt: fillTemplate(node.prompt, state.equipmentId),
        help: node.help,
        options: [
          ...node.options.map((option) => ({ id: `opt:${option.id}`, label: option.label, kind: "answer" as const })),
          ...UNIVERSAL_OPTIONS,
        ],
        equipmentId,
      };
    }
    case "confirm": {
      const record = getEquipmentById(step.equipmentId);
      return {
        kind: "question",
        prompt: record
          ? `Are you referring to the ${record.shortName} ${record.confirmationPhrase}?`
          : "Which piece of equipment do you mean?",
        options: [
          { id: "confirm:yes", label: "Yes, that's it", kind: "answer" },
          { id: "confirm:no", label: "No, something else", kind: "answer" },
          ...UNIVERSAL_OPTIONS,
        ],
        equipmentId: step.equipmentId,
      };
    }
    case "choose":
      return {
        kind: "question",
        prompt: choosePrompts[step.reason],
        options: [
          ...step.equipmentIds.flatMap((id) => {
            const record = getEquipmentById(id);
            return record ? [{ id: `equip:${id}`, label: record.name, kind: "answer" as const }] : [];
          }),
          ...UNIVERSAL_OPTIONS,
        ],
        equipmentId: step.equipmentIds.length === 1 ? (step.equipmentIds[0] ?? null) : null,
      };
    case "support":
      return {
        kind: "support",
        prompt:
          "Please contact the station's technical support. Their contact details haven't been added to Radio Technics yet — the station needs to provide them. You can read out or copy the summary below.",
        options: [
          { id: "back", label: "Go back to my last question", kind: "back" },
          RESTART_OPTION,
        ],
        equipmentId: state.equipmentId,
      };
  }
}

function enterStep(state: ConversationState, step: Step): ConversationState {
  const next = { ...state, step };
  const view = describeStep(next);
  return addMessage(next, { role: "assistant", text: view.prompt, help: view.help, urgent: view.urgent });
}

function recordAnswer(state: ConversationState, answer: string): ConversationState {
  const question = describeStep(state).prompt;
  return { ...state, answers: [...state.answers, { question, answer }] };
}

function allEquipmentIds(): string[] {
  return getAllEquipment().map((record) => record.id);
}

/** Equipment is identified unambiguously: begin its troubleshooting flow. */
function beginEquipmentFlow(state: ConversationState, equipmentId: string, commands: WorkspaceCommand[]): EngineResult {
  const record = getEquipmentById(equipmentId);
  const entry = record?.flowEntryNodeId && nodesById.has(record.flowEntryNodeId) ? record.flowEntryNodeId : FALLBACK_ENTRY_NODE;
  const next = enterStep({ ...state, equipmentId }, { kind: "node", nodeId: entry });
  return { state: next, commands: [...commands, { type: "select_equipment", equipmentId }] };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function createConversation(): ConversationState {
  const base: ConversationState = { step: { kind: "start" }, equipmentId: null, messages: [], answers: [], seq: 0 };
  return addMessage(base, { role: "assistant", text: GREETING });
}

export function respond(state: ConversationState, input: UserInput, context: EngineContext): EngineResult {
  switch (input.type) {
    case "option":
      return handleOption(state, input.optionId);
    case "text":
      return handleText(state, input.text, context);
    case "equipment":
      return handleExplorerSelection(state, input.equipmentId);
    case "topic": {
      const topic = troubleshootingTopics.find((t) => t.id === input.topicId);
      if (!topic) return { state: addMessage(state, { role: "notice", text: "That topic isn't available." }), commands: [] };
      return handleText(state, topic.utterance, { selectedEquipmentId: null });
    }
  }
}

/**
 * @param displayText What the user typed, if they answered by typing rather
 *   than pressing the option. Shown in the transcript instead of the label.
 */
function handleOption(state: ConversationState, optionId: string, displayText?: string): EngineResult {
  const view = describeStep(state);
  const option = view.options.find((o) => o.id === optionId);
  if (!option) {
    return { state: addMessage(state, { role: "notice", text: "That option isn't available any more. Please choose one of the current options." }), commands: [] };
  }

  if (option.kind === "topic") {
    return respond(state, { type: "topic", topicId: optionId.slice("topic:".length) }, { selectedEquipmentId: null });
  }
  if (option.id === "restart") return { state: createConversation(), commands: [] };

  let s = addMessage(state, { role: "user", text: displayText ?? option.label });

  switch (option.id) {
    case "u-support":
      return { state: enterStep(s, { kind: "support", returnTo: state.step }), commands: [] };
    case "back":
      return { state: enterStep(s, state.step.kind === "support" ? state.step.returnTo : { kind: "start" }), commands: [] };
    case "u-show": {
      if (view.equipmentId) {
        const record = getEquipmentById(view.equipmentId);
        s = addMessage(s, {
          role: "assistant",
          text: `I've highlighted the ${record?.shortName ?? "equipment"} in the Studio Explorer.`,
        });
        return { state: s, commands: showEquipmentCommands(view.equipmentId) };
      }
      s = addMessage(s, {
        role: "assistant",
        text: "I've opened the Studio Explorer. Select the item you mean, then choose “Use in troubleshooter”.",
      });
      return { state: s, commands: [{ type: "open_studio_explorer" }] };
    }
    case "u-unsure":
      return handleUnsure(recordAnswer(s, option.label), state.step);
  }

  s = recordAnswer(s, option.label);
  const step = state.step;

  if (step.kind === "confirm") {
    if (option.id === "confirm:yes") return beginEquipmentFlow(s, step.equipmentId, []);
    return { state: enterStep(s, { kind: "choose", equipmentIds: allEquipmentIds(), reason: "other" }), commands: [] };
  }

  if (step.kind === "choose" && option.id.startsWith("equip:")) {
    const equipmentId = option.id.slice("equip:".length);
    return beginEquipmentFlow(s, equipmentId, []);
  }

  if (step.kind === "node" && option.id.startsWith("opt:")) {
    const node = nodesById.get(step.nodeId);
    const flowOption = node?.options.find((o) => `opt:${o.id}` === option.id);
    if (flowOption) {
      const commands: WorkspaceCommand[] = [];
      if (flowOption.setEquipmentId) {
        s = { ...s, equipmentId: flowOption.setEquipmentId };
        commands.push({ type: "select_equipment", equipmentId: flowOption.setEquipmentId });
      }
      return { state: enterStep(s, { kind: "node", nodeId: flowOption.next }), commands };
    }
  }

  return { state: enterStep(s, step), commands: [] };
}

function handleUnsure(state: ConversationState, step: Step): EngineResult {
  switch (step.kind) {
    case "node": {
      const node = nodesById.get(step.nodeId);
      if (node?.unsureNext) {
        const s = addMessage(state, { role: "assistant", text: "That's fine — let's try something else." });
        return { state: enterStep(s, { kind: "node", nodeId: node.unsureNext }), commands: [] };
      }
      return { state: enterStep(state, { kind: "support", returnTo: step }), commands: [] };
    }
    case "confirm":
    case "start": {
      const s = addMessage(state, { role: "assistant", text: "No problem." });
      return { state: enterStep(s, { kind: "choose", equipmentIds: allEquipmentIds(), reason: "other" }), commands: [] };
    }
    case "choose": {
      const s = addMessage(state, {
        role: "assistant",
        text: "That's okay. Choose “Show me where” to look around the studio, or ask for technical support.",
      });
      return { state: s, commands: [] };
    }
    case "support":
      return { state, commands: [] };
  }
}

function handleExplorerSelection(state: ConversationState, equipmentId: string): EngineResult {
  if (!isKnownEquipmentId(equipmentId)) {
    return {
      state: addMessage(state, {
        role: "notice",
        text: "That item isn't in the studio's equipment list, so I can't use it. Please choose another item.",
      }),
      commands: [],
    };
  }
  const record = getEquipmentById(equipmentId)!;
  let s = addMessage(state, { role: "user", text: `I've selected the ${record.shortName} in the Studio Explorer.` });
  s = { ...s, answers: [...s.answers, { question: "Equipment selected in Studio Explorer", answer: record.name }] };
  return beginEquipmentFlow(s, equipmentId, []);
}

function findOptionFromText(view: StepView, text: string, state: ConversationState): string | null {
  // Exact label match.
  const lower = text.trim().toLowerCase();
  // Topic shortcuts are excluded: their text is handled by the interpreter.
  const byLabel = view.options.find((o) => o.kind !== "topic" && o.label.toLowerCase() === lower);
  if (byLabel) return byLabel.id;

  if (view.options.some((o) => o.id === "confirm:yes")) {
    if (containsPhrase(text, YES_MATCHES)) return "confirm:yes";
    if (containsPhrase(text, NO_MATCHES)) return "confirm:no";
  }

  if (state.step.kind === "node") {
    const node = nodesById.get(state.step.nodeId);
    for (const option of node?.options ?? []) {
      if (option.match && containsPhrase(text, option.match)) return `opt:${option.id}`;
    }
  }

  for (const [id, phrases] of Object.entries(UNIVERSAL_MATCHES)) {
    if (view.options.some((o) => o.id === id) && containsPhrase(text, phrases)) return id;
  }
  return null;
}

function handleText(state: ConversationState, rawText: string, context: EngineContext): EngineResult {
  const text = rawText.trim().slice(0, MAX_INPUT_LENGTH);
  if (!text) {
    return { state: addMessage(state, { role: "notice", text: "Please type a description, or choose one of the options." }), commands: [] };
  }

  if (containsPhrase(text, RESTART_MATCHES)) {
    return { state: createConversation(), commands: [] };
  }

  const view = describeStep(state);
  const optionId = findOptionFromText(view, text, state);
  if (optionId) return handleOption(state, optionId, text);

  let s = addMessage(state, { role: "user", text });

  // When choosing between specific candidates, look for them first.
  if (state.step.kind === "choose") {
    const candidateIds = state.step.equipmentIds;
    const candidates = getAllEquipment().filter((record) => candidateIds.includes(record.id));
    const match = matchEquipment(text, candidates);
    const [only] = match.equipmentIds;
    if (match.equipmentIds.length === 1 && only) {
      s = recordAnswer(s, text);
      return beginEquipmentFlow(s, only, []);
    }
  }

  const interpretation = interpret(text);
  const describe = (st: ConversationState) => ({ ...st, answers: [...st.answers, { question: "Problem described", answer: text }] });

  switch (interpretation.kind) {
    case "cable":
      return { state: enterStep(describe({ ...s, equipmentId: null }), { kind: "node", nodeId: "cable-where" }), commands: [] };
    case "hearing":
      return { state: enterStep(describe({ ...s, equipmentId: null }), { kind: "node", nodeId: "hear-where" }), commands: [] };
    case "equipment":
      return { state: enterStep(describe(s), { kind: "confirm", equipmentId: interpretation.equipmentId }), commands: [] };
    case "ambiguous":
      return { state: enterStep(describe(s), { kind: "choose", equipmentIds: interpretation.equipmentIds, reason: "ambiguous" }), commands: [] };
    case "vague": {
      if (context.selectedEquipmentId && isKnownEquipmentId(context.selectedEquipmentId)) {
        return { state: enterStep(describe(s), { kind: "confirm", equipmentId: context.selectedEquipmentId }), commands: [] };
      }
      return { state: enterStep(describe(s), { kind: "choose", equipmentIds: allEquipmentIds(), reason: "vague" }), commands: [] };
    }
    case "unknown": {
      const awaitingAnswer = view.kind === "question";
      if (!awaitingAnswer) {
        return { state: enterStep(describe(s), { kind: "choose", equipmentIds: allEquipmentIds(), reason: "unknown" }), commands: [] };
      }
      // Mid-question: don't lose the user's place.
      s = addMessage(s, {
        role: "assistant",
        text: "Sorry, I didn't understand that. Please choose one of the options below, or describe the problem in a different way.",
      });
      return { state: s, commands: [] };
    }
  }
}

/** Plain-text summary a presenter can read out or copy to technical support. */
export function buildSupportSummary(state: ConversationState): string {
  const record = getEquipmentById(state.equipmentId);
  const lines = [
    "Radio Technics — problem summary (prototype)",
    `Equipment: ${record ? record.name : "not identified yet"}`,
  ];
  if (state.answers.length > 0) {
    lines.push("", "What was reported:");
    for (const { question, answer } of state.answers) lines.push(`- ${question} → ${answer}`);
  } else {
    lines.push("", "No details recorded yet.");
  }
  return lines.join("\n");
}
