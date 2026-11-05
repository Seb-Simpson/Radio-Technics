import type { WorkspaceCommand } from "@/lib/workspace/commands";
import type { ClaimSubject } from "./claims";
import type { AudioClaim } from "./understand";

/* ------------------------------------------------------------------ */
/* Static flow content                                                 */
/* ------------------------------------------------------------------ */

export interface FlowOption {
  id: string;
  label: string;
  /** Node to move to when chosen. */
  next: string;
  /**
   * What this option means as a reply to a yes/no question. Typed replies
   * are only mapped to an option whose meaning agrees with the user's stance.
   */
  answer?: "yes" | "no";
  /**
   * Whether choosing this option asserts that sound/playback is present or
   * absent. A typed reply describing the opposite can never select it.
   */
  audio?: AudioClaim;
  /**
   * What choosing this option asserts about another subject the question asks
   * about (RT-002D answer schema), e.g. the level meters moving.
   */
  asserts?: { subject: Exclude<ClaimSubject, "sound">; value: boolean };
  /**
   * How to restate this answer when asking the presenter to confirm an
   * interpretation of their typed words: "It sounds like {restate}. Is that right?"
   */
  restate?: string;
  /** Specific lower-case phrases that identify this option when typed (negated mentions are ignored). */
  match?: string[];
  /** Switch the conversation's equipment context when chosen. */
  setEquipmentId?: string;
}

export interface FlowNode {
  id: string;
  /**
   * `question` — asks one thing; universal responses are added automatically.
   * `outcome`  — ends a line of questioning; always offers support and restart.
   */
  kind: "question" | "outcome";
  /** May contain `{equipment}`, replaced with the current equipment's short name. */
  prompt: string;
  /** Optional plain-English explanation shown beneath the prompt. */
  help?: string;
  /** Equipment that "Show me where" should highlight. Defaults to the conversation's equipment. */
  showEquipmentId?: string;
  options: FlowOption[];
  /** Where "I'm not sure" leads. Required for question nodes. */
  unsureNext?: string;
  /** Marks outcomes that need urgent attention (e.g. possible silence on air). */
  urgent?: boolean;
  /** The question is about whether the broadcast is silent. */
  broadcastCheck?: boolean;
}

export interface TroubleshootingTopic {
  id: string;
  label: string;
  description: string;
  /** Sent to the interpreter as if the user had typed it. */
  utterance: string;
}

/* ------------------------------------------------------------------ */
/* Conversation state                                                  */
/* ------------------------------------------------------------------ */

export type ChooseReason = "ambiguous" | "vague" | "unknown" | "other";

export type Step =
  | { kind: "start" }
  | { kind: "node"; nodeId: string }
  | { kind: "confirm"; equipmentId: string }
  | { kind: "choose"; equipmentIds: string[]; reason: ChooseReason }
  | { kind: "support"; returnTo: Step }
  /**
   * RT-002D: typed words were interpreted as `optionId` on `nodeId`, but that is
   * only a tentative interpretation. Nothing is recorded until the presenter
   * confirms it (or picks another answer) with a button.
   */
  | { kind: "check"; nodeId: string; optionId: string; basedOn: string }
  /** RT-002D-R1: choose which earlier answer to correct. */
  | { kind: "correct-select"; returnTo: Step }
  /** RT-002D-R1: give the replacement answer for `answerIndex`. */
  | { kind: "correct"; answerIndex: number; returnTo: Step };

export type MessageRole = "assistant" | "user" | "notice";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  help?: string;
  urgent?: boolean;
}

/**
 * A diagnostic answer. RT-002D-R1: ONLY ever created by the presenter pressing
 * an answer button that was displayed for the active question instance.
 * Typed text never creates one.
 */
export interface AnsweredQuestion {
  /** The question (node ID, `confirm:<equipment>`, `choose`, …) and the option pressed. */
  questionId: string;
  optionId: string;
  /** The question instance the button belonged to. */
  instanceId: number;
  question: string;
  /** The exact label on the button the presenter pressed. */
  answer: string;
  /**
   * `button` — the presenter pressed the answer.
   * `confirmed-interpretation` — the presenter pressed the answer that the
   *   system suggested from their own words (quoted in `typedText`).
   */
  source: "button" | "confirmed-interpretation";
  /** `uncertain` for "I'm not sure", hedged replies and inferred answers. */
  certainty: "confirmed" | "uncertain";
  /** The presenter's words the suggestion was based on, if any. */
  typedText?: string;
  /** Index (in `answers`) of the answer this one corrects. */
  corrects?: number;
  /** Index of the later answer that replaced this one. The original is kept for history. */
  supersededBy?: number;
}

/* ------------------------------------------------------------------ */
/* Broadcast incidents (RT-002D-R1)                                    */
/* ------------------------------------------------------------------ */

/**
 * `possible`/`confirmed` — a current concern about the station's output.
 * `reported-resumed` — the presenter reports broadcasting has resumed. This is
 * the presenter's report, not an independent check.
 */
export type IncidentStatus = "none" | "possible" | "confirmed" | "reported-resumed";

export interface IncidentEntry {
  kind: "current" | "historical" | "hypothetical" | "denied" | "resumed";
  certainty: "confirmed" | "possible";
  /** What it concerns. Local monitoring is never recorded as an incident. */
  scope: "listeners";
  source: "button" | "text" | "knowledge-handoff" | "answer";
  /** The presenter's words or the button they pressed. */
  evidence: string;
}

export interface IncidentState {
  status: IncidentStatus;
  /** Every report, in order — nothing is ever removed. */
  entries: IncidentEntry[];
}

/** Something the user typed, kept word-for-word for technical support. */
export interface Observation {
  text: string;
  /** The question on screen when it was typed, if any. */
  inReplyTo: string | null;
}

export interface ConversationState {
  step: Step;
  /** Equipment the conversation is currently about, once identified. */
  equipmentId: string | null;
  messages: ChatMessage[];
  /** Diagnostic answers (button choices and interpreted replies). */
  answers: AnsweredQuestion[];
  /** Everything the user typed, verbatim, separate from diagnostic answers. */
  observations: Observation[];
  /** Set once silence on air has been reported or confirmed. Never cleared automatically. */
  urgent: boolean;
  /** Set when the user described possible silence that hasn't been confirmed. Never cleared automatically. */
  possibleSilence: boolean;
  /**
   * RT-QA-002B: true only when the presenter stated as fact that the station is
   * off air. `urgent` without this means silence is possible but unconfirmed and
   * is being treated as urgent as a precaution. Never cleared automatically.
   */
  confirmedOffAir: boolean;
  /** RT-002D-R1: the broadcast incident record (status + full history). */
  incident: IncidentState;
  /**
   * RT-002D-R1: identifies the question currently on screen. Every displayed
   * option carries it, and an option from any other instance is rejected.
   */
  instance: number;
  /** Monotonic counter for message IDs (keeps the engine pure and deterministic). */
  seq: number;
}

export type UniversalOptionId = "u-unsure" | "u-show" | "u-support";

export type StepOptionKind = "answer" | "universal" | "restart" | "back" | "topic" | "correct";

export interface StepOption {
  id: string;
  label: string;
  kind: StepOptionKind;
}

export interface StepView {
  kind: "start" | "question" | "outcome" | "support";
  prompt: string;
  help?: string;
  options: StepOption[];
  /** Equipment "Show me where" refers to, if any. */
  equipmentId: string | null;
  urgent?: boolean;
  /** The question instance these options belong to (send it back with the option). */
  instanceId: number;
}

export type UserInput =
  /** A displayed button, bound to the question instance it was shown for. */
  | { type: "option"; optionId: string; instanceId: number }
  | { type: "text"; text: string }
  | { type: "equipment"; equipmentId: string }
  | { type: "topic"; topicId: string }
  /** RT-002D-R1: the always-available controls, independent of language understanding. */
  | { type: "broadcast"; report: "off-air" | "resumed" }
  /** RT-002D-R1: a Knowledge Centre search carried into the troubleshooter for its safety content only. */
  | { type: "handoff"; text: string };

export interface EngineContext {
  /** Equipment currently selected in the Studio Explorer, if any. */
  selectedEquipmentId: string | null;
}

export interface EngineResult {
  state: ConversationState;
  /** UI commands for the workspace. Always validated before execution. */
  commands: WorkspaceCommand[];
  /**
   * RT-002D-R1: set when the input was refused (stale button, text too long,
   * nothing to hand off…). `state` is then the unchanged input state, and the
   * input must not be saved.
   */
  rejected?: string;
}
