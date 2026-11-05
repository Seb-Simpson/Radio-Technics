import { getViewById } from "@/lib/content/views";
import { isKnownEquipmentId } from "@/lib/content/equipment";
import { hotspots } from "@/data/hotspots";
import { troubleshootingTopics } from "@/data/troubleshooting-flows";
import { createConversation, describeStep, MAX_INPUT_LENGTH, respond } from "@/lib/troubleshooter/engine";
import type { ConversationState, UserInput } from "@/lib/troubleshooter/types";

/**
 * Session persistence — event-based (RT-002D).
 *
 * Browser storage is UNTRUSTED: anyone with access to the browser can edit it.
 * So the conversation itself is never stored. Only the presenter's inputs are
 * (what they typed, which buttons they pressed, what they selected), and on
 * restore the conversation is rebuilt by replaying those inputs through the
 * same pure engine. Answers, urgency flags, message IDs and step positions are
 * therefore always the engine's own — stored data can't fabricate them. Each
 * input is validated before replay, and a button press is only accepted if
 * that button was actually on screen at that point of the replay.
 *
 * Limitation: this guarantees the restored state is one the engine could have
 * produced from those inputs. It cannot prove the inputs were typed by the
 * presenter rather than edited into storage; browser storage offers no
 * tamper-proof authenticity. That is acceptable because a forged input can
 * only do what typing or clicking could do anyway.
 *
 * Kept only in sessionStorage (cleared when the tab closes) and only for
 * SESSION_MAX_IDLE_MS after the last USER activity; the stored time is the
 * last activity, never "now".
 */
export const SESSION_KEY = "radio-technics.session";
export const SESSION_VERSION = 4;
/** Bump when the engine's behaviour changes, so old inputs aren't replayed into a different conversation. */
export const ENGINE_VERSION = "rt-002d-r1.1";
export const SESSION_MAX_IDLE_MS = 2 * 60 * 60 * 1000;
/** Larger than any real session; anything bigger is not ours. */
export const MAX_STORED_CHARS = 1_000_000;
export const MAX_EVENTS = 300;

const OPTION_ID = /^(opt|confirm|equip|topic|u|fix)[:-][a-z0-9-]{1,80}$|^(back|restart|correct)$/;
const MAX_INSTANCE = 100_000;

export interface SavedWorkspace {
  selectedEquipmentId: string | null;
  selectedHotspotId?: string | null;
  activeViewId: string | null;
}

/** One presenter input, with the Studio Explorer selection at the time (part of the engine's context). */
export interface SessionEvent {
  input: UserInput;
  selectedEquipmentId: string | null;
}

export interface SavedSession {
  version: typeof SESSION_VERSION;
  engineVersion: string;
  /** When the user last did something (ms since epoch). */
  lastActivityAt: number;
  events: SessionEvent[];
  workspace: SavedWorkspace;
}

export interface RestoredSession {
  lastActivityAt: number;
  events: SessionEvent[];
  /** Rebuilt by replaying `events`; never read from storage. */
  conversation: ConversationState;
  workspace: SavedWorkspace;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** sessionStorage when available and usable (private modes can throw). */
export function getSessionStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const probe = "__rt_probe__";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Validation and replay                                               */
/* ------------------------------------------------------------------ */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOnlyKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((k) => keys.includes(k));

/** Validate one stored input's shape and references. Unknown keys are rejected. */
export function parseEvent(raw: unknown): SessionEvent | null {
  if (!isObject(raw) || !hasOnlyKeys(raw, ["input", "selectedEquipmentId"])) return null;
  const selected = raw.selectedEquipmentId;
  if (selected !== null && !isKnownEquipmentId(selected)) return null;
  const input = raw.input;
  if (!isObject(input)) return null;
  switch (input.type) {
    case "text": {
      if (!hasOnlyKeys(input, ["type", "text"]) || typeof input.text !== "string") return null;
      if (input.text.trim() === "" || input.text.length > MAX_INPUT_LENGTH) return null;
      return { input: { type: "text", text: input.text }, selectedEquipmentId: selected };
    }
    case "option": {
      if (!hasOnlyKeys(input, ["type", "optionId", "instanceId"]) || typeof input.optionId !== "string" || !OPTION_ID.test(input.optionId)) return null;
      const instanceId = input.instanceId;
      if (typeof instanceId !== "number" || !Number.isSafeInteger(instanceId) || instanceId < 0 || instanceId > MAX_INSTANCE) return null;
      return { input: { type: "option", optionId: input.optionId, instanceId }, selectedEquipmentId: selected };
    }
    case "broadcast": {
      if (!hasOnlyKeys(input, ["type", "report"]) || (input.report !== "off-air" && input.report !== "resumed")) return null;
      return { input: { type: "broadcast", report: input.report }, selectedEquipmentId: selected };
    }
    case "handoff": {
      if (!hasOnlyKeys(input, ["type", "text"]) || typeof input.text !== "string") return null;
      if (input.text.trim() === "" || input.text.length > MAX_INPUT_LENGTH) return null;
      return { input: { type: "handoff", text: input.text }, selectedEquipmentId: selected };
    }
    case "equipment": {
      if (!hasOnlyKeys(input, ["type", "equipmentId"]) || !isKnownEquipmentId(input.equipmentId)) return null;
      return { input: { type: "equipment", equipmentId: input.equipmentId }, selectedEquipmentId: selected };
    }
    case "topic": {
      if (!hasOnlyKeys(input, ["type", "topicId"]) || typeof input.topicId !== "string") return null;
      if (!troubleshootingTopics.some((t) => t.id === input.topicId)) return null;
      return { input: { type: "topic", topicId: input.topicId }, selectedEquipmentId: selected };
    }
    default:
      return null;
  }
}

/**
 * Rebuild a conversation from inputs. Returns null if any input could not
 * have happened: a button that wasn't on screen for that exact question
 * instance, or any input the engine refuses. Refused inputs are never saved,
 * so finding one means the data was not written by the app.
 */
export function replayEvents(events: readonly SessionEvent[]): ConversationState | null {
  let state = createConversation();
  for (const event of events) {
    if (event.input.type === "option") {
      const { optionId, instanceId } = event.input;
      const view = describeStep(state);
      if (optionId === "restart" || instanceId !== view.instanceId || !view.options.some((o) => o.id === optionId)) return null;
    }
    const result = respond(state, event.input, { selectedEquipmentId: event.selectedEquipmentId });
    if (result.rejected) return null;
    state = result.state;
  }
  return state;
}

/**
 * Validate restored workspace IDs against real content. Unknown values are
 * dropped (the conversation itself is still usable); a hotspot is kept only
 * if it shows the selected equipment.
 */
export function parseWorkspace(raw: unknown): SavedWorkspace {
  const ws = isObject(raw) ? raw : {};
  const selectedEquipmentId = isKnownEquipmentId(ws.selectedEquipmentId) ? ws.selectedEquipmentId : null;
  const hotspot = typeof ws.selectedHotspotId === "string" ? hotspots.find((h) => h.id === ws.selectedHotspotId) : undefined;
  return {
    selectedEquipmentId,
    selectedHotspotId: hotspot && selectedEquipmentId && hotspot.equipmentId === selectedEquipmentId ? hotspot.id : null,
    activeViewId: typeof ws.activeViewId === "string" && getViewById(ws.activeViewId) ? ws.activeViewId : null,
  };
}

/* ------------------------------------------------------------------ */
/* Load / save / clear                                                 */
/* ------------------------------------------------------------------ */

/** True when more than the idle limit has passed since the last user activity. */
export function isSessionExpired(lastActivityAt: number, now: number): boolean {
  return now - lastActivityAt > SESSION_MAX_IDLE_MS;
}

export function saveSession(storage: StorageLike | null, events: readonly SessionEvent[], workspace: SavedWorkspace, lastActivityAt: number): void {
  if (!storage || !Number.isFinite(lastActivityAt)) return;
  if (events.length > MAX_EVENTS) {
    // Too long to replay reliably: persistence is best-effort, so stop rather than save a partial history.
    clearSession(storage);
    return;
  }
  const data: SavedSession = { version: SESSION_VERSION, engineVersion: ENGINE_VERSION, lastActivityAt, events: [...events], workspace };
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    /* Storage full or unavailable: persistence is best-effort. */
  }
}

export function clearSession(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export type DiscardReason = "expired" | "invalid" | "outdated";

export type LoadResult =
  | { status: "none" }
  | { status: "restored"; session: RestoredSession }
  | { status: "discarded"; reason: DiscardReason };

/** Load, validate and replay a saved session. Anything that can't be safely rebuilt is deleted. */
export function loadSession(storage: StorageLike | null, now = Date.now()): LoadResult {
  if (!storage) return { status: "none" };
  let raw: string | null;
  try {
    raw = storage.getItem(SESSION_KEY);
  } catch {
    return { status: "none" };
  }
  if (raw === null) return { status: "none" };

  const discard = (reason: DiscardReason): LoadResult => {
    clearSession(storage);
    return { status: "discarded", reason };
  };
  if (raw.length > MAX_STORED_CHARS) return discard("invalid");

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return discard("invalid");
  }
  if (!isObject(data)) return discard("invalid");
  if (data.version !== SESSION_VERSION || data.engineVersion !== ENGINE_VERSION) return discard("outdated");
  const last = data.lastActivityAt;
  if (typeof last !== "number" || !Number.isFinite(last) || last > now + 60_000) return discard("invalid");
  if (isSessionExpired(last, now)) return discard("expired");

  if (!Array.isArray(data.events) || data.events.length > MAX_EVENTS) return discard("invalid");
  const events: SessionEvent[] = [];
  for (const item of data.events) {
    const event = parseEvent(item);
    if (!event) return discard("invalid");
    events.push(event);
  }
  const conversation = replayEvents(events);
  if (!conversation) return discard("invalid");

  return { status: "restored", session: { lastActivityAt: last, events, conversation, workspace: parseWorkspace(data.workspace) } };
}
