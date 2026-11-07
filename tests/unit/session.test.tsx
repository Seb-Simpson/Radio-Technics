import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Troubleshooter } from "@/components/troubleshooter/Troubleshooter";
import {
  ENGINE_VERSION,
  MAX_EVENTS,
  SESSION_KEY,
  SESSION_MAX_IDLE_MS,
  SESSION_VERSION,
  loadSession,
  replayEvents,
  saveSession,
  type SessionEvent,
} from "@/lib/session/storage";
import { renderWithProviders } from "./render";

/** RT-002D: sessions store the presenter's inputs; the conversation is rebuilt by replay. */
function sampleEvents(): SessionEvent[] {
  return [
    { input: { type: "text", text: "The green thing isn't working" }, selectedEquipmentId: null },
    { input: { type: "option", optionId: "confirm:yes", instanceId: 1 }, selectedEquipmentId: null },
  ];
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

const NOW = 1_800_000_000_000;
const stored = (events: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: SESSION_VERSION, engineVersion: ENGINE_VERSION, lastActivityAt: NOW, events, workspace: {}, ...extra });

describe("session storage", () => {
  it("round-trips inputs and workspace; the conversation is the engine's own replay", () => {
    const storage = memoryStorage();
    saveSession(storage, sampleEvents(), { selectedEquipmentId: "green-next-button", selectedHotspotId: "green-button-button", activeViewId: "green-button" }, NOW);
    const result = loadSession(storage, NOW + 1000);
    expect(result.status).toBe("restored");
    if (result.status !== "restored") return;
    expect(result.session.conversation).toEqual(replayEvents(sampleEvents()));
    expect(result.session.conversation.step).toEqual({ kind: "node", nodeId: "gb-screen" });
    expect(result.session.workspace).toEqual({ selectedEquipmentId: "green-next-button", selectedHotspotId: "green-button-button", activeViewId: "green-button" });
    // The conversation itself is never written to storage.
    expect(JSON.parse(storage.map.get(SESSION_KEY)!)).not.toHaveProperty("conversation");
  });

  it("expires after the idle limit and deletes the data", () => {
    const storage = memoryStorage();
    saveSession(storage, sampleEvents(), { selectedEquipmentId: null, activeViewId: null }, NOW);
    expect(loadSession(storage, NOW + SESSION_MAX_IDLE_MS + 1)).toEqual({ status: "discarded", reason: "expired" });
    expect(storage.map.has(SESSION_KEY)).toBe(false);
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["a non-object", "42"],
    ["an older version", JSON.stringify({ version: SESSION_VERSION - 1, lastActivityAt: NOW, conversation: {} })],
    ["another engine version", stored(sampleEvents(), { engineVersion: "rt-001" })],
    ["a future timestamp", stored(sampleEvents(), { lastActivityAt: NOW + 10 * 60_000 })],
  ])("discards %s safely", (_label, raw) => {
    const storage = memoryStorage();
    storage.setItem(SESSION_KEY, raw);
    const result = loadSession(storage, NOW);
    expect(result.status).toBe("discarded");
    expect(storage.map.has(SESSION_KEY)).toBe(false);
  });

  it("returns nothing when storage is unavailable or throws", () => {
    expect(loadSession(null, NOW)).toEqual({ status: "none" });
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    expect(loadSession(throwing, NOW)).toEqual({ status: "none" });
    expect(() => saveSession(throwing, sampleEvents(), { selectedEquipmentId: null, activeViewId: null }, NOW)).not.toThrow();
  });

  describe("rejects tampered inputs", () => {
    const text = (t: string) => ({ input: { type: "text", text: t }, selectedEquipmentId: null });
    const option = (id: string, instanceId = 1) => ({ input: { type: "option", optionId: id, instanceId }, selectedEquipmentId: null });
    it.each<[string, unknown]>([
      ["a button that was never on screen (skipping to an urgent answer)", [text("The green thing isn't working"), option("opt:no-silent")]],
      ["a button for a later question", [option("confirm:yes")]],
      ["an option ID that isn't an option ID", [text("hi"), option("<script>")]],
      ["the restart button (only End session clears)", [text("hi"), option("restart")]],
      ["unknown equipment", [{ input: { type: "equipment", equipmentId: "toaster" }, selectedEquipmentId: null }]],
      ["unknown selection context", [{ input: { type: "text", text: "hi" }, selectedEquipmentId: "toaster" }]],
      ["an unknown topic", [{ input: { type: "topic", topicId: "topic-fix-everything" }, selectedEquipmentId: null }]],
      ["an unknown input type", [{ input: { type: "answer", answer: "Yes, they move" }, selectedEquipmentId: null }]],
      ["extra fields smuggled into an input", [{ input: { type: "text", text: "hi", urgent: true }, selectedEquipmentId: null }]],
      ["extra fields on an event", [{ ...text("hi"), answers: [{ answer: "Yes" }] }]],
      ["empty text", [text("   ")]],
      ["oversized text", [text("x".repeat(501))]],
      ["events that aren't a list", { 0: text("hi") }],
      ["too many events", Array.from({ length: MAX_EVENTS + 1 }, () => text("hi"))],
    ])("%s", (_label, events) => {
      const storage = memoryStorage();
      storage.setItem(SESSION_KEY, stored(events));
      expect(loadSession(storage, NOW)).toEqual({ status: "discarded", reason: "invalid" });
      expect(storage.map.has(SESSION_KEY)).toBe(false);
    });

    it("ignores stored state: urgency and answers are only ever the engine's own", () => {
      const storage = memoryStorage();
      storage.setItem(
        SESSION_KEY,
        stored(sampleEvents(), {
          conversation: { urgent: true, confirmedOffAir: true, answers: [{ question: "Q", answer: "No — there's silence", source: "button" }] },
          urgent: true,
        }),
      );
      const result = loadSession(storage, NOW);
      expect(result.status).toBe("restored");
      if (result.status !== "restored") return;
      expect(result.session.conversation.urgent).toBe(false);
      expect(result.session.conversation.confirmedOffAir).toBe(false);
      expect(result.session.conversation.answers.map((a) => a.answer)).toEqual(["Yes, that's it"]);
    });

    it("accepts the untouched inputs", () => {
      const storage = memoryStorage();
      storage.setItem(SESSION_KEY, stored(sampleEvents()));
      expect(loadSession(storage, NOW).status).toBe("restored");
    });
  });
});

describe("session restore in the app", () => {
  it("restores a conversation after a reload and says so", async () => {
    saveSession(window.sessionStorage, sampleEvents(), { selectedEquipmentId: "green-next-button", activeViewId: null }, Date.now());
    renderWithProviders(<Troubleshooter />);
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(await within(log).findByText("The green thing isn't working")).toBeInTheDocument();
    expect(screen.getByText(/has been restored/)).toBeInTheDocument();
    expect(screen.getByText("Selected in Studio Explorer:")).toBeInTheDocument();
  });

  it("does not restore invalid data, does not crash, and says it was cleared", async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ version: SESSION_VERSION, engineVersion: ENGINE_VERSION, lastActivityAt: Date.now(), events: [{ input: { type: "option", optionId: "opt:no-silent", instanceId: 0 }, selectedEquipmentId: null }] }));
    renderWithProviders(<Troubleshooter />);
    await waitFor(() => expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull());
    expect(screen.queryByText(/has been restored/)).not.toBeInTheDocument();
    expect(screen.getByTestId("restore-failed-notice")).toHaveTextContent(/couldn.t be restored safely/);
    expect(screen.getByRole("button", { name: "End session" })).toBeDisabled();
  });

  it("saves as you go, and 'End session' clears storage and selection", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.type(screen.getByLabelText("Describe the problem"), "dead air{Enter}");
    await waitFor(() => expect(window.sessionStorage.getItem(SESSION_KEY)).toContain("dead air"));
    const saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY)!);
    expect(saved.events).toEqual([{ input: { type: "text", text: "dead air" }, selectedEquipmentId: null }]);
    expect(saved).not.toHaveProperty("conversation");
    // Urgency comes back from replaying the presenter's words.
    expect(replayEvents(saved.events)?.urgent).toBe(true);

    await user.click(screen.getByRole("button", { name: "End session" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "End session" }));
    await waitFor(() => expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull());
    expect(within(screen.getByRole("log")).queryByText("dead air")).not.toBeInTheDocument();
  });
});
