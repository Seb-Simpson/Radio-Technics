import { getFlowNode, MAX_INPUT_LENGTH } from "@/lib/troubleshooter/engine";
import type { AnsweredQuestion, ChatMessage, ChooseReason, ConversationState, Observation, Step } from "@/lib/troubleshooter/types";
import { isKnownEquipmentId } from "@/lib/content/equipment";
import { getViewById } from "@/lib/content/views";
import { hotspots } from "@/data/hotspots";

/**
 * Session persistence (RT-002 G).
 *
 * Radio Technics may run on shared studio computers, so a conversation is
 * kept only:
 *   - in sessionStorage (cleared when the browser tab closes), and
 *   - for SESSION_MAX_IDLE_MS since the last USER activity. The time saved is
 *     the last activity time supplied by the caller, never "now", so saves
 *     caused by background renders cannot extend a session.
 * Restored data is fully validated; anything malformed, from another
 * version, or referring to unknown content is discarded rather than used.
 */
export const SESSION_KEY = "radio-technics.session";
export const SESSION_VERSION = 3;
export const SESSION_MAX_IDLE_MS = 2 * 60 * 60 * 1000;

const MAX_MESSAGES = 400;
const MAX_TEXT = 2000;
/** Larger than any real session; anything bigger is not ours (RT-QA-002B). */
export const MAX_STORED_CHARS = 1_000_000;
const MAX_SEQ = 1_000_000;
const MESSAGE_ID = /^m(\d{1,7})$/;

export interface SavedWorkspace {
  selectedEquipmentId: string | null;
  selectedHotspotId?: string | null;
  activeViewId: string | null;
}

export interface SavedSession {
  version: typeof SESSION_VERSION;
  /** When the user last did something (ms since epoch). */
  lastActivityAt: number;
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
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === "string" && v.length <= max;
const CHOOSE_REASONS: readonly ChooseReason[] = ["ambiguous", "vague", "unknown", "other"];

function parseStep(raw: unknown, depth = 0): Step | null {
  if (!isObject(raw)) return null;
  switch (raw.kind) {
    case "start":
      return { kind: "start" };
    case "node":
      return typeof raw.nodeId === "string" && getFlowNode(raw.nodeId) ? { kind: "node", nodeId: raw.nodeId } : null;
    case "confirm":
      return isKnownEquipmentId(raw.equipmentId) ? { kind: "confirm", equipmentId: raw.equipmentId } : null;
    case "choose": {
      const ids = raw.equipmentIds;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isKnownEquipmentId)) return null;
      if (!CHOOSE_REASONS.includes(raw.reason as ChooseReason)) return null;
      return { kind: "choose", equipmentIds: [...ids], reason: raw.reason as ChooseReason };
    }
    case "support": {
      if (depth > 0) return null;
      const returnTo = parseStep(raw.returnTo, depth + 1);
      return returnTo && returnTo.kind !== "support" ? { kind: "support", returnTo } : null;
    }
    default:
      return null;
  }
}

function parseMessage(raw: unknown): ChatMessage | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !isText(raw.text)) return null;
  if (raw.role !== "assistant" && raw.role !== "user" && raw.role !== "notice") return null;
  if (raw.help !== undefined && !isText(raw.help)) return null;
  if (raw.urgent !== undefined && typeof raw.urgent !== "boolean") return null;
  return { id: raw.id, role: raw.role, text: raw.text, help: raw.help as string | undefined, urgent: raw.urgent as boolean | undefined };
}

function parseAnswer(raw: unknown): AnsweredQuestion | null {
  if (!isObject(raw) || !isText(raw.question) || !isText(raw.answer)) return null;
  if (raw.source !== "button" && raw.source !== "typed") return null;
  if (raw.certainty !== "confirmed" && raw.certainty !== "uncertain") return null;
  if (raw.typedText !== undefined && !isText(raw.typedText, MAX_INPUT_LENGTH)) return null;
  // Typed text belongs only to typed answers.
  if (raw.typedText !== undefined && raw.source !== "typed") return null;
  return { question: raw.question, answer: raw.answer, source: raw.source, certainty: raw.certainty, typedText: raw.typedText as string | undefined };
}

function parseObservation(raw: unknown): Observation | null {
  if (!isObject(raw) || !isText(raw.text, MAX_INPUT_LENGTH)) return null;
  if (raw.inReplyTo !== null && !isText(raw.inReplyTo)) return null;
  return { text: raw.text, inReplyTo: raw.inReplyTo as string | null };
}

function parseList<T>(raw: unknown, parse: (item: unknown) => T | null, max: number): T[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: T[] = [];
  for (const item of raw) {
    const parsed = parse(item);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
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

/** Validate an untrusted conversation. Returns null if anything is wrong. */
export function parseConversation(raw: unknown): ConversationState | null {
  if (!isObject(raw)) return null;
  const step = parseStep(raw.step);
  const messages = parseList(raw.messages, parseMessage, MAX_MESSAGES);
  const answers = parseList(raw.answers, parseAnswer, MAX_MESSAGES);
  const observations = parseList(raw.observations, parseObservation, MAX_MESSAGES);
  if (!step || !messages || messages.length === 0 || !answers || !observations) return null;
  if (raw.equipmentId !== null && !isKnownEquipmentId(raw.equipmentId)) return null;
  if (typeof raw.urgent !== "boolean" || typeof raw.possibleSilence !== "boolean") return null;
  // Added in RT-002C; older sessions don't have it and are treated as unconfirmed.
  const confirmedOffAir = raw.confirmedOffAir === undefined ? false : raw.confirmedOffAir;
  if (typeof confirmedOffAir !== "boolean" || (confirmedOffAir && !raw.urgent)) return null;
  if (typeof raw.seq !== "number" || !Number.isSafeInteger(raw.seq) || raw.seq < messages.length || raw.seq > MAX_SEQ) return null;
  if (new Set(messages.map((m) => m.id)).size !== messages.length) return null;
  // IDs must look like the engine's own, and never run ahead of the counter (or new messages would collide).
  if (!messages.every((m) => { const n = MESSAGE_ID.exec(m.id); return n !== null && Number(n[1]) <= (raw.seq as number); })) return null;
  return {
    step,
    equipmentId: raw.equipmentId as string | null,
    messages,
    answers,
    observations,
    urgent: raw.urgent,
    possibleSilence: raw.possibleSilence,
    confirmedOffAir,
    seq: raw.seq,
  };
}

/* ------------------------------------------------------------------ */
/* Load / save / clear                                                 */
/* ------------------------------------------------------------------ */

/** True when more than the idle limit has passed since the last user activity. */
export function isSessionExpired(lastActivityAt: number, now: number): boolean {
  return now - lastActivityAt > SESSION_MAX_IDLE_MS;
}

export function saveSession(storage: StorageLike | null, conversation: ConversationState, workspace: SavedWorkspace, lastActivityAt: number): void {
  if (!storage || !Number.isFinite(lastActivityAt)) return;
  const data: SavedSession = { version: SESSION_VERSION, lastActivityAt, conversation, workspace };
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

export type LoadResult =
  | { status: "none" }
  | { status: "restored"; session: SavedSession }
  | { status: "discarded"; reason: "expired" | "invalid" | "outdated" };

/** Load and validate a saved session. Invalid or expired data is deleted. */
export function loadSession(storage: StorageLike | null, now = Date.now()): LoadResult {
  if (!storage) return { status: "none" };
  let raw: string | null;
  try {
    raw = storage.getItem(SESSION_KEY);
  } catch {
    return { status: "none" };
  }
  if (raw === null) return { status: "none" };
  if (raw.length > MAX_STORED_CHARS) {
    clearSession(storage);
    return { status: "discarded", reason: "invalid" };
  }

  const discard = (reason: "expired" | "invalid" | "outdated"): LoadResult => {
    clearSession(storage);
    return { status: "discarded", reason };
  };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return discard("invalid");
  }
  if (!isObject(data)) return discard("invalid");
  if (data.version !== SESSION_VERSION) return discard("outdated");
  const last = data.lastActivityAt;
  if (typeof last !== "number" || !Number.isFinite(last) || last > now + 60_000) return discard("invalid");
  if (isSessionExpired(last, now)) return discard("expired");

  const conversation = parseConversation(data.conversation);
  if (!conversation) return discard("invalid");
  const workspace = parseWorkspace(data.workspace);
  return { status: "restored", session: { version: SESSION_VERSION, lastActivityAt: last, conversation, workspace } };
}
