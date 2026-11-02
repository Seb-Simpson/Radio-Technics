"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearSession, getSessionStorage, loadSession, saveSession } from "@/lib/session/storage";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";
import type { WorkspaceCommand } from "@/lib/workspace/commands";
import { createConversation, respond } from "./engine";
import type { ConversationState, UserInput } from "./types";

interface TroubleshooterContextValue {
  conversation: ConversationState;
  send: (input: UserInput) => void;
  /**
   * Clear the conversation, the selected equipment and the saved session.
   * Only called after the user confirms (see ConfirmClear).
   */
  endSession: () => void;
  /** Start from a predefined topic. Continues an active conversation rather than discarding it. */
  startTopic: (topicId: string) => void;
  /** True once the user has said anything. */
  active: boolean;
  /** Set when a conversation was restored from earlier in this browser tab. */
  restored: boolean;
  dismissRestored: () => void;
}

const TroubleshooterContext = createContext<TroubleshooterContextValue | null>(null);

/**
 * Holds the conversation at application level so it survives navigation
 * between pages, and (RT-002 G) a page refresh within the same tab.
 */
export function TroubleshooterProvider({ children }: { children: ReactNode }) {
  const { state: workspace, run } = useWorkspace();
  const [conversation, setConversation] = useState<ConversationState>(createConversation);
  const [restored, setRestored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const current = useRef(conversation);
  const selected = useRef(workspace.selectedEquipmentId);
  useEffect(() => {
    selected.current = workspace.selectedEquipmentId;
  }, [workspace.selectedEquipmentId]);

  const apply = useCallback((next: ConversationState) => {
    current.current = next;
    setConversation(next);
  }, []);

  // Restore once, after mount (keeps server and client renders identical).
  useEffect(() => {
    const result = loadSession(getSessionStorage());
    if (result.status === "restored") {
      const { conversation: saved, workspace: ws } = result.session;
      apply(saved);
      // Workspace state goes through the same command validation as everything else.
      const commands: WorkspaceCommand[] = [];
      if (ws.activeViewId) commands.push({ type: "show_view", viewId: ws.activeViewId });
      if (ws.selectedEquipmentId) commands.push({ type: "select_equipment", equipmentId: ws.selectedEquipmentId });
      if (commands.length > 0) run(commands);
      setRestored(saved.messages.some((m) => m.role === "user"));
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Save after every change, but never before the restore attempt has finished.
  useEffect(() => {
    if (!loaded) return;
    const hasContent = conversation.messages.some((m) => m.role === "user") || workspace.selectedEquipmentId !== null;
    const storage = getSessionStorage();
    if (!hasContent) {
      clearSession(storage);
      return;
    }
    saveSession(storage, conversation, { selectedEquipmentId: workspace.selectedEquipmentId, activeViewId: workspace.activeViewId });
  }, [loaded, conversation, workspace.selectedEquipmentId, workspace.activeViewId]);

  const send = useCallback(
    (input: UserInput) => {
      const result = respond(current.current, input, { selectedEquipmentId: selected.current });
      apply(result.state);
      if (result.commands.length > 0) run(result.commands);
    },
    [apply, run],
  );

  const endSession = useCallback(() => {
    clearSession(getSessionStorage());
    apply(createConversation());
    run([{ type: "clear_selection" }]);
    setRestored(false);
  }, [apply, run]);

  const startTopic = useCallback(
    (topicId: string) => {
      // Never discard an ongoing conversation implicitly (RT-QA-001 A2).
      const base = current.current.messages.some((m) => m.role === "user") ? current.current : createConversation();
      const result = respond(base, { type: "topic", topicId }, { selectedEquipmentId: null });
      apply(result.state);
      if (result.commands.length > 0) run(result.commands);
    },
    [apply, run],
  );

  const dismissRestored = useCallback(() => setRestored(false), []);

  const value = useMemo(
    () => ({
      conversation,
      send,
      endSession,
      startTopic,
      active: conversation.messages.some((m) => m.role === "user"),
      restored,
      dismissRestored,
    }),
    [conversation, send, endSession, startTopic, restored, dismissRestored],
  );
  return <TroubleshooterContext.Provider value={value}>{children}</TroubleshooterContext.Provider>;
}

export function useTroubleshooter(): TroubleshooterContextValue {
  const context = useContext(TroubleshooterContext);
  if (!context) throw new Error("useTroubleshooter must be used inside <TroubleshooterProvider>");
  return context;
}
