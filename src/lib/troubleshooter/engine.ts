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
  IncidentEntry,
  IncidentStatus,
  Step,
  StepOption,
  StepView,
  UserInput,
} from "./types";
import { claimValue, extractClaims, type ClaimSubject } from "./claims";
import { isCurrentConcern, type BroadcastAssessment } from "./safety";
import { hasPhrase, normaliseReply, understand, type Understanding } from "./understand";

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
const POSSIBLE_URGENT_SUPPORT_PREFIX =
  "This is being treated as urgent: the station may be silent on air (not confirmed). Tell technical support that first.";

/** RT-QA-002B: an uncertain or asked-about off-air report is escalated, but recorded as unconfirmed. */
const POSSIBLE_OFF_AIR_NOTE =
  "You're not certain, so I've recorded this as possible silence on air, not confirmed. To be safe, it's being treated as urgent.";
const HYPOTHETICAL_OFF_AIR_REPLY =
  "If the station ever goes silent on air, treat it as urgent and contact technical support straight away. I haven't recorded that anything is wrong now.";
const HISTORICAL_OFF_AIR_NOTE =
  "Thanks \u2014 I've noted that the station was off air earlier and that you say it's back now. I haven't recorded it as a current problem. If it happens again, say so straight away.";
const DENIED_OFF_AIR_NOTE = "Thanks \u2014 I've noted that the station is not off air.";
const POSSIBLE_SILENCE_PENDING_NOTE =
  "If there's silence, that needs attention straight away \u2014 I'm treating it as possible silence on air (not confirmed) while we check.";
const STALE_OPTION = "That question has moved on, so that button no longer applies. Please choose from the current options.";
const TOO_LONG = `That message is longer than ${500} characters, so I haven't used any of it. Please shorten it \u2014 if the station is off air, use the \u201cWe're off air\u201d button.`;
const CHOOSE_FROM_BUTTONS = "Please press the answer below that matches \u2014 I only record answers you choose, so you can see exactly what you're agreeing to.";
export const OFF_AIR_BUTTON_LABEL = "We're off air / urgent broadcast problem";
export const RESUMED_BUTTON_LABEL = "Broadcasting has resumed";
const RESUMED_NOTE =
  "Thanks \u2014 I've noted that you report broadcasting has resumed. Radio Technics can't check that, so please still tell technical support what happened.";
const HANDOFF_NOTE =
  "Your Knowledge Centre search suggested a possible broadcast problem, so I've carried it over as possible (not confirmed) and I'm treating it as urgent.";
const INCIDENT_RESUMED_SUPPORT_PREFIX =
  "A broadcast interruption was reported earlier; you've since reported that broadcasting has resumed (not independently verified). Tell technical support both.";
const NOTED_REPLY = "Thanks \u2014 I've noted that for technical support. To carry on, please choose one of the answers below.";
const QUESTION_ONLY_REPLY =
  "I can't check the studio myself, so I can't answer that for you. Please tell me what you can see or hear, or choose an answer below.";

export const PROCEDURE_REPLY =
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

/** Answers the presenter may correct: answers to question nodes that haven't already been replaced. */
export function correctableAnswers(state: ConversationState): number[] {
  return state.answers.flatMap((a, i) => (a.supersededBy === undefined && nodesById.get(a.questionId)?.kind === "question" ? [i] : []));
}

const CORRECT_OPTION: StepOption = { id: "correct", label: "Change an earlier answer", kind: "correct" };

export function describeStep(state: ConversationState): StepView {
  return { ...describeStepContent(state), instanceId: state.instance };
}

function describeStepContent(state: ConversationState): Omit<StepView, "instanceId"> {
  const { step } = state;
  // Offered wherever a diagnostic question is on screen and there is something to correct.
  const correct = correctableAnswers(state).length > 0 ? [CORRECT_OPTION] : [];
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
          options: [...(equipmentId ? [SHOW_OPTION] : []), ...correct, RESTART_OPTION],
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
          ...correct,
        ],
        equipmentId,
      };
    }
    case "check": {
      // A SUGGESTION from the presenter's words. Nothing is recorded until they
      // press one of these answer buttons.
      const node = nodesById.get(step.nodeId);
      const candidate = node?.options.find((o) => o.id === step.optionId);
      if (!node || !candidate) {
        return { kind: "outcome", prompt: "Something went wrong with this conversation.", options: [SUPPORT_OPTION, RESTART_OPTION], equipmentId: null };
      }
      const restated = candidate.restate ? fillTemplate(candidate.restate, state.equipmentId) : `“${candidate.label}”`;
      return {
        kind: "question",
        prompt: `It sounds like ${restated}. Is that correct? Choose the answer that matches.`,
        help: `I haven't recorded anything yet. The question was: “${fillTemplate(node.prompt, state.equipmentId)}”`,
        options: [
          { id: `opt:${candidate.id}`, label: candidate.label, kind: "answer" as const },
          ...node.options.filter((o) => o.id !== candidate.id).map((o) => ({ id: `opt:${o.id}`, label: o.label, kind: "answer" as const })),
          ...UNIVERSAL_OPTIONS,
          ...correct,
        ],
        equipmentId: node.showEquipmentId ?? state.equipmentId,
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
          ...correct,
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
        prompt: state.urgent ? `${incidentSupportPrefix(state)} ${SUPPORT_PROMPT}` : SUPPORT_PROMPT,
        urgent: state.urgent,
        options: [{ id: "back", label: "Go back to my last question", kind: "back" }, ...correct, RESTART_OPTION],
        equipmentId: state.equipmentId,
      };
    case "correct-select":
      return {
        kind: "question",
        prompt: "Which answer do you want to change?",
        help: "Your original answer stays in the record, marked as corrected, so technical support can see what changed.",
        options: [
          ...correctableAnswers(state).map((i) => {
            const a = state.answers[i]!;
            return { id: `fix:${i}`, label: `“${a.question}” — you answered “${a.answer}”`, kind: "answer" as const };
          }),
          { id: "back", label: "Don't change anything", kind: "back" },
          SUPPORT_OPTION,
        ],
        equipmentId: state.equipmentId,
      };
    case "correct": {
      const original = state.answers[step.answerIndex];
      const node = original ? nodesById.get(original.questionId) : undefined;
      if (!original || !node) {
        return { kind: "question", prompt: "That answer can't be changed.", options: [{ id: "back", label: "Go back", kind: "back" }], equipmentId: state.equipmentId };
      }
      return {
        kind: "question",
        prompt: `You answered “${original.answer}” to “${original.question}”. What is the right answer?`,
        options: [
          ...node.options.filter((o) => `opt:${o.id}` !== original.optionId).map((o) => ({ id: `opt:${o.id}`, label: o.label, kind: "answer" as const })),
          ...(original.optionId !== "u-unsure" ? [UNIVERSAL_OPTIONS[0]!] : []),
          { id: "back", label: "Keep my original answer", kind: "back" },
          SUPPORT_OPTION,
        ],
        equipmentId: node.showEquipmentId ?? state.equipmentId,
      };
    }
  }
}

/** Every new step on screen is a new question instance; old buttons stop working. */
function enterStep(state: ConversationState, step: Step): ConversationState {
  const node = step.kind === "node" ? nodesById.get(step.nodeId) : undefined;
  let next: ConversationState = { ...state, step, instance: state.instance + 1 };
  // MOVING INTO the urgent outcome through answers is a possible broadcast incident
  // (re-showing it, e.g. after "broadcasting has resumed", is not a new report).
  const alreadyThere = state.step.kind === "node" && step.kind === "node" && state.step.nodeId === step.nodeId;
  if (node?.urgent && !alreadyThere && !isActiveIncident(next.incident.status)) {
    next = addIncident(next, { kind: "current", certainty: "possible", scope: "listeners", source: "answer", evidence: "Reached the urgent outcome from the answers given" });
  }
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
/* Broadcast incidents (RT-002D-R1)                                    */
/* ------------------------------------------------------------------ */

function isActiveIncident(status: IncidentStatus): boolean {
  return status === "possible" || status === "confirmed";
}

/**
 * Record an incident entry. Entries are never removed. Status only moves:
 * none/resumed → possible → confirmed; an active incident → reported-resumed
 * only on an explicit report that broadcasting has resumed. `urgent` and
 * `confirmedOffAir` never go back to false.
 */
function addIncident(state: ConversationState, entry: IncidentEntry): ConversationState {
  let status = state.incident.status;
  if (entry.kind === "current") {
    if (entry.certainty === "confirmed") status = "confirmed";
    else if (status !== "confirmed") status = "possible";
  } else if (entry.kind === "resumed" && isActiveIncident(status)) {
    status = "reported-resumed";
  }
  const current = entry.kind === "current";
  return {
    ...state,
    incident: { status, entries: [...state.incident.entries, entry] },
    urgent: state.urgent || current,
    confirmedOffAir: state.confirmedOffAir || (current && entry.certainty === "confirmed"),
    possibleSilence: state.possibleSilence || (current && entry.certainty === "possible"),
  };
}

function incidentSupportPrefix(state: ConversationState): string {
  if (state.incident.status === "reported-resumed") return INCIDENT_RESUMED_SUPPORT_PREFIX;
  return state.confirmedOffAir && state.incident.status === "confirmed" ? URGENT_SUPPORT_PREFIX : POSSIBLE_URGENT_SUPPORT_PREFIX;
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
    confirmedOffAir: false,
    incident: { status: "none", entries: [] },
    instance: 0,
    seq: 0,
  };
  return addMessage(base, { role: "assistant", text: GREETING });
}

/** Refuse an input: nothing changes and the input must not be saved. */
function reject(state: ConversationState, reason: string): EngineResult {
  return { state, commands: [], rejected: reason };
}

export function respond(state: ConversationState, input: UserInput, context: EngineContext): EngineResult {
  switch (input.type) {
    case "option":
      // RT-002D-R1: a button only counts for the question instance it was shown for.
      if (input.instanceId !== state.instance) return reject(state, STALE_OPTION);
      return handleOption(state, input.optionId);
    case "text":
      return handleText(state, input.text, context);
    case "equipment":
      return handleExplorerSelection(state, input.equipmentId);
    case "topic":
      return handleTopic(state, input.topicId);
    case "broadcast":
      return handleBroadcastControl(state, input.report);
    case "handoff":
      return handleHandoff(state, input.text);
  }
}

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

type AnswerMeta = Pick<AnsweredQuestion, "source" | "certainty" | "typedText">;
const BUTTON: AnswerMeta = { source: "button", certainty: "confirmed" };

/** The question a step asks, for answer provenance. A check step asks its node's question. */
function questionIdOf(step: Step): string {
  switch (step.kind) {
    case "node":
    case "check":
      return step.nodeId;
    case "confirm":
      return `confirm:${step.equipmentId}`;
    case "choose":
      return "choose";
    case "start":
      return "start";
    case "support":
      return "support";
    case "correct-select":
      return "correct-select";
    case "correct":
      return "correct";
  }
}

/** The underlying question's prompt (a check step quotes its node's question). */
function questionPrompt(state: ConversationState): string {
  if (state.step.kind === "check") {
    const node = nodesById.get(state.step.nodeId);
    return node ? fillTemplate(node.prompt, state.equipmentId) : describeStep(state).prompt;
  }
  return describeStep(state).prompt;
}

/**
 * The ONLY way an answer is created: from a displayed option of the current
 * question instance (reached only through `handleOption`).
 */
function recordAnswer(state: ConversationState, option: StepOption, meta: AnswerMeta, override?: Partial<AnsweredQuestion>): ConversationState {
  const entry: AnsweredQuestion = {
    questionId: questionIdOf(state.step),
    optionId: option.id,
    instanceId: state.instance,
    question: questionPrompt(state),
    answer: option.label,
    ...meta,
    ...override,
  };
  return { ...state, answers: [...state.answers, entry] };
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
  return { state: enterStep(state, { kind: "support", returnTo: underlyingStep(state.step) }), commands: [] };
}

/** The question a support or correction step was opened from, so those steps never nest inside each other. */
function underlyingStep(step: Step): Step {
  return step.kind === "support" || step.kind === "correct-select" || step.kind === "correct" ? underlyingStep(step.returnTo) : step;
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function handleOption(state: ConversationState, optionId: string): EngineResult {
  const view = describeStep(state);
  const option = view.options.find((o) => o.id === optionId);
  if (!option) return reject(state, STALE_OPTION);
  if (option.kind === "topic") return handleTopic(state, optionId.slice("topic:".length));
  // Only reachable from an explicit button; the UI asks for confirmation first.
  if (option.id === "restart") return { state: createConversation(), commands: [] };

  const s = addMessage(state, { role: "user", text: option.label });
  // Pressing the answer the system suggested from the presenter's words.
  if (state.step.kind === "check" && option.id === `opt:${state.step.optionId}`) {
    const basedOn = state.step.basedOn;
    return applyChoice(s, option, { source: "confirmed-interpretation", certainty: understand(basedOn).hedged ? "uncertain" : "confirmed", typedText: basedOn });
  }
  return applyChoice(s, option, BUTTON);
}

/**
 * Apply a pressed option. `state` already contains the presenter's message;
 * `state.step` is still the step the option was displayed on.
 */
function applyChoice(state: ConversationState, option: StepOption, meta: AnswerMeta): EngineResult {
  const view = describeStep(state);
  const step = state.step;

  if (option.id === "u-support") return goSupport(state);
  if (option.id === "correct") {
    return { state: enterStep(state, { kind: "correct-select", returnTo: underlyingStep(step) }), commands: [] };
  }
  if (step.kind === "correct-select") {
    if (option.id === "back") return { state: enterStep(say(state, "Okay, nothing has been changed."), step.returnTo), commands: [] };
    const index = Number(option.id.slice("fix:".length));
    return { state: enterStep(state, { kind: "correct", answerIndex: index, returnTo: step.returnTo }), commands: [] };
  }
  if (step.kind === "correct") return applyCorrection(state, step, option, meta);

  switch (option.id) {
    case "u-support":
      return goSupport(state);
    case "back":
      return { state: enterStep(state, step.kind === "support" ? step.returnTo : { kind: "start" }), commands: [] };
    case "u-show":
      return showMeWhere(state, view);
    case "u-unsure":
      return handleUnsure(recordAnswer(state, option, { ...meta, certainty: "uncertain" }), step);
  }

  let s = recordAnswer(state, option, meta);

  if (step.kind === "confirm") {
    if (option.id === "confirm:yes") return beginEquipmentFlow(s, step.equipmentId, []);
    return { state: enterStep(s, { kind: "choose", equipmentIds: allEquipmentIds(), reason: "other" }), commands: [] };
  }

  if (step.kind === "choose" && option.id.startsWith("equip:")) {
    return beginEquipmentFlow(s, option.id.slice("equip:".length), []);
  }

  if ((step.kind === "node" || step.kind === "check") && option.id.startsWith("opt:")) {
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

/**
 * RT-002D-R1 correction: the new answer is recorded with `corrects`, the
 * original is kept and marked `supersededBy`, and the flow continues from the
 * corrected answer (so its consequences, such as urgency, apply).
 */
function applyCorrection(state: ConversationState, step: Extract<Step, { kind: "correct" }>, option: StepOption, meta: AnswerMeta): EngineResult {
  if (option.id === "back") return { state: enterStep(say(state, "Okay, your original answer stays."), step.returnTo), commands: [] };
  const original = state.answers[step.answerIndex];
  const node = original ? nodesById.get(original.questionId) : undefined;
  if (!original || !node) return { state: enterStep(state, step.returnTo), commands: [] };
  const newIndex = state.answers.length;
  let s = recordAnswer(state, option, option.id === "u-unsure" ? { ...meta, certainty: "uncertain" } : meta, {
    questionId: original.questionId,
    question: original.question,
    corrects: step.answerIndex,
  });
  s = { ...s, answers: s.answers.map((a, i) => (i === step.answerIndex ? { ...a, supersededBy: newIndex } : a)) };
  s = say(s, `Thanks — I've changed that answer to “${option.label}”. Your original answer is kept in the record, marked as corrected.`);
  if (option.id === "u-unsure") return node.unsureNext ? goToNode(s, node.unsureNext) : goSupport(s);
  const flowOption = node.options.find((o) => `opt:${o.id}` === option.id);
  if (!flowOption) return { state: enterStep(s, step.returnTo), commands: [] };
  const commands: WorkspaceCommand[] = [];
  if (flowOption.setEquipmentId) {
    s = { ...s, equipmentId: flowOption.setEquipmentId };
    commands.push({ type: "select_equipment", equipmentId: flowOption.setEquipmentId });
  }
  return goToNode(s, flowOption.next, commands);
}

function showMeWhere(state: ConversationState, view: Omit<StepView, "instanceId">): EngineResult {
  if (view.equipmentId) {
    const record = getEquipmentById(view.equipmentId);
    return {
      state: say(state, `I've highlighted the ${record?.shortName ?? "equipment"} in the Studio Explorer.`),
      commands: showEquipmentCommands(view.equipmentId),
    };
  }
  return {
    state: say(state, "I've opened the Studio Explorer. Select the item you mean, then choose “Use in troubleshooter”."),
    commands: [{ type: "open_studio_explorer" }],
  };
}

function handleUnsure(state: ConversationState, step: Step): EngineResult {
  switch (step.kind) {
    case "node":
    case "check": {
      const node = nodesById.get(step.nodeId);
      if (node?.unsureNext) return goToNode(say(state, "That's fine — let's try something else."), node.unsureNext);
      return goSupport(state);
    }
    case "confirm":
    case "start":
      return { state: enterStep(say(state, "No problem."), { kind: "choose", equipmentIds: allEquipmentIds(), reason: "other" }), commands: [] };
    case "choose":
      return { state: say(state, "That's okay. Choose “Show me where” to look around the studio, or ask for technical support."), commands: [] };
    case "support":
    case "correct-select":
    case "correct":
      return { state, commands: [] };
  }
}

function handleExplorerSelection(state: ConversationState, equipmentId: string): EngineResult {
  if (!isKnownEquipmentId(equipmentId)) return reject(state, "That item isn't in the studio's equipment list, so I can't use it. Please choose another item.");
  const record = getEquipmentById(equipmentId)!;
  let s = addMessage(state, { role: "user", text: `I've selected the ${record.shortName} in the Studio Explorer.` });
  s = {
    ...s,
    answers: [
      ...s.answers,
      { questionId: "studio-explorer", optionId: `equip:${equipmentId}`, instanceId: state.instance, question: "Equipment selected in Studio Explorer", answer: record.name, ...BUTTON },
    ],
  };
  // Switching equipment starts a new question instance, so any pending suggestion is obsolete.
  return beginEquipmentFlow(s, equipmentId, []);
}

function handleTopic(state: ConversationState, topicId: string): EngineResult {
  const topic = troubleshootingTopics.find((t) => t.id === topicId);
  if (!topic) return reject(state, "That topic isn't available.");
  let s = addMessage(state, { role: "user", text: topic.label });
  s = {
    ...s,
    answers: [...s.answers, { questionId: "topic", optionId: `topic:${topic.id}`, instanceId: state.instance, question: "Common problem chosen", answer: topic.label, ...BUTTON }],
  };
  return describeNewProblem(s, understand(topic.utterance), { selectedEquipmentId: null });
}

/* ------------------------------------------------------------------ */
/* Always-available broadcast controls and Knowledge Centre hand-off   */
/* ------------------------------------------------------------------ */

/**
 * RT-002D-R1: explicit controls that work whatever the language classifier
 * makes of the presenter's words.
 */
function handleBroadcastControl(state: ConversationState, report: "off-air" | "resumed"): EngineResult {
  if (report === "off-air") {
    let s = addMessage(state, { role: "user", text: OFF_AIR_BUTTON_LABEL });
    s = addIncident(s, { kind: "current", certainty: "confirmed", scope: "listeners", source: "button", evidence: OFF_AIR_BUTTON_LABEL });
    return goUrgent(s);
  }
  if (!isActiveIncident(state.incident.status)) return reject(state, "No broadcast problem is open in this conversation.");
  let s = addMessage(state, { role: "user", text: RESUMED_BUTTON_LABEL });
  s = addIncident(s, { kind: "resumed", certainty: "confirmed", scope: "listeners", source: "button", evidence: RESUMED_BUTTON_LABEL });
  return reask(s, RESUMED_NOTE);
}

/**
 * RT-002D-R1: carries the safety content of a Knowledge Centre search into the
 * troubleshooter. The whole query is re-classified here (nothing the page says
 * is trusted), it is never turned into an answer, and a search is never a
 * confirmed report: at most a POSSIBLE incident.
 */
function handleHandoff(state: ConversationState, rawText: string): EngineResult {
  const text = rawText.trim();
  if (!text || rawText.length > MAX_INPUT_LENGTH) return reject(state, TOO_LONG);
  const u = understand(text);
  const concern = isCurrentConcern(u.broadcast.status);
  const silence = u.signals.includes("silence") && !concern;
  if (!concern && !silence) return reject(state, "Nothing in that search needs passing to the troubleshooter.");
  let s = addMessage(state, { role: "user", text: `From my Knowledge Centre search: “${text}”` });
  s = recordObservation(s, text, "Knowledge Centre search");
  if (concern) {
    s = addIncident(s, { kind: "current", certainty: "possible", scope: "listeners", source: "knowledge-handoff", evidence: text });
    return goUrgent(say(s, HANDOFF_NOTE));
  }
  s = { ...s, possibleSilence: true };
  return goToNode(say(s, "Your search mentioned silence. Let's check whether the station is affected."), ON_AIR_CHECK_NODE);
}

/* ------------------------------------------------------------------ */
/* Safety (independent of routing)                                     */
/* ------------------------------------------------------------------ */

/**
 * Attach the broadcast-safety reading of this message before any routing.
 * It never looks at the question or answer options.
 */
function applySafety(state: ConversationState, text: string, broadcast: BroadcastAssessment, u: Understanding): ConversationState {
  let s = state;
  const entry = (kind: IncidentEntry["kind"], certainty: IncidentEntry["certainty"]): IncidentEntry => ({ kind, certainty, scope: "listeners", source: "text", evidence: text });
  switch (broadcast.status) {
    case "current-confirmed":
      s = addIncident(s, entry("current", "confirmed"));
      break;
    case "current-possible":
      s = addIncident(s, entry("current", "possible"));
      break;
    case "historical":
    case "hypothetical":
    case "denied":
      s = addIncident(s, entry(broadcast.status, "possible"));
      break;
    case "resumed":
      // The presenter's report, never an independent check.
      s = addIncident(s, entry("resumed", "possible"));
      break;
    case "none":
      break;
  }
  // Silence described without the broadcast ("nothing is playing") is possible silence, not an incident.
  if (u.signals.includes("silence") && broadcast.status === "none") s = { ...s, possibleSilence: true };
  if (u.signals.includes("on-air-unknown")) s = { ...s, possibleSilence: true };
  return s;
}

/* ------------------------------------------------------------------ */
/* Typed text — never records an answer (RT-002D-R1)                   */
/* ------------------------------------------------------------------ */

const ANSWER_CORRECTION = [
  "answer was wrong",
  "answer is wrong",
  "wrong answer",
  "change my answer",
  "change an answer",
  "change that answer",
  "correct my answer",
  "my first answer",
  "my last answer",
  "my previous answer",
  "my earlier answer",
  "i answered wrong",
  "i pressed the wrong",
  "i chose the wrong",
  "i clicked the wrong",
  "undo that answer",
];

function handleText(state: ConversationState, rawText: string, context: EngineContext): EngineResult {
  // The whole input is classified, never a truncated part: too long is refused, not cut.
  if (rawText.length > MAX_INPUT_LENGTH) return reject(state, TOO_LONG);
  const text = rawText.trim();
  if (!text) return reject(state, "Please type a description, or choose one of the options.");

  const view = describeStep(state);
  const u = understand(text);
  const broadcast = u.broadcast;

  // 1. The presenter's words are kept verbatim, before anything else happens.
  let s = addMessage(state, { role: "user", text });
  s = recordObservation(s, text, view.kind === "question" ? view.prompt : null);

  // 2. Safety, attached BEFORE any routing.
  s = applySafety(s, text, broadcast, u);

  // 3. A current concern goes to the urgent state; a request for a person or a
  //    procedure question in the same message is answered there.
  if (isCurrentConcern(broadcast.status)) {
    const preface = [
      broadcast.status === "current-possible" ? POSSIBLE_OFF_AIR_NOTE : null,
      u.procedureQuestion ? PROCEDURE_REPLY : null,
      u.helpRequest ? "I've marked this as urgent for technical support." : null,
    ].filter(Boolean).join(" ");
    return goUrgent(preface ? say(s, preface) : s);
  }

  // 4. A request for a person wins over continuing the diagnosis.
  if (u.helpRequest) return goSupport(s);

  // 5. "Should I restart the computer?" gets the safe answer; nothing is reset.
  if (u.procedureQuestion) {
    const node = state.step.kind === "node" ? nodesById.get(state.step.nodeId) : undefined;
    if (s.possibleSilence && !node?.broadcastCheck && (u.signals.includes("silence") || u.signals.includes("on-air-unknown"))) {
      return goToNode(say(s, PROCEDURE_REPLY), ON_AIR_CHECK_NODE);
    }
    return reask(s, PROCEDURE_REPLY);
  }

  // 6. Past, hypothetical, denied and resumed reports are noted, never current.
  if (broadcast.status === "hypothetical" && !u.assertive) return reask(s, HYPOTHETICAL_OFF_AIR_REPLY);
  if (broadcast.status === "historical") s = say(s, HISTORICAL_OFF_AIR_NOTE);
  if (broadcast.status === "denied") s = say(s, DENIED_OFF_AIR_NOTE);
  if (broadcast.status === "resumed") s = say(s, isActiveIncident(state.incident.status) ? RESUMED_NOTE : HISTORICAL_OFF_AIR_NOTE);

  // 7. "My first answer was wrong" opens the explicit correction workflow.
  if (ANSWER_CORRECTION.some((p) => hasPhrase(u.normalised, p))) {
    if (correctableAnswers(s).length === 0) return reask(s, "There aren't any answers to change yet.");
    return { state: enterStep(say(s, "Let's fix that. Choose the answer you want to change."), { kind: "correct-select", returnTo: underlyingStep(state.step) }), commands: [] };
  }

  // 8. Typed "start again" never clears the conversation by itself.
  if (RESTART_WORDS.includes(u.normalised.replace(/[.!?]+$/, ""))) {
    return {
      state: say(s, "To start afresh, use the “End session” button at the top of the conversation. Your answers so far are still here."),
      commands: [],
    };
  }

  if (view.kind === "question" && SHOW_ME_PHRASES.some((p) => hasPhrase(u.normalised, p))) return showMeWhere(s, view);

  // 9. Interpret as a reply to the current question — as a SUGGESTION only.
  const step = state.step;
  if (step.kind === "node") {
    const node = nodesById.get(step.nodeId);
    if (node && node.kind === "question") return replyToNode(s, node, u);
  }
  if (step.kind === "check") return replyToCheck(s, step, u);
  if (step.kind === "confirm") return replyToConfirm(s, step.equipmentId, u);
  if (step.kind === "correct-select" || step.kind === "correct") return reask(s, CHOOSE_FROM_BUTTONS);
  if (step.kind === "choose") {
    if (u.bare === "uncertain") return reask(s, "If you're not sure, choose “I'm not sure” or “Show me where” below.");
    const candidates = getAllEquipment().filter((record) => step.equipmentIds.includes(record.id));
    const match = matchEquipment(text, candidates);
    const [only] = match.equipmentIds;
    // Equipment identity is confirmed with a question, never assumed from typed words.
    if (match.equipmentIds.length === 1 && only) return { state: enterStep(s, { kind: "confirm", equipmentId: only }), commands: [] };
  }

  // 10. Otherwise this is a (new) description of a problem.
  return describeNewProblem(s, u, context);
}

/* ------------------------------------------------------------------ */
/* Question-specific answer schemas (RT-002D)                          */
/* ------------------------------------------------------------------ */

/** What choosing an option asserts, if anything, in claim terms. */
function optionClaim(option: FlowOption): { subject: ClaimSubject; value: boolean } | null {
  if (option.audio) return { subject: "sound", value: option.audio === "present" };
  return option.asserts ?? null;
}

/** The subjects a question node is about (from its options' declared claims). */
function nodeSubjects(node: FlowNode): ClaimSubject[] {
  return [...new Set(node.options.map(optionClaim).filter((c): c is NonNullable<typeof c> => c !== null).map((c) => c.subject))];
}

/**
 * Safety-relevant questions (broadcast, playback, sound, levels): a typed
 * reply is never committed without explicit confirmation unless it is a bare
 * yes/no or an exact answer label.
 */
function isSafetyRelevant(node: FlowNode): boolean {
  return Boolean(node.broadcastCheck) || nodeSubjects(node).some((s) => s === "sound" || s === "movement");
}

const IDENTITY_CORRECTION = [
  "not the one i meant",
  "not what i meant",
  "that is not the one",
  "not that one",
  "wrong one",
  "the wrong",
  "different one",
  "a different",
  "i meant the",
  "i mean the",
  "i was talking about",
  "i did not mean",
  "not the right one",
  "not the right thing",
  "not the thing i meant",
  "not the equipment",
];

/**
 * The presenter is correcting WHICH equipment is being discussed, not
 * answering the question ("No, that's not the one I meant", "it's not the
 * green button"). Returns the equipment they named instead, if any.
 */
function identityCorrection(u: Understanding, currentEquipmentId: string | null): { corrects: boolean; named: string | null; deniedCurrent: boolean } {
  const n = u.normalised;
  const named = interpret(u.text);
  const namedId = named.kind === "equipment" ? named.equipmentId : null;
  const current = getEquipmentById(currentEquipmentId);
  const currentNames = current ? [current.name, current.shortName, ...(current.aliases ?? [])].map((x) => normaliseReply(x)) : [];
  const deniedCurrent = currentNames.some((name) => name && (hasPhrase(n, `not the ${name}`) || hasPhrase(n, `not a ${name}`) || hasPhrase(n, `not my ${name}`) || hasPhrase(n, `is not ${name}`)));
  const phrase = IDENTITY_CORRECTION.some((p) => hasPhrase(n, p));
  const namesOther = namedId !== null && namedId !== currentEquipmentId && !deniedCurrent && /\b(i meant|i mean|it is the|it is a|it is my|talking about)\b/.test(n);
  return { corrects: phrase || deniedCurrent || namesOther, named: namedId !== currentEquipmentId && !deniedCurrent ? namedId : null, deniedCurrent };
}

interface Proposal {
  option: FlowOption;
  /** The reply can be committed without a confirmation step. */
  firm: boolean;
}

type Interpretation =
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "conflict"; message: string }
  | { kind: "other-subject"; subjects: ClaimSubject[] }
  | { kind: "none" };

const SUBJECT_WORDS: Record<ClaimSubject, [string, string]> = {
  sound: ["there's sound", "there's no sound"],
  movement: ["they are moving", "they are not moving"],
  "worked-earlier": ["it was working earlier", "it has not worked"],
  found: ["you have found it", "you can't find it"],
};

/** Read a typed reply against ONE question's answer schema. Never records anything. */
function interpretForNode(node: FlowNode, u: Understanding): Interpretation {
  const subjects = nodeSubjects(node);
  const reading = extractClaims(u.text);
  const relevant = subjects.map((subject) => ({ subject, value: claimValue(reading, subject) })).filter((r) => r.value !== null);
  const conflicted = subjects.filter((subject) => reading.conflicts.includes(subject));
  if (conflicted.length > 0) return { kind: "conflict", message: "Your message seems to say both things, so I haven't recorded an answer." };

  const stance = u.stance === "affirm" || u.stance === "negate" ? u.stance : null;
  if (u.stance === "conflict") return { kind: "conflict", message: "I'm not sure whether you meant yes or no, so I haven't recorded an answer." };

  // 1. A claim about what this question asks.
  if (relevant.length > 0) {
    const matching = node.options.filter((o) => {
      const claim = optionClaim(o);
      return claim !== null && relevant.some((r) => r.subject === claim.subject && r.value === claim.value);
    });
    if (matching.length !== 1) return { kind: "none" };
    const option = matching[0]!;
    if (stance && option.answer && (stance === "affirm") !== (option.answer === "yes")) {
      const r = relevant[0]!;
      const said = stance === "affirm" ? "yes" : "no";
      return { kind: "conflict", message: `You said ${said}, but also that ${SUBJECT_WORDS[r.subject][r.value ? 0 : 1]}, so I haven't recorded an answer.` };
    }
    const firm = reading.claims.every((c) => c.firm) && !u.hedged;
    return { kind: "proposal", proposal: { option, firm } };
  }

  // 2. Claims only about something else don't answer this question. A yes/no
  //    that AGREES with that other claim ("No, there's no sound" to "do the
  //    meters move?") is about the other subject too. One that CONTRASTS with it
  //    ("Yes, but there's no sound") answers this question — tentatively.
  const otherClaims = reading.claims.filter((c) => !subjects.includes(c.subject));
  if (otherClaims.length > 0) {
    const others = [...new Set(otherClaims.map((c) => c.subject))];
    const contrasting = stance !== null && otherClaims.every((c) => c.value !== (stance === "affirm"));
    if (!contrasting) return { kind: "other-subject", subjects: others };
    const byAnswer = node.options.filter((o) => o.answer === (stance === "affirm" ? "yes" : "no"));
    if (byAnswer.length === 1) return { kind: "proposal", proposal: { option: byAnswer[0]!, firm: false } };
    return { kind: "other-subject", subjects: others };
  }

  // 3. This option's own phrases, in statements only.
  const claimed = u.assertive ? node.options.filter((o) => o.match?.some((phrase) => hasPhrase(u.assertive, normaliseReply(phrase), true))) : [];
  if (claimed.length === 1) {
    const option = claimed[0]!;
    if (stance && option.answer && (stance === "affirm") !== (option.answer === "yes")) {
      return { kind: "conflict", message: `You said ${stance === "affirm" ? "yes" : "no"}, but the rest of your message seems to say the opposite, so I haven't recorded an answer.` };
    }
    return { kind: "proposal", proposal: { option, firm: !u.hedged && !u.negatedPredicate } };
  }
  if (claimed.length > 1) return { kind: "none" };

  // 4. A yes/no with more words: a tentative reading only.
  if (stance) {
    if (stance === "affirm" && u.negatedPredicate) {
      return { kind: "conflict", message: "You said yes, but the rest of your message seems to say the opposite, so I haven't recorded an answer." };
    }
    const byAnswer = node.options.filter((o) => o.answer === (stance === "affirm" ? "yes" : "no"));
    if (byAnswer.length === 1) return { kind: "proposal", proposal: { option: byAnswer[0]!, firm: false } };
  }
  return { kind: "none" };
}

/**
 * Show a SUGGESTION from the presenter's words. Nothing is recorded: the
 * presenter must press the answer button, and sees exactly what it says.
 * If the suggestion points to silence, safety doesn't wait for the press.
 */
function proposeCheck(state: ConversationState, node: FlowNode, option: FlowOption, basedOn: string): EngineResult {
  let s = state;
  if (nodesById.get(option.next)?.urgent) {
    s = addIncident(s, { kind: "current", certainty: "possible", scope: "listeners", source: "text", evidence: basedOn });
    s = say(s, POSSIBLE_SILENCE_PENDING_NOTE);
  }
  return { state: enterStep(s, { kind: "check", nodeId: node.id, optionId: option.id, basedOn }), commands: [] };
}

/** A typed reply to a diagnostic question: may suggest an answer, never records one. */
function replyToNode(state: ConversationState, node: FlowNode, u: Understanding): EngineResult {
  // Not knowing whether the station is on air is itself a reason to check for silence.
  if (u.signals.includes("on-air-unknown") && !node.broadcastCheck) {
    return goToNode(say(state, "Let's check that first."), ON_AIR_CHECK_NODE);
  }

  // The presenter typed an answer's label: suggest exactly that answer.
  const lower = u.text.toLowerCase().replace(/[.!?]+$/, "").trim();
  const byLabel = node.options.find((o) => o.label.toLowerCase() === lower);
  if (byLabel) return proposeCheck(state, node, byLabel, u.text);

  // A bare yes/no: suggest the answer it would mean; the presenter presses it.
  if (u.bare === "affirm" || u.bare === "negate") {
    const byAnswer = node.options.filter((o) => o.answer === (u.bare === "affirm" ? "yes" : "no"));
    if (byAnswer.length === 1) return proposeCheck(state, node, byAnswer[0]!, u.text);
    return reask(state, CHOOSE_FROM_BUTTONS);
  }
  // On a broadcast check, not knowing follows the question's own "not sure"
  // route (safety, not an answer: nothing is recorded). If that route is the
  // urgent outcome, it is escalated as POSSIBLE.
  if (node.broadcastCheck && (u.bare === "uncertain" || u.stance === "uncertain") && node.unsureNext) {
    if (nodesById.get(node.unsureNext)?.urgent) {
      const s = addIncident(state, { kind: "current", certainty: "possible", scope: "listeners", source: "text", evidence: u.text });
      return goToNode(say(s, POSSIBLE_OFF_AIR_NOTE), node.unsureNext);
    }
    return goToNode(say(state, "That's fine \u2014 let's check something else first. I haven't recorded an answer."), node.unsureNext);
  }
  if (u.bare === "uncertain") return reask(state, "If you're not sure, choose “I'm not sure” below.");

  // A correction about WHICH equipment is never an answer to this question.
  const identity = identityCorrection(u, state.equipmentId);
  if (identity.corrects) {
    const s = say(state, "It sounds like you're correcting which equipment we're talking about, not answering this question, so I haven't recorded an answer.");
    if (identity.named) return { state: enterStep(s, { kind: "confirm", equipmentId: identity.named }), commands: [] };
    return { state: enterStep(s, { kind: "choose", equipmentIds: allEquipmentIds(), reason: "other" }), commands: [] };
  }

  // Uncertain or asked-about silence is checked before anything else.
  if (u.signals.includes("silence") && !node.broadcastCheck && !nodeSubjects(node).includes("sound")) {
    return goToNode(say(state, "That sounds like there may be silence. Let me check that first."), ON_AIR_CHECK_NODE);
  }
  if (u.stance === "uncertain") return reask(state, "If you're not sure, choose “I'm not sure” below.");
  // A question or hypothetical on its own answers nothing.
  if (!u.assertive && u.stance === "none") return reask(state, u.isQuestion ? QUESTION_ONLY_REPLY : NOTED_REPLY);

  const reading = interpretForNode(node, u);
  switch (reading.kind) {
    case "proposal":
      return proposeCheck(state, node, reading.proposal.option, u.text);
    case "conflict":
      return reask(state, reading.message);
    case "other-subject":
      if (reading.subjects.includes("sound") && u.signals.includes("no-sound") && !HEARING_NODES.has(node.id)) {
        return goToNode(say(state, "Let's find out where the sound is missing."), HEARING_NODE);
      }
      return reask(state, "Thanks — I've noted that for technical support. It doesn't answer this question, so I haven't recorded an answer.");
    case "none":
      if (u.signals.includes("no-sound") && !HEARING_NODES.has(node.id)) {
        return goToNode(say(state, "Let's find out where the sound is missing."), HEARING_NODE);
      }
      return reask(state, NOTED_REPLY);
  }
}

/**
 * A typed reply while a suggestion is on screen. RT-002D-R1: typed words never
 * confirm it — not even "yes" — because the presenter must see exactly what
 * they agree to. Anything descriptive is a new reply to the original question.
 */
function replyToCheck(state: ConversationState, step: Extract<Step, { kind: "check" }>, u: Understanding): EngineResult {
  const node = nodesById.get(step.nodeId);
  if (!node) return goSupport(state);
  if (u.bare !== null) return reask(state, CHOOSE_FROM_BUTTONS);
  return replyToNode({ ...state, step: { kind: "node", nodeId: node.id } }, node, u);
}

/** A typed reply to "Are you referring to …?": may move to another item's question, never records. */
function replyToConfirm(state: ConversationState, equipmentId: string, u: Understanding): EngineResult {
  if (!u.assertive && u.stance === "none" && u.bare === null) return reask(state, QUESTION_ONLY_REPLY);
  const record = getEquipmentById(equipmentId);
  const identity = identityCorrection(u, equipmentId);
  if (u.stance === "affirm" && identity.deniedCurrent) {
    return reask(state, `You said yes, but also that it isn't the ${record?.shortName ?? "equipment"}, so I haven't recorded an answer.`);
  }
  if (u.stance === "affirm" && identity.named) {
    const named = getEquipmentById(identity.named);
    const s = say(state, `You said yes, but also mentioned the ${named?.shortName ?? "other equipment"}, so I won't assume which you mean.`);
    return { state: enterStep(s, { kind: "choose", equipmentIds: [equipmentId, identity.named], reason: "ambiguous" }), commands: [] };
  }
  // "No, it's the guest mic": ask about the newly named item instead (a question, not an answer).
  if (identity.named) return { state: enterStep(state, { kind: "confirm", equipmentId: identity.named }), commands: [] };
  if (u.signals.includes("silence")) return goToNode(say(state, "Let me check something first."), ON_AIR_CHECK_NODE);
  return reask(state, CHOOSE_FROM_BUTTONS);
}

function describeNewProblem(state: ConversationState, u: Understanding, context: EngineContext): EngineResult {
  const choose = (equipmentIds: string[], reason: ChooseReason): EngineResult => ({
    state: enterStep(state, { kind: "choose", equipmentIds, reason }),
    commands: [],
  });

  // Possible silence is checked before anything else.
  if ((u.signals.includes("silence") && u.broadcast.status !== "historical" && u.broadcast.status !== "denied") || u.signals.includes("on-air-unknown")) {
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

const INCIDENT_ENTRY_LABEL: Record<IncidentEntry["kind"], string> = {
  current: "Reported as happening now",
  historical: "Earlier interruption mentioned (presenter says it is over)",
  hypothetical: "Asked hypothetically about going off air (not a report)",
  denied: "Presenter said the station is NOT off air",
  resumed: "Presenter reports broadcasting has resumed (not independently verified)",
};

/** Plain-text summary a presenter can read out or copy to technical support. */
export function buildSupportSummary(state: ConversationState): string {
  const record = getEquipmentById(state.equipmentId);
  const lines = ["Radio Technics — problem summary (prototype, scripted)"];
  switch (state.incident.status) {
    case "confirmed":
      lines.push("URGENT: silence on air reported");
      break;
    case "possible":
      lines.push("URGENT (precaution): possible silence on air — not confirmed by the presenter");
      break;
    case "reported-resumed":
      lines.push("Broadcast interruption reported earlier in this conversation; the presenter now reports broadcasting has resumed (not independently verified)");
      break;
    case "none":
      if (state.possibleSilence) lines.push("Possible silence reported (not confirmed) — check whether the station is on air");
  }
  lines.push(`Equipment: ${record ? record.name : "not identified yet"}`);

  if (state.incident.entries.length > 0) {
    lines.push("", "Broadcast reports, in order:");
    for (const e of state.incident.entries) {
      const certainty = e.kind === "current" ? ` — ${e.certainty === "confirmed" ? "stated as fact" : "possible, not confirmed"}` : "";
      const via = e.source === "button" ? " (button)" : e.source === "knowledge-handoff" ? " (from a Knowledge Centre search)" : "";
      lines.push(`- ${INCIDENT_ENTRY_LABEL[e.kind]}${certainty}${via}: “${e.evidence}”`);
    }
  }

  if (state.observations.length > 0) {
    lines.push("", "In the presenter's own words:");
    for (const { text } of state.observations) lines.push(`- “${text}”`);
  }

  if (state.answers.length > 0) {
    lines.push("", "Answers to questions (current):");
    state.answers.forEach((a) => {
      if (a.supersededBy !== undefined) return;
      const notes = [
        a.source === "confirmed-interpretation" ? `confirmed by the presenter from their words “${a.typedText ?? ""}”` : null,
        a.certainty === "uncertain" ? "not certain" : null,
        a.corrects !== undefined ? `corrected — was “${state.answers[a.corrects]?.answer ?? ""}”` : null,
      ].filter(Boolean);
      lines.push(`- ${a.question} → ${a.answer}${notes.length ? ` (${notes.join(", ")})` : ""}`);
    });
    const superseded = state.answers.filter((a) => a.supersededBy !== undefined);
    if (superseded.length > 0) {
      lines.push("", "Earlier answers the presenter corrected (kept for the record, no longer current):");
      for (const a of superseded) lines.push(`- ${a.question} → ${a.answer} (superseded)`);
    }
  }

  if (state.observations.length === 0 && state.answers.length === 0 && state.incident.entries.length === 0) lines.push("", "No details recorded yet.");
  return lines.join("\n");
}
