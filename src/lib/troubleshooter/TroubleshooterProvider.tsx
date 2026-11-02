"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearSession, getSessionStorage, isSessionExpired, loadSession, saveSession } from "@/lib/session/storage";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";
import type { WorkspaceCommand } from "@/lib/workspace/commands";
import { createConversation, respond } from "./engine";
import type { ConversationState, UserInput } from "./types";

/** How often an open tab re-checks for idle expiry. */
export const EXPIRY_CHECK_INTERVAL_MS = 30_000;

interface TroubleshooterContextValue {
  conversation: ConversationState;
  /**
   * Process a user input. Returns false if it was not processed because the
   * session had expired (the expired session is cleared first).
   */
  send: (input: UserInput) => boolean;
  /**
   * Clear the conversation, the selected equipment and the saved session.
   * Only called after the user confirms (see ConfirmClear).
   */
  endSession: () => void;
  /** Start from a predefined topic. Continues an active conversation rather than discarding it. */
  startTopic: (topicId: string) => boolean;
  /** True once the user has said anything. */
  active: boolean;
  /** Set when a conversation was restored from earlier in this browser tab. */
  restored: boolean;
  dismissRestored: () => void;
  /** Set when an open session was cleared for being idle too long. */
  expired: boolean;
  dismissExpired: () => void;
}

const TroubleshooterContext = createContext<TroubleshooterContextValue | null>(null);

const hasUserContent = (c: ConversationState) => c.messages.some((m) => m.role === "user");

/**
 * Holds the conversation at application level so it survives navigation
 * between pages, and (RT-002 G) a page refresh within the same tab.
 *
 * Idle expiry (RT-QA-002 P3): the session ends two hours after the last
 * USER action. Only user actions update the activity time; saves, restores
 * and re-renders never do. Expiry is enforced before any new input is
 * processed, periodically while the tab is open, and when the tab regains
 * focus. `clock` is injectable so tests can move time without waiting.
 */
export function TroubleshooterProvider({ children, clock = Date.now }: { children: ReactNode; clock?: () => number }) {
  const { state: workspace, run } = useWorkspace();
  const [conversation, setConversation] = useState<ConversationState>(createConversation);
  const [restored, setRestored] = useState(false);
  const [expired, setExpired] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const current = useRef(conversation);
  const selected = useRef(workspace.selectedEquipmentId);
  /** Time of the last user action, or null when there is nothing to expire. */
  const lastActivity = useRef<number | null>(null);
  /** Workspace changes caused by restoring/expiring are not user activity. */
  const systemChange = useRef(false);

  const apply = useCallback((next: ConversationState) => {
    current.current = next;
    setConversation(next);
  }, []);

  const touch = useCallback(() => {
    lastActivity.current = clock();
  }, [clock]);

  const clearEverything = useCallback(() => {
    clearSession(getSessionStorage());
    apply(createConversation());
    if (selected.current !== null) systemChange.current = true;
    run([{ type: "clear_selection" }]);
    lastActivity.current = null;
    setRestored(false);
  }, [apply, run]);

  /** Clears the session if it has been idle too long. Returns true if it expired. */
  const enforceExpiry = useCallback((): boolean => {
    const last = lastActivity.current;
    if (last === null || !isSessionExpired(last, clock())) return false;
    clearEverything();
    setExpired(true);
    return true;
  }, [clock, clearEverything]);

  // Track the latest selection; a selection change made by the user counts as activity.
  useEffect(() => {
    const changed = selected.current !== workspace.selectedEquipmentId;
    selected.current = workspace.selectedEquipmentId;
    if (!loaded || !changed) return;
    if (systemChange.current) {
      systemChange.current = false;
      return;
    }
    if (workspace.selectedEquipmentId !== null && !enforceExpiry()) touch();
  }, [workspace.selectedEquipmentId, loaded, enforceExpiry, touch]);

  // Restore once, after mount (keeps server and client renders identical).
  useEffect(() => {
    const result = loadSession(getSessionStorage(), clock());
    if (result.status === "restored") {
      const { conversation: saved, workspace: ws, lastActivityAt } = result.session;
      apply(saved);
      // Restoring is not activity: keep the original time so it can't extend the session.
      lastActivity.current = lastActivityAt;
      const commands: WorkspaceCommand[] = [];
      if (ws.activeViewId) commands.push({ type: "show_view", viewId: ws.activeViewId });
      if (ws.selectedEquipmentId) commands.push({ type: "select_equipment", equipmentId: ws.selectedEquipmentId });
      if (commands.length > 0) {
        if (ws.selectedEquipmentId) systemChange.current = true;
        run(commands);
      }
      setRestored(hasUserContent(saved));
    } else if (result.status === "discarded" && result.reason === "expired") {
      setExpired(true);
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // While the tab is open: check periodically and whenever the user comes back to it.
  useEffect(() => {
    if (!loaded) return;
    const check = () => void enforceExpiry();
    const timer = window.setInterval(check, EXPIRY_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [loaded, enforceExpiry]);

  // Save after every change, stamped with the last USER activity (never "now").
  useEffect(() => {
    if (!loaded) return;
    const storage = getSessionStorage();
    const hasContent = hasUserContent(conversation) || workspace.selectedEquipmentId !== null;
    if (!hasContent || lastActivity.current === null) {
      clearSession(storage);
      return;
    }
    saveSession(storage, conversation, { selectedEquipmentId: workspace.selectedEquipmentId, activeViewId: workspace.activeViewId }, lastActivity.current);
  }, [loaded, conversation, workspace.selectedEquipmentId, workspace.activeViewId]);

  const send = useCallback(
    (input: UserInput) => {
      // An expired session is cleared, and the new input does not revive it.
      if (enforceExpiry()) return false;
      touch();
      const result = respond(current.current, input, { selectedEquipmentId: selected.current });
      apply(result.state);
      if (result.commands.length > 0) run(result.commands);
      return true;
    },
    [apply, run, enforceExpiry, touch],
  );

  const endSession = useCallback(() => {
    clearEverything();
    setExpired(false);
  }, [clearEverything]);

  const startTopic = useCallback(
    (topicId: string) => {
      if (enforceExpiry()) return false;
      touch();
      // Never discard an ongoing conversation implicitly (RT-QA-001 A2).
      const base = hasUserContent(current.current) ? current.current : createConversation();
      const result = respond(base, { type: "topic", topicId }, { selectedEquipmentId: null });
      apply(result.state);
      if (result.commands.length > 0) run(result.commands);
      return true;
    },
    [apply, run, enforceExpiry, touch],
  );

  const dismissRestored = useCallback(() => setRestored(false), []);
  const dismissExpired = useCallback(() => setExpired(false), []);

  const value = useMemo(
    () => ({
      conversation,
      send,
      endSession,
      startTopic,
      active: hasUserContent(conversation),
      restored,
      dismissRestored,
      expired,
      dismissExpired,
    }),
    [conversation, send, endSession, startTopic, restored, dismissRestored, expired, dismissExpired],
  );
  return <TroubleshooterContext.Provider value={value}>{children}</TroubleshooterContext.Provider>;
}

export function useTroubleshooter(): TroubleshooterContextValue {
  const context = useContext(TroubleshooterContext);
  if (!context) throw new Error("useTroubleshooter must be used inside <TroubleshooterProvider>");
  return context;
}
