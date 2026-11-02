import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Troubleshooter } from "@/components/troubleshooter/Troubleshooter";
import { createConversation, respond } from "@/lib/troubleshooter/engine";
import {
  SESSION_KEY,
  SESSION_MAX_IDLE_MS,
  SESSION_VERSION,
  loadSession,
  parseConversation,
  saveSession,
} from "@/lib/session/storage";
import { renderWithProviders } from "./render";

const ctx = { selectedEquipmentId: null };
function sampleConversation() {
  let s = createConversation();
  s = respond(s, { type: "text", text: "The green thing isn't working" }, ctx).state;
  s = respond(s, { type: "option", optionId: "confirm:yes" }, ctx).state;
  return s;
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

describe("session storage", () => {
  it("round-trips a conversation and workspace", () => {
    const storage = memoryStorage();
    const conversation = sampleConversation();
    saveSession(storage, conversation, { selectedEquipmentId: "green-next-button", activeViewId: "green-button" }, NOW);
    const result = loadSession(storage, NOW + 1000);
    expect(result.status).toBe("restored");
    if (result.status !== "restored") return;
    expect(result.session.conversation).toEqual(conversation);
    expect(result.session.workspace).toEqual({ selectedEquipmentId: "green-next-button", activeViewId: "green-button" });
  });

  it("expires after the idle limit and deletes the data", () => {
    const storage = memoryStorage();
    saveSession(storage, sampleConversation(), { selectedEquipmentId: null, activeViewId: null }, NOW);
    expect(loadSession(storage, NOW + SESSION_MAX_IDLE_MS + 1)).toEqual({ status: "discarded", reason: "expired" });
    expect(storage.map.has(SESSION_KEY)).toBe(false);
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["a non-object", "42"],
    ["an older version", JSON.stringify({ version: SESSION_VERSION - 1, savedAt: NOW, conversation: {} })],
    ["a future timestamp", JSON.stringify({ version: SESSION_VERSION, savedAt: NOW + 10 * 60_000, conversation: sampleConversation(), workspace: {} })],
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
    expect(() => saveSession(throwing, sampleConversation(), { selectedEquipmentId: null, activeViewId: null })).not.toThrow();
  });

  describe("rejects tampered or outdated conversations", () => {
    const valid = () => JSON.parse(JSON.stringify(sampleConversation()));
    it.each([
      ["unknown flow node", (c: any) => ((c.step = { kind: "node", nodeId: "skip-to-fix" }), c)],
      ["unknown equipment in step", (c: any) => ((c.step = { kind: "confirm", equipmentId: "toaster" }), c)],
      ["unknown equipment context", (c: any) => ((c.equipmentId = "toaster"), c)],
      ["nested support steps", (c: any) => ((c.step = { kind: "support", returnTo: { kind: "support", returnTo: { kind: "start" } } }), c)],
      ["non-boolean urgent flag", (c: any) => ((c.urgent = "no"), c)],
      ["bad message role", (c: any) => ((c.messages[0].role = "system"), c)],
      ["oversized observation", (c: any) => ((c.observations[0].text = "x".repeat(10_000)), c)],
      ["answer with an invented source", (c: any) => ((c.answers[0].source = "ai"), c)],
      ["too many messages", (c: any) => ((c.messages = Array.from({ length: 401 }, (_, i) => ({ id: `m${i}`, role: "user", text: "x" }))), c)],
      ["duplicate message IDs", (c: any) => ((c.messages[1].id = c.messages[0].id), c)],
      ["sequence behind messages", (c: any) => ((c.seq = 0), c)],
      ["missing fields", (c: any) => (delete c.observations, c)],
    ])("%s", (_label, tamper) => {
      expect(parseConversation(tamper(valid()))).toBeNull();
    });

    it("accepts the untouched conversation", () => {
      expect(parseConversation(valid())).not.toBeNull();
    });
  });
});

describe("session restore in the app", () => {
  it("restores a conversation after a reload and says so", async () => {
    const conversation = sampleConversation();
    saveSession(window.sessionStorage, conversation, { selectedEquipmentId: "green-next-button", activeViewId: null });
    renderWithProviders(<Troubleshooter />);
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(await within(log).findByText("The green thing isn't working")).toBeInTheDocument();
    expect(screen.getByText(/has been restored/)).toBeInTheDocument();
    expect(screen.getByText("Selected in Studio Explorer:")).toBeInTheDocument();
  });

  it("does not restore invalid data and does not crash", async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ version: SESSION_VERSION, savedAt: Date.now(), conversation: { step: { kind: "node", nodeId: "nope" } } }));
    renderWithProviders(<Troubleshooter />);
    await waitFor(() => expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull());
    expect(screen.queryByText(/has been restored/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End session" })).toBeDisabled();
  });

  it("saves as you go, and 'End session' clears storage and selection", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.type(screen.getByLabelText("Describe the problem"), "dead air{Enter}");
    await waitFor(() => expect(window.sessionStorage.getItem(SESSION_KEY)).toContain("dead air"));
    const saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY)!);
    expect(saved.conversation.urgent).toBe(true);

    await user.click(screen.getByRole("button", { name: "End session" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "End session" }));
    await waitFor(() => expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull());
    expect(within(screen.getByRole("log")).queryByText("dead air")).not.toBeInTheDocument();
  });
});
