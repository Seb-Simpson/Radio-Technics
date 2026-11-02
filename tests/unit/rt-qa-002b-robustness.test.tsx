/**
 * RT-QA-002B Priority 3 regressions (RT-002C): human-support recognition,
 * deliberate re-selection renewing activity, and defensive validation of
 * restored session data. Reproductions written by the development team (the
 * audit report itself was not available).
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioExplorer } from "@/components/studio/StudioExplorer";
import { Troubleshooter } from "@/components/troubleshooter/Troubleshooter";
import { hotspots } from "@/data/hotspots";
import { loadSession, MAX_STORED_CHARS, parseConversation, parseWorkspace, SESSION_KEY, SESSION_VERSION, saveSession } from "@/lib/session/storage";
import { createConversation, respond } from "@/lib/troubleshooter/engine";
import { understand } from "@/lib/troubleshooter/understand";
import { renderWithProviders } from "./render";

describe("11a. asking for a person is recognised", () => {
  it.each([
    // Missed at the baseline (2ae5b26):
    "put me through to support",
    "who do I call?",
    "who should I contact",
    "I need assistance",
    "is anyone available?",
    "transfer me to support",
    "escalate this",
    "I need IT",
    "contact IT",
    "what's the number for tech support?",
    "send someone",
    "page the engineer",
    "need an engineer now",
    "find me someone who knows",
    "this needs an engineer",
    "tell the engineer",
    "let someone know",
    "where do I get help?",
    // Already recognised; kept as guards:
    "I need to speak to someone",
    "can I talk to an engineer",
    "get me a technician",
    "how do I contact support?",
  ])("%j", (text) => {
    expect(understand(text).helpRequest).toBe(true);
    const s = respond(createConversation(), { type: "text", text }, { selectedEquipmentId: null }).state;
    expect(s.step.kind).toBe("support");
  });

  it.each([
    "the engineer fixed the desk",
    "support is fine",
    "someone unplugged it",
    "an engineer said to press it",
    "I spoke to the engineer earlier",
    "I don't need support",
    "no need to call anyone",
    "can you help me figure it out",
    "the support arm is loose",
    "help me understand the meters",
    "the engineer is on holiday so don't call them",
    "I need it to work before the news",
    "the problem escalated quickly",
  ])("is not a request: %j", (text) => {
    expect(understand(text).helpRequest).toBe(false);
  });
});

describe("11b. choosing the same equipment again renews activity", () => {
  const T0 = 1_900_000_000_000;
  const MINUTE = 60_000;
  let now = T0;
  const clock = () => now;
  const stored = () => JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null");
  beforeEach(() => {
    now = T0;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });
  afterEach(() => vi.useRealTimers());

  it("re-selecting the already-selected hotspot updates the activity time (baseline: unchanged)", async () => {
    renderWithProviders(
      <>
        <Troubleshooter />
        <StudioExplorer />
      </>,
      { clock },
    );
    const desk = () => within(screen.getByRole("group", { name: /^Mixing console/ })).getByRole("button", { name: "Main broadcast mixing console" });
    fireEvent.click(desk());
    await waitFor(() => expect(stored()?.lastActivityAt).toBe(T0));
    now = T0 + 100 * MINUTE;
    fireEvent.click(desk());
    await waitFor(() => expect(stored()?.lastActivityAt).toBe(T0 + 100 * MINUTE));
  });
});

describe("12. restored data is validated defensively", () => {
  const T0 = 1_900_000_000_000;
  const base = () => respond(createConversation(), { type: "text", text: "dead air" }, { selectedEquipmentId: null }).state;
  const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    };
  };

  it("accepts a real conversation", () => {
    expect(parseConversation(json(base()))).not.toBeNull();
  });

  it("reads a session saved before RT-002C (no confirmedOffAir) as unconfirmed", () => {
    const old = json(base());
    delete old.confirmedOffAir;
    expect(parseConversation(old)?.confirmedOffAir).toBe(false);
  });

  it.each<[string, (c: Record<string, unknown>) => void]>([
    ["confirmedOffAir is not a boolean", (c) => (c.confirmedOffAir = "yes")],
    ["confirmedOffAir without urgency", (c) => ((c.confirmedOffAir = true), (c.urgent = false))],
    ["seq is not a safe integer", (c) => (c.seq = 1e20)],
    ["seq is fractional", (c) => (c.seq = 4.5)],
    ["seq is absurdly large", (c) => (c.seq = 50_000_000)],
    ["a message ID is not the engine's format", (c) => ((c.messages as { id: string }[])[0]!.id = "x1")],
    ["a message ID runs ahead of seq (new messages would collide)", (c) => ((c.messages as { id: string }[])[0]!.id = `m${(c.seq as number) + 5}`)],
    ["typed text on a button answer", (c) => (c.answers = [{ question: "Q", answer: "A", source: "button", certainty: "confirmed", typedText: "x" }])],
    ["a message with an unknown role", (c) => ((c.messages as { role: string }[])[0]!.role = "system")],
    ["too many messages", (c) => (c.messages = Array.from({ length: 401 }, (_, i) => ({ id: `m${i + 1}`, role: "user", text: "x" })))],
  ])("rejects a conversation where %s", (_label, mutate) => {
    const c = json(base());
    mutate(c);
    expect(parseConversation(c)).toBeNull();
  });

  it("drops workspace IDs that don't exist or don't belong together", () => {
    const rack = hotspots.find((h) => h.equipmentId === "equipment-rack")!;
    const other = hotspots.find((h) => h.equipmentId !== "equipment-rack")!;
    expect(parseWorkspace({ selectedEquipmentId: "not-real", selectedHotspotId: rack.id, activeViewId: "nope" })).toEqual({
      selectedEquipmentId: null,
      selectedHotspotId: null,
      activeViewId: null,
    });
    expect(parseWorkspace({ selectedEquipmentId: "equipment-rack", selectedHotspotId: other.id, activeViewId: rack.viewId })).toEqual({
      selectedEquipmentId: "equipment-rack",
      selectedHotspotId: null,
      activeViewId: rack.viewId,
    });
    expect(parseWorkspace({ selectedEquipmentId: "equipment-rack", selectedHotspotId: rack.id, activeViewId: rack.viewId }).selectedHotspotId).toBe(rack.id);
    expect(parseWorkspace("garbage")).toEqual({ selectedEquipmentId: null, selectedHotspotId: null, activeViewId: null });
  });

  it("discards an oversized stored value without parsing it", () => {
    const store = memory();
    store.setItem(SESSION_KEY, "x".repeat(MAX_STORED_CHARS + 1));
    const parse = vi.spyOn(JSON, "parse");
    expect(loadSession(store, T0)).toEqual({ status: "discarded", reason: "invalid" });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    expect(store.getItem(SESSION_KEY)).toBeNull();
  });

  it("a __proto__ key in stored data cannot pollute objects", () => {
    const store = memory();
    saveSession(store, base(), { selectedEquipmentId: null, activeViewId: null }, T0);
    const raw = store.getItem(SESSION_KEY)!.replace('"workspace":{', '"workspace":{"__proto__":{"polluted":true},');
    store.setItem(SESSION_KEY, raw);
    const result = loadSession(store, T0);
    expect(result.status).toBe("restored");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.status === "restored") expect(Object.getPrototypeOf(result.session.workspace)).toBe(Object.prototype);
  });

  it.each([
    ["not JSON", "{"],
    ["an array", "[]"],
    ["another version", JSON.stringify({ version: SESSION_VERSION + 1 })],
    ["a future activity time", JSON.stringify({ version: SESSION_VERSION, lastActivityAt: T0 + 3_600_000, conversation: {}, workspace: {} })],
    ["a non-numeric activity time", JSON.stringify({ version: SESSION_VERSION, lastActivityAt: "now", conversation: {}, workspace: {} })],
  ])("discards %s, and deletes it", (_label, raw) => {
    const store = memory();
    store.setItem(SESSION_KEY, raw);
    expect(loadSession(store, T0).status).toBe("discarded");
    expect(store.getItem(SESSION_KEY)).toBeNull();
  });

  it("a storage that throws is treated as empty", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSession(throwing, T0)).toEqual({ status: "none" });
    expect(() => saveSession(throwing, base(), { selectedEquipmentId: null, activeViewId: null }, T0)).not.toThrow();
  });
});
