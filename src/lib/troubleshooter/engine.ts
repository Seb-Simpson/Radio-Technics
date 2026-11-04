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
    case "check": {
      // RT-002D: a tentative interpretation waiting for the presenter to confirm it.
      const node = nodesById.get(step.nodeId);
      const candidate = node?.options.find((o) => o.id === step.optionId);
      if (!node || !candidate) {
        return { kind: "outcome", prompt: "Something went wrong with this conversation.", options: [SUPPORT_OPTION, RESTART_OPTION], equipmentId: null };
      }
      const restated = candidate.restate ? fillTemplate(candidate.restate, state.equipmentId) : `\u201c${candidate.label}\u201d`;
      return {
        kind: "question",
        prompt: `It sounds like ${restated}. Is that correct?`,
        help: `I haven't recorded anything yet. The question was: \u201c${fillTemplate(node.prompt, state.equipmentId)}\u201d`,
        options: [
          // The proposed answer first, then every other real answer.
          { id: `opt:${candidate.id}`, label: candidate.label, kind: "answer" as const },
          ...node.options.filter((o) => o.id !== candidate.id).map((o) => ({ id: `opt:${o.id}`, label: o.label, kind: "answer" as const })),
          ...UNIVERSAL_OPTIONS,
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
        prompt: state.urgent
          ? `${state.confirmedOffAir ? URGENT_SUPPORT_PREFIX : POSSIBLE_URGENT_SUPPORT_PREFIX} ${SUPPORT_PROMPT}`
          : SUPPORT_PROMPT,
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
    confirmedOffAir: false,
    broadcastReports: [],
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

function recordAnswer(state: ConversationState, optionId: string, answer: string, meta: AnswerMeta): ConversationState {
  const entry: AnsweredQuestion = { questionId: questionIdOf(state.step), optionId, question: questionPrompt(state), answer, ...meta };
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
  // Pressing the answer the system proposed confirms that interpretation of the presenter's words.
  if (state.step.kind === "check" && option.id === `opt:${state.step.optionId}`) {
    return applyChoice(s, option, confirmedMeta(state.step.basedOn));
  }
  return applyChoice(s, option, BUTTON);
}

/**
 * Apply a chosen option. `state` already contains the user's message;
 * `state.step` is still the step the option belongs to. This is the ONLY
 * place answers are recorded.
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
      return handleUnsure(recordAnswer(state, option.id, option.label, { ...meta, certainty: "uncertain" }), step);
  }

  let s = recordAnswer(state, option.id, option.label, meta);

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

function showMeWhere(state: ConversationState, view: StepView): EngineResult {
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
  s = {
    ...s,
    answers: [...s.answers, { questionId: "studio-explorer", optionId: `equip:${equipmentId}`, question: "Equipment selected in Studio Explorer", answer: record.name, ...BUTTON }],
  };
  return beginEquipmentFlow(s, equipmentId, []);
}

function handleTopic(state: ConversationState, topicId: string): EngineResult {
  const topic = troubleshootingTopics.find((t) => t.id === topicId);
  if (!topic) return { state: addMessage(state, { role: "notice", text: "That topic isn't available." }), commands: [] };
  let s = addMessage(state, { role: "user", text: topic.label });
  s = { ...s, answers: [...s.answers, { questionId: "topic", optionId: `topic:${topic.id}`, question: "Common problem chosen", answer: topic.label, ...BUTTON }] };
  return describeNewProblem(s, understand(topic.utterance), { selectedEquipmentId: null });
}

/* ------------------------------------------------------------------ */
/* Safety (RT-002D): independent of routing                            */
/* ------------------------------------------------------------------ */

/**
 * Attach the broadcast-safety reading of this message to the session. Runs
 * before any routing and never looks at the question or answer options.
 * Urgency only ever increases; historical, hypothetical and denied readings
 * are kept for technical support but never raise or lower urgency.
 */
function applySafety(state: ConversationState, text: string, broadcast: BroadcastAssessment, u: Understanding): ConversationState {
  let s = state;
  if (broadcast.status !== "none") s = { ...s, broadcastReports: [...s.broadcastReports, { status: broadcast.status, text }] };
  if (broadcast.status === "current-confirmed") s = { ...s, urgent: true, confirmedOffAir: true };
  else if (broadcast.status === "current-possible") s = { ...s, urgent: true, possibleSilence: true };
  // Silence described without mentioning the broadcast ("nothing is playing") is possible silence.
  if (u.signals.includes("silence") && !isCurrentConcern(broadcast.status) && broadcast.status !== "historical" && broadcast.status !== "hypothetical" && broadcast.status !== "denied") {
    s = { ...s, possibleSilence: true };
  }
  if (u.signals.includes("on-air-unknown")) s = { ...s, possibleSilence: true };
  return s;
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
  const broadcast = u.broadcast;

  // 1. The presenter's words are kept verbatim, before anything else happens.
  let s = addMessage(state, { role: "user", text });
  s = recordObservation(s, text, view.kind === "question" ? view.prompt : null);

  // 2. Safety, classified independently and attached BEFORE any routing, so it
  //    survives whatever else the message asks for.
  s = applySafety(s, text, broadcast, u);

  // 3. A current broadcast concern goes to the urgent state. A request for a
  //    person or a procedure question in the same message is answered there;
  //    neither erases the concern.
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

  // 6. Past, hypothetical and denied interruptions are noted, never recorded as current.
  if (broadcast.status === "hypothetical" && !u.assertive) return reask(s, HYPOTHETICAL_OFF_AIR_REPLY);
  if (broadcast.status === "historical") s = say(s, HISTORICAL_OFF_AIR_NOTE);
  if (broadcast.status === "denied") s = say(s, DENIED_OFF_AIR_NOTE);

  // 7. Typed "start again" never clears the conversation by itself.
  if (RESTART_WORDS.includes(u.normalised.replace(/[.!?]+$/, ""))) {
    return {
      state: say(s, "To start afresh, use the “End session” button at the top of the conversation. Your answers so far are still here."),
      commands: [],
    };
  }

  // 8. The presenter typed an answer's exact label: that is an explicit choice.
  const lower = text.toLowerCase().replace(/[.!?]+$/, "");
  const byLabel = view.options.find((o) => o.kind !== "topic" && o.kind !== "restart" && o.label.toLowerCase() === lower);
  if (byLabel) return applyChoice(s, byLabel, { source: "typed", certainty: "confirmed", typedText: text });

  if (view.kind === "question" && SHOW_ME_PHRASES.some((p) => hasPhrase(u.normalised, p))) return showMeWhere(s, view);

  // 9. Interpret as a reply to the current question, by that question's schema.
  const step = state.step;
  if (step.kind === "node") {
    const node = nodesById.get(step.nodeId);
    if (node && node.kind === "question") return replyToNode(s, node, u);
  }
  if (step.kind === "check") return replyToCheck(s, step, u);
  if (step.kind === "confirm") return replyToConfirm(s, step.equipmentId, u);
  if (step.kind === "choose") {
    if (u.bare === "uncertain") return applyChoice(s, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));
    const candidates = getAllEquipment().filter((record) => step.equipmentIds.includes(record.id));
    const match = matchEquipment(text, candidates);
    const [only] = match.equipmentIds;
    // Equipment identity is confirmed with a question, never assumed from typed words.
    if (match.equipmentIds.length === 1 && only) return { state: enterStep(s, { kind: "confirm", equipmentId: only }), commands: [] };
  }

  // 10. Otherwise this is a (new) description of a problem.
  return describeNewProblem(s, u, context);
}

/** Confirming an interpretation of hedged words ("I think so") keeps it marked as not certain. */
function confirmedMeta(basedOn: string): AnswerMeta {
  return { source: "confirmed-interpretation", certainty: understand(basedOn).hedged ? "uncertain" : "confirmed", typedText: basedOn };
}

function typedMeta(u: Understanding, certainty?: AnsweredQuestion["certainty"]): AnswerMeta {
  return { source: "typed", certainty: certainty ?? (u.hedged ? "uncertain" : "confirmed"), typedText: u.text };
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

function proposeCheck(state: ConversationState, node: FlowNode, option: FlowOption, basedOn: string): EngineResult {
  let s = state;
  // Safety never waits for the confirmation click: if this reading points to
  // possible silence, escalate now as POSSIBLE (unconfirmed). Only the
  // recorded answer waits for the presenter.
  if (nodesById.get(option.next)?.urgent) {
    s = say({ ...s, urgent: true, possibleSilence: true }, POSSIBLE_SILENCE_PENDING_NOTE);
  }
  return { state: enterStep(s, { kind: "check", nodeId: node.id, optionId: option.id, basedOn }), commands: [] };
}

function commitNodeOption(state: ConversationState, node: FlowNode, option: FlowOption, meta: AnswerMeta): EngineResult {
  const view = describeStep({ ...state, step: { kind: "node", nodeId: node.id } });
  const stepOption = view.options.find((o) => o.id === `opt:${option.id}`)!;
  return applyChoice({ ...state, step: { kind: "node", nodeId: node.id } }, stepOption, meta);
}

function replyToNode(state: ConversationState, node: FlowNode, u: Understanding): EngineResult {
  // Not knowing whether the station is on air is itself a reason to check for silence.
  if (u.signals.includes("on-air-unknown") && !node.broadcastCheck) {
    return goToNode(say(state, "Let's check that first."), ON_AIR_CHECK_NODE);
  }

  // A bare "yes", "no" or "not sure" answers exactly this question.
  if (u.bare === "uncertain") return applyChoice(state, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));
  if (u.bare === "affirm" || u.bare === "negate") {
    const byAnswer = node.options.filter((o) => o.answer === (u.bare === "affirm" ? "yes" : "no"));
    if (byAnswer.length === 1) {
      // A bare yes/no answers exactly the question on screen — including the
      // broadcast check, so a clear "yes" there escalates without delay.
      return commitNodeOption(state, node, byAnswer[0]!, typedMeta(u));
    }
  }

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
  if (u.stance === "uncertain") return applyChoice(state, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));
  // A question or hypothetical on its own answers nothing.
  if (!u.assertive && u.stance === "none") return reask(state, u.isQuestion ? QUESTION_ONLY_REPLY : NOTED_REPLY);

  const reading = interpretForNode(node, u);
  switch (reading.kind) {
    case "proposal": {
      const { option, firm } = reading.proposal;
      if (firm && !isSafetyRelevant(node)) return commitNodeOption(state, node, option, typedMeta(u));
      return proposeCheck(state, node, option, u.text);
    }
    case "conflict":
      return reask(state, reading.message);
    case "other-subject": {
      if (reading.subjects.includes("sound") && u.signals.includes("no-sound") && !HEARING_NODES.has(node.id)) {
        return goToNode(say(state, "Let's find out where the sound is missing."), HEARING_NODE);
      }
      return reask(state, "Thanks — I've noted that for technical support. It doesn't answer this question, so I haven't recorded an answer.");
    }
    case "none":
      if (u.signals.includes("no-sound") && !HEARING_NODES.has(node.id)) {
        return goToNode(say(state, "Let's find out where the sound is missing."), HEARING_NODE);
      }
      return reask(state, NOTED_REPLY);
  }
}

/** A reply while a tentative interpretation is waiting for confirmation. */
function replyToCheck(state: ConversationState, step: Extract<Step, { kind: "check" }>, u: Understanding): EngineResult {
  const node = nodesById.get(step.nodeId);
  const option = node?.options.find((o) => o.id === step.optionId);
  if (!node || !option) return goSupport(state);
  if (u.bare === "affirm") {
    return applyChoice(state, { id: `opt:${option.id}`, label: option.label, kind: "answer" }, confirmedMeta(step.basedOn));
  }
  if (u.bare === "negate") {
    return { state: enterStep(say(state, "Okay, I haven't recorded that. Which of these is right?"), { kind: "node", nodeId: node.id }), commands: [] };
  }
  if (u.bare === "uncertain") return applyChoice(state, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));
  // Anything else is a new reply to the original question.
  return replyToNode({ ...state, step: { kind: "node", nodeId: node.id } }, node, u);
}

function replyToConfirm(state: ConversationState, equipmentId: string, u: Understanding): EngineResult {
  if (u.bare === "uncertain" || u.stance === "uncertain") return applyChoice(state, UNIVERSAL_OPTIONS[0]!, typedMeta(u, "uncertain"));
  if (u.stance === "conflict") return reask(state, "I'm not sure whether you meant yes or no, so I haven't recorded an answer.");
  const options = describeStep(state).options;
  if (!u.assertive && u.stance === "none") return reask(state, QUESTION_ONLY_REPLY);
  const record = getEquipmentById(equipmentId);
  const identity = identityCorrection(u, equipmentId);

  // "Yes, it's not the green button": never assume either way.
  if (u.stance === "affirm" && identity.deniedCurrent) {
    return reask(state, `You said yes, but also that it isn't the ${record?.shortName ?? "equipment"}, so I haven't recorded an answer.`);
  }
  // "Yes, it's the guest mic" while confirming another item: ask which.
  if (u.stance === "affirm" && identity.named) {
    const named = getEquipmentById(identity.named);
    const s = say(state, `You said yes, but also mentioned the ${named?.shortName ?? "other equipment"}, so I won't assume which you mean.`);
    return { state: enterStep(s, { kind: "choose", equipmentIds: [equipmentId, identity.named], reason: "ambiguous" }), commands: [] };
  }
  // "No, it's the guest mic": ask about the newly named item (nothing recorded).
  if (identity.named && u.stance !== "affirm") {
    return { state: enterStep(state, { kind: "confirm", equipmentId: identity.named }), commands: [] };
  }
  // This question IS about identity, so "not the one I meant" answers it: no.
  if (u.stance === "negate" || identity.corrects) return applyChoice(state, options.find((o) => o.id === "confirm:no")!, typedMeta(u));
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

/** Plain-text summary a presenter can read out or copy to technical support. */
export function buildSupportSummary(state: ConversationState): string {
  const record = getEquipmentById(state.equipmentId);
  const lines = ["Radio Technics \u2014 problem summary (prototype, scripted)"];
  if (state.urgent && state.confirmedOffAir) lines.push("URGENT: silence on air reported");
  else if (state.urgent) lines.push("URGENT (precaution): possible silence on air \u2014 not confirmed by the presenter");
  else if (state.possibleSilence) lines.push("Possible silence reported (not confirmed) \u2014 check whether the station is on air");
  lines.push(`Equipment: ${record ? record.name : "not identified yet"}`);
  // Mentioned but never treated as current: kept so support has the full picture.
  for (const report of state.broadcastReports) {
    if (report.status === "historical") lines.push(`Earlier interruption mentioned (presenter says it is over): \u201c${report.text}\u201d`);
    if (report.status === "hypothetical") lines.push(`Asked hypothetically about going off air (not a report): \u201c${report.text}\u201d`);
  }

  if (state.observations.length > 0) {
    lines.push("", "In the presenter's own words:");
    for (const { text } of state.observations) lines.push(`- \u201c${text}\u201d`);
  }

  if (state.answers.length > 0) {
    lines.push("", "Answers to questions:");
    for (const a of state.answers) {
      const notes = [
        a.source === "typed" ? "typed reply" : null,
        a.source === "confirmed-interpretation" ? `confirmed by the presenter from their words \u201c${a.typedText ?? ""}\u201d` : null,
        a.certainty === "uncertain" ? "not certain" : null,
      ].filter(Boolean);
      lines.push(`- ${a.question} \u2192 ${a.answer}${notes.length ? ` (${notes.join(", ")})` : ""}`);
    }
  }

  if (state.observations.length === 0 && state.answers.length === 0) lines.push("", "No details recorded yet.");
  return lines.join("\n");
}
