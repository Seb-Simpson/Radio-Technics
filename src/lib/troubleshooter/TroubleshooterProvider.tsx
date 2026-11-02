"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";
import { createConversation, respond } from "./engine";
import type { ConversationState, UserInput } from "./types";

interface TroubleshooterContextValue {
  conversation: ConversationState;
  send: (input: UserInput) => void;
  restart: () => void;
  /** Start a fresh conversation from a predefined topic. */
  startTopic: (topicId: string) => void;
  /** True once the user has said anything. */
  active: boolean;
}

const TroubleshooterContext = createContext<TroubleshooterContextValue | null>(null);

/**
 * Holds the conversation at application level so it survives navigation
 * between the Troubleshooter and the Studio Explorer.
 */
export function TroubleshooterProvider({ children }: { children: ReactNode }) {
  const { state: workspace, run } = useWorkspace();
  const [conversation, setConversation] = useState<ConversationState>(createConversation);
  const current = useRef(conversation);
  const selected = useRef(workspace.selectedEquipmentId);
  useEffect(() => {
    selected.current = workspace.selectedEquipmentId;
  }, [workspace.selectedEquipmentId]);

  const apply = useCallback((next: ConversationState) => {
    current.current = next;
    setConversation(next);
  }, []);

  const send = useCallback(
    (input: UserInput) => {
      const result = respond(current.current, input, { selectedEquipmentId: selected.current });
      apply(result.state);
      if (result.commands.length > 0) run(result.commands);
    },
    [apply, run],
  );

  const restart = useCallback(() => apply(createConversation()), [apply]);

  const startTopic = useCallback(
    (topicId: string) => {
      const result = respond(createConversation(), { type: "topic", topicId }, { selectedEquipmentId: null });
      apply(result.state);
      if (result.commands.length > 0) run(result.commands);
    },
    [apply, run],
  );

  const value = useMemo(
    () => ({ conversation, send, restart, startTopic, active: conversation.messages.some((m) => m.role === "user") }),
    [conversation, send, restart, startTopic],
  );
  return <TroubleshooterContext.Provider value={value}>{children}</TroubleshooterContext.Provider>;
}

export function useTroubleshooter(): TroubleshooterContextValue {
  const context = useContext(TroubleshooterContext);
  if (!context) throw new Error("useTroubleshooter must be used inside <TroubleshooterProvider>");
  return context;
}
