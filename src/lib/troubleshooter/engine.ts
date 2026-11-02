import { flowNodes, troubleshootingTopics } from "@/data/troubleshooting-flows";
import { getAllEquipment, getEquipmentById, isKnownEquipmentId } from "@/lib/content/equipment";
import { showEquipmentCommands, type WorkspaceCommand } from "@/lib/workspace/commands";
import { interpret, matchEquipment } from "./interpret";
import type {
  AnsweredQuestion,
  ChatMessage,
  ChooseReason,
  ConversationState,
  EngineContext,
  EngineResult,
  FlowNode,
  FlowOption,
  Step,
  StepOption,
  StepView,
  UserInput,
} from "./types";
import { hasPhrase, isContradictory, normaliseReply, understand, type Understanding } from "./understand";

/**
 * Deterministic troubleshooting engine (prototype — not AI).
 *
 * Pure functions only: (state, input, context) → (new state, UI commands).
 * Nothing here talks to a network, an AI model or studio hardware.
 *
 * Safety properties (all covered by tests):
 * - Typed text can never reset a conversation; only the explicit "restart"
 *   option can, and the UI confirms that first.
 * - Requests for a person always go to the support step.
 * - Clear reports of on-air silence go straight to the urgent outcome;
 *   possible silence gets one short clarifying question.
 * - A typed reply is only mapped to an answer whose meaning agrees with
 *   what the user said. Contradictions and low confidence lead to a
 *   clarifying question, never a guess.
 * - Everything the user types is kept verbatim for the support summary.
 */

const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
const FALLBACK_ENTRY_NODE = "generic-symptom";
export const MAX_INPUT_LENGTH = 500;
const URGENT_NODE = "outcome-urgent";
const ON_AIR_CHECK_NODE = "hear-on-air";
const HEARING_NODE = "hear-where";
const HEARING_NODES = new Set(["hear-where", "hear-headphones", "hear-speakers", "hear-on-air", "hear-meters", "mic-headphones"]);

export const UNIVERSAL_OPTIONS: StepOption[] = [
  { id: "u-unsure", label: "I'm not sure", kind: "universal" },
  { id: "u-show", label: "Show me where", kind: "universal" },
  { id: "u-support", label: "I need technical support", kind: "universal" },
];

const RESTART_OPTION: StepOption = { id: "restart", label: "Start a new problem", kind: "restart" };
const SUPPORT_OPTION = UNIVERSAL_OPTIONS[2]!;
const SHOW_OPTION = UNIVERSAL_OPTIONS[1]!;

const SHOW_ME_PHRASES = ["show me", "show me where", "where is it", "where is that", "where is the"];
const RESTART_WORDS = ["start again", "start over", "restart", "reset", "new problem", "clear", "clear chat"];

export const GREETING =
  "Hello. Tell me what's wrong in your own words \u2014 for example \u201cthe green button isn't working\u201d \u2014 or choose a common problem below.";

export const SUPPORT_PROMPT =
  "Please contact the station's technical support. Their contact details have not been configured in Radio Technics yet \u2014 the station needs to provide them. You can read out or copy the summary below.";

const URGENT_SUPPORT_PREFIX = "This is urgent: silence on air has been reported. Tell technical support that first.";

const PROCEDURE_REPLY =
  "Radio Technics doesn't have any engineer-approved instructions for that yet, so please don't restart, unplug or reset equipment unless technical support tells you to. I've noted your question for them.";

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
        prompt: state.urgent ? `${URGENT_SUPPORT_PREFIX} ${SUPPORT_PROMPT}` : SUPPORT_PROMPT,
        urgent: state.urgent,
        options: [
          { id: "back", label: "Go back to my last question", kind: "back" },
          RESTART_OPTION,
        ],
        equipmentId: state.equipmentId,
      };
  }
}

function enterStep(state: ConversationState, step: Step): ConversationState {
  const node = step.kind === "node" ? nodesById.get(step.nodeId) : undefined;
  const next = { ...state, step, urgent: state.urgent || Boolean(node?.urgent) };
  const view = describeStep(next);
  return addMessage(next, { role: "assistant", text: view.prompt, help: view.help, urgent: view.urgent });
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
  const base: ConversationState = {
    step: { kind: "start" },
    equipmentId: null,
    messages: [],
    answers: [],
    observations: [],
    urgent: false,
    possibleSilence: false,
    seq: 0,
  };
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
    case "topic":
      return handleTopic(state, input.topicId);
  }
}

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

type AnswerMeta = Pick<AnsweredQuestion, "source" | "certainty" | "typedText">;
const BUTTON: AnswerMeta = { source: "button", certainty: "confirmed" };

function recordAnswer(state: ConversationState, answer: string, meta: AnswerMeta): ConversationState {
  const question = describeStep(state).prompt;
  return { ...state, answers: [...state.answers, { question, answer, ...meta }] };
}

function recordObservation(state: ConversationState, text: string, inReplyTo: string | null): ConversationState {
  return { ...state, observations: [...state.observations, { text, inReplyTo }] };
}

function say(state: ConversationState, text: string): ConversationState {
  return addMessage(state, { role: "assistant", text });
}

function reask(state: ConversationState, preface: string): EngineResult {
  return { state: enterStep(say(state, preface), state.step), commands: [] };
}

function goToNode(state: ConversationState, nodeId: string, commands: WorkspaceCommand[] = []): EngineResult {
  return { state: enterStep(state, { kind: "node", nodeId }), commands };
}

function goUrgent(state: ConversationState): EngineResult {
  return goToNode(state, URGENT_NODE);
}

function goSupport(state: ConversationState): EngineResult {
  if (state.step.kind === "support") {
    return { state: say(state, "Technical support contact details haven't been configured yet. When you reach them, read out or copy the summary below."), commands: [] };
  }
  return { state: enterStep(state, { kind: "support", returnTo: state.step }), commands: [] };
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function handleOption(state: ConversationState, optionId: string): EngineResult {
  const view = describeStep(state);
  const option = view.options.find((o) => o.id === optionId);
  if (!option) {
    return {
      state: addMessage(state, { role: "notice", text: "That option isn't available any more. Please choose one of the current options." }),
      commands: [],
    };
  }
  if (option.kind === "topic") return handleTopic(state, optionId.slice("topic:".length));
  // Only reachable from an explicit button; the UI asks for confirmation first.
  if (option.id === "restart") return { state: createConversation(), commands: [] };

  const s = addMessage(state, { role: "user", text: option.label });
  return applyChoice(s, option, BUTTON);
}

/**
 * Apply a chosen option. `state` already contains the user's message;
 * `state.step` is still the step the option belongs to.
 */
function applyChoice(state: ConversationState, option: StepOption, meta: AnswerMeta): EngineResult {
  const view = describeStep(state);
  const step = state.step;

  switch (option.id) {
    case "u-support":
      return goSupport(state);
    case "back":
      return { state: enterStep(state, step.kind === "support" ? step.returnTo : { kind: "start" }), commands: [] };
    case "u-show":
      return showMeWhere(state, view);
    case "u-unsure":
      return handleUnsure(recordAnswer(state, option.label, { ...meta, certainty: "uncertain" }), step);
  }

  let s = recordAnswer(state, option.label, meta);

  if (step.kind === "confirm") {
    if (option.id === "confirm:yes") return beginEquipmentFlow(s, step.equipmentId, []);
    return { state: enterStep(s, { kind: "choose", equipmentIds: allEquipmentIds(), reason: "other" }), commands: [] };
  }

  if (step.kind === "choose" && option.id.startsWith("equip:")) {
    return beginEquipmentFlow(s, option.id.slice("equip:".length), []);
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
      return goToNode(s, flowOption.next, commands);
    }
  }

  return { state: enterStep(s, step), commands: [] };
}

function showMeWhere(state: ConversationState, view: StepView): EngineResult {
  if (view.equipmentId) {
    const record = getEquipmentById(view.equipmentId);
    return {
      state: say(state, `I've highlighted the ${record?.shortName ?? "equipment"} in the Studio Explorer.`),
      commands: showEquipmentCommands(view.equipmentId),
    };
  }
  return {
    state: say(state, "I've opened the Studio Explorer. Select the item you mean, then choose \u201cUse in troubleshooter\u201d."),
    commands: [{ type: "open_studio_explorer" }],
  };
}

function handleUnsure(state: ConversationState, step: Step): EngineResult {
  switch (step.kind) {
    case "node": {
      const node = nodesById.get(step.nodeId);
      if (node?.unsureNext) return goToNode(say(state, "That's fine \u2014 let's try something else."), node.unsureNext);
      return goSupport(state);
    }
    case "confirm":
    case "start":
      return { state: enterStep(say(state, "No problem."), { kind: "choose", equipmentIds: allEquipmentIds(), reason: "other" }), commands: [] };
    case "choose":
      return { state: say(state, "That's okay. Choose \u201cShow me where\u201d to look around the studio, or ask for technical support."), commands: [] };
    case "support":
      return { state, commands: [] };
  }
}

function handleExplorerSelection(state: ConversationState, equipmentId: string): EngineResult {
  if (!isKnownEquipmentId(equipmentId)) {
    return {
      state: addMessage(state, { role: "notice", text: "That item isn't in the studio's equipment list, so I can't use it. Please choose another item." }),
      commands: [],
    };
  }
  const record = getEquipmentById(equipmentId)!;
  let s = addMessage(state, { role: "user", text: `I've selected the ${record.shortName} in the Studio Explorer.` });
  s = { ...s, answers: [...s.answers, { question: "Equipment selected in Studio Explorer", answer: record.name, ...BUTTON }] };
  return beginEquipmentFlow(s, equipmentId, []);
}

function handleTopic(state: ConversationState, topicId: string): EngineResult {
  const topic = troubleshootingTopics.find((t) => t.id === topicId);
  if (!topic) return { state: addMessage(state, { role: "notice", text: "That topic isn't available." }), commands: [] };
  let s = addMessage(state, { role: "user", text: topic.label });
  s = { ...s, answers: [...s.answers, { question: "Common problem chosen", answer: topic.label, ...BUTTON }] };
  return describeNewProblem(s, understand(topic.utterance), { selectedEquipmentId: null });
}

/* ------------------------------------------------------------------ */
/* Typed text                                                          */
/* ------------------------------------------------------------------ */

function handleText(state: ConversationState, rawText: string, context: EngineContext): EngineResult {
  const text = rawText.trim().slice(0, MAX_INPUT_LENGTH);
  if (!text) {
    return { state: addMessage(state, { role: "notice", text: "Please type a description, or choose one of the options." }), commands: [] };
  }

  const view = describeStep(state);
  const u = understand(text);

  // The user's words are always kept, verbatim, before anything else happens.
  let s = addMessage(state, { role: "user", text });
  s = recordObservation(s, text, view.kind === "question" ? view.prompt : null);

  // 1. Safety first: classify urgency and attach it to the session BEFORE any
  //    routing, so it survives whatever else the message asks for.
  if (u.clearAirSilence) s = { ...s, urgent: true };
  else if (u.signals.includes("silence") || u.signals.includes("on-air-unknown")) s = { ...s, possibleSilence: true };

  // 2. Confirmed off-air silence goes to the urgent state, even when the message
  //    also asks for a person or about a procedure (both are answered there).
  if (u.clearAirSilence) {
    const preface = [
      u.procedureQuestion ? PROCEDURE_REPLY : null,
      u.helpRequest ? "I've marked this as urgent for technical support." : null,
    ].filter(Boolean).join(" ");
    return goUrgent(preface ? say(s, preface) : s);
  }

  // 3. A request for a person wins over continuing the diagnosis.
  if (u.helpRequest) return goSupport(s);

  // 4. Questions such as "Should I restart the computer?" get a safe answer; nothing
  //    is reset. If the message also suggests silence, check the broadcast next.
  if (u.procedureQuestion) {
    const node = state.step.kind === "node" ? nodesById.get(state.step.nodeId) : undefined;
    if (s.possibleSilence && !node?.broadcastCheck && (u.signals.includes("silence") || u.signals.includes("on-air-unknown"))) {
      return goToNode(say(s, PROCEDURE_REPLY), ON_AIR_CHECK_NODE);
    }
    return reask(s, PROCEDURE_REPLY);
  }

  // 4. Typed "start again" never clears the conversation by itself.
  if (RESTART_WORDS.includes(u.normalised.replace(/[.!?]+$/, ""))) {
    return {
      state: say(s, "To start afresh, use the \u201cEnd session\u201d button at the top of the conversation. Your answers so far are still here."),
      commands: [],
    };
  }

  // 5. The user typed an option's label exactly.
  const lower = text.toLowerCase().replace(/[.!?]+$/, "");
  const byLabel = view.options.find((o) => o.kind !== "topic" && o.kind !== "restart" && o.label.toLowerCase() === lower);
  if (byLabel) return applyChoice(s, byLabel, { source: "typed", certainty: "confirmed", typedText: text });

  if (view.kind === "question" && SHOW_ME_PHRASES.some((p) => hasPhrase(u.normalised, p))) return showMeWhere(s, view);

  // 6. Interpret as a reply to the current question.
  const step = state.step;
  if (step.kind === "node" && view.kind === "question") {
    const node = nodesById.get(step.nodeId);
    if (node) return replyToNode(s, node, u);
  }
  if (step.kind === "confirm") return replyToConfirm(s, step.equipmentId, u);
  if (step.kind === "choose") {
    if (u.stance === "uncertain") return applyChoice(s, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));
    const candidates = getAllEquipment().filter((record) => step.equipmentIds.includes(record.id));
    const match = matchEquipment(text, candidates);
    const [only] = match.equipmentIds;
    if (match.equipmentIds.length === 1 && only) {
      s = recordAnswer(s, getEquipmentById(only)!.name, typedMeta(u));
      return beginEquipmentFlow(s, only, []);
    }
  }

  // 7. Otherwise this is a (new) description of a problem.
  return describeNewProblem(s, u, context);
}

function typedMeta(u: Understanding, certainty?: AnsweredQuestion["certainty"]): AnswerMeta {
  return { source: "typed", certainty: certainty ?? (u.hedged ? "uncertain" : "confirmed"), typedText: u.text };
}

/**
 * How an option relates to the reply. An option is only usable when it is
 * consistent with BOTH the user's yes/no stance and their observations.
 */
interface OptionFit {
  option: FlowOption;
  score: number;
  /** The stance agrees with this option's meaning of "yes"/"no". */
  stanceMatch: boolean;
  /** The user said something this option contradicts. */
  contradicted: boolean;
}

function fitOption(option: FlowOption, u: Understanding): OptionFit {
  let score = 0;
  let contradicted = false;
  let stanceMatch = false;
  if (option.answer && (u.stance === "affirm" || u.stance === "negate")) {
    stanceMatch = (u.stance === "affirm") === (option.answer === "yes");
    if (stanceMatch) score += 2;
    else contradicted = true;
  }
  if (option.audio && u.audio) {
    if (option.audio === u.audio) score += 3;
    else contradicted = true;
  }
  if (option.match?.some((phrase) => hasPhrase(u.normalised, normaliseReply(phrase), true))) score += 2;
  return { option, score, stanceMatch, contradicted };
}

function replyToNode(state: ConversationState, node: FlowNode, u: Understanding): EngineResult {
  // Not knowing whether the station is on air is itself a reason to check for silence.
  if (u.signals.includes("on-air-unknown") && !node.broadcastCheck) {
    const s = recordAnswer(state, "Unsure whether the station is on air", typedMeta(u, "uncertain"));
    return goToNode(say(s, "Let's check that first."), ON_AIR_CHECK_NODE);
  }
  if (u.stance === "uncertain" && !u.audio) return applyChoice(state, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));

  const fits = node.options.map((option) => fitOption(option, u));
  const usable = fits.filter((f) => !f.contradicted && f.score >= 2).sort((a, b) => b.score - a.score);
  const [best, second] = usable;

  if (best && (!second || second.score < best.score) && u.stance !== "conflict" && !u.audioConflict) {
    const option = describeStep(state).options.find((o) => o.id === `opt:${best.option.id}`)!;
    return applyChoice(state, option, typedMeta(u));
  }

  // The yes/no and the observation point different ways — never record either.
  const stanceVsObservation = fits.some((f) => f.stanceMatch && f.contradicted);
  if (stanceVsObservation || u.stance === "conflict" || u.audioConflict) {
    const said = u.stance === "affirm" ? "yes" : u.stance === "negate" ? "no" : "both yes and no";
    const observed = u.audio === "absent" ? "that there's no sound" : u.audio === "present" ? "that there is sound" : "something different";
    const preface =
      u.stance === "conflict" || u.audioConflict
        ? "I'm not sure which you meant, so I won't record an answer yet."
        : `You said ${said}, but also ${observed}, so I won't record an answer yet.`;
    if (u.audio === "absent" && !node.broadcastCheck) return goToNode(say(state, `${preface} Let me check something first.`), ON_AIR_CHECK_NODE);
    return reask(state, preface);
  }

  if (best && second) return reask(state, "Sorry, I couldn't tell which answer you meant.");

  // No answer fits. Possible silence still gets priority.
  if (u.signals.includes("silence") && !node.broadcastCheck) {
    return goToNode(say(state, "That sounds like there may be silence. Let me check that first."), ON_AIR_CHECK_NODE);
  }
  if (u.signals.includes("no-sound") && !HEARING_NODES.has(node.id)) {
    return goToNode(say(state, "Let's find out where the sound is missing."), HEARING_NODE);
  }
  // Keep the user's place; their words are already saved for technical support.
  return reask(state, "Thanks \u2014 I've noted that for technical support. To carry on, please choose one of the answers below.");
}

function replyToConfirm(state: ConversationState, equipmentId: string, u: Understanding): EngineResult {
  if (u.stance === "uncertain") return applyChoice(state, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));
  if (u.stance === "conflict") return reask(state, "I'm not sure whether you meant yes or no.");
  const options = describeStep(state).options;
  const other = interpret(u.text);
  if (u.stance !== "affirm" && other.kind === "equipment" && other.equipmentId !== equipmentId) {
    // "No, it's the guest mic" — check the newly named item instead.
    const s = recordAnswer(state, "No, something else", typedMeta(u));
    return { state: enterStep(s, { kind: "confirm", equipmentId: other.equipmentId }), commands: [] };
  }
  if (u.stance === "negate") return applyChoice(state, options.find((o) => o.id === "confirm:no")!, typedMeta(u));
  if (u.stance === "affirm") return applyChoice(state, options.find((o) => o.id === "confirm:yes")!, typedMeta(u));
  if (u.signals.includes("silence")) return goToNode(say(state, "Let me check something first."), ON_AIR_CHECK_NODE);
  return reask(state, "Thanks, I've noted that. Just to check which equipment you mean:");
}

function describeNewProblem(state: ConversationState, u: Understanding, context: EngineContext): EngineResult {
  const choose = (equipmentIds: string[], reason: ChooseReason): EngineResult => ({
    state: enterStep(state, { kind: "choose", equipmentIds, reason }),
    commands: [],
  });

  // Possible silence is checked before anything else.
  if (u.signals.includes("silence") || u.signals.includes("on-air-unknown")) {
    return goToNode({ ...state, equipmentId: state.equipmentId }, ON_AIR_CHECK_NODE);
  }

  const interpretation = interpret(u.text);
  switch (interpretation.kind) {
    case "cable":
      return goToNode({ ...state, equipmentId: null }, "cable-where");
    case "hearing":
      return goToNode({ ...state, equipmentId: null }, HEARING_NODE);
    case "equipment":
      return { state: enterStep(state, { kind: "confirm", equipmentId: interpretation.equipmentId }), commands: [] };
    case "ambiguous":
      return choose(interpretation.equipmentIds, "ambiguous");
    case "vague":
      if (context.selectedEquipmentId && isKnownEquipmentId(context.selectedEquipmentId)) {
        return { state: enterStep(state, { kind: "confirm", equipmentId: context.selectedEquipmentId }), commands: [] };
      }
      return choose(allEquipmentIds(), "vague");
    case "unknown":
      if (u.signals.includes("no-sound")) return goToNode(state, HEARING_NODE);
      return choose(allEquipmentIds(), "unknown");
  }
}

/* ------------------------------------------------------------------ */
/* Support summary                                                     */
/* ------------------------------------------------------------------ */

/** Plain-text summary a presenter can read out or copy to technical support. */
export function buildSupportSummary(state: ConversationState): string {
  const record = getEquipmentById(state.equipmentId);
  const lines = ["Radio Technics \u2014 problem summary (prototype, scripted)"];
  if (state.urgent) lines.push("URGENT: silence on air reported");
  else if (state.possibleSilence) lines.push("Possible silence reported (not confirmed) \u2014 check whether the station is on air");
  lines.push(`Equipment: ${record ? record.name : "not identified yet"}`);

  if (state.observations.length > 0) {
    lines.push("", "In the presenter's own words:");
    for (const { text } of state.observations) lines.push(`- \u201c${text}\u201d`);
  }

  if (state.answers.length > 0) {
    lines.push("", "Answers to questions:");
    for (const a of state.answers) {
      const notes = [a.source === "typed" ? "typed reply" : null, a.certainty === "uncertain" ? "not certain" : null].filter(Boolean);
      lines.push(`- ${a.question} \u2192 ${a.answer}${notes.length ? ` (${notes.join(", ")})` : ""}`);
    }
  }

  if (state.observations.length === 0 && state.answers.length === 0) lines.push("", "No details recorded yet.");
  return lines.join("\n");
}
