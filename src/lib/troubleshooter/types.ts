import type { WorkspaceCommand } from "@/lib/workspace/commands";
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
  | { kind: "support"; returnTo: Step };

export type MessageRole = "assistant" | "user" | "notice";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  help?: string;
  urgent?: boolean;
}

/** A diagnostic answer: a button choice, or a typed reply mapped to an option. */
export interface AnsweredQuestion {
  question: string;
  answer: string;
  source: "button" | "typed";
  /** `uncertain` for "I'm not sure", hedged replies and inferred answers. */
  certainty: "confirmed" | "uncertain";
  /** Verbatim text when the answer was typed. */
  typedText?: string;
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
  /** Monotonic counter for message IDs (keeps the engine pure and deterministic). */
  seq: number;
}

export type UniversalOptionId = "u-unsure" | "u-show" | "u-support";

export type StepOptionKind = "answer" | "universal" | "restart" | "back" | "topic";

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
}

export type UserInput =
  | { type: "option"; optionId: string }
  | { type: "text"; text: string }
  | { type: "equipment"; equipmentId: string }
  | { type: "topic"; topicId: string };

export interface EngineContext {
  /** Equipment currently selected in the Studio Explorer, if any. */
  selectedEquipmentId: string | null;
}

export interface EngineResult {
  state: ConversationState;
  /** UI commands for the workspace. Always validated before execution. */
  commands: WorkspaceCommand[];
}
