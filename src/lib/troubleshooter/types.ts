import type { WorkspaceCommand } from "@/lib/workspace/commands";

/* ------------------------------------------------------------------ */
/* Static flow content                                                 */
/* ------------------------------------------------------------------ */

export interface FlowOption {
  id: string;
  label: string;
  /** Node to move to when chosen. */
  next: string;
  /** Extra lower-case phrases that count as choosing this option when typed. */
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

export interface AnsweredQuestion {
  question: string;
  answer: string;
}

export interface ConversationState {
  step: Step;
  /** Equipment the conversation is currently about, once identified. */
  equipmentId: string | null;
  messages: ChatMessage[];
  /** Question/answer log, used for the technical-support summary. */
  answers: AnsweredQuestion[];
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
