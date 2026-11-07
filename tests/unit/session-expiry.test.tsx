/**
 * RT-QA-002 P3: idle expiry must be enforced while a tab stays open, using an
 * explicit time source (no real two-hour waits).
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { StudioExplorer } from "@/components/studio/StudioExplorer";
import { Troubleshooter } from "@/components/troubleshooter/Troubleshooter";
import { EXPIRY_CHECK_INTERVAL_MS } from "@/lib/troubleshooter/TroubleshooterProvider";
import { SESSION_KEY, SESSION_MAX_IDLE_MS, isSessionExpired, saveSession } from "@/lib/session/storage";
import { renderWithProviders } from "./render";

const T0 = 1_900_000_000_000;
let now = T0;
const clock = () => now;
const MINUTE = 60_000;

const input = () => screen.getByLabelText("Describe the problem") as HTMLTextAreaElement;
function typeAndSend(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}
const stored = () => {
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};
const log = () => screen.getByRole("log", { name: "Conversation" });

beforeEach(() => {
  now = T0;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("idle expiry in an open tab", () => {
  it("uses a strict two-hour limit", () => {
    expect(isSessionExpired(T0, T0 + SESSION_MAX_IDLE_MS)).toBe(false);
    expect(isSessionExpired(T0, T0 + SESSION_MAX_IDLE_MS + 1)).toBe(true);
  });

  it("a new message after the limit is not processed, does not renew the session, and the old conversation is cleared", async () => {
    renderWithProviders(<Troubleshooter />, { clock });
    typeAndSend("dead air");
    await waitFor(() => expect(stored()?.lastActivityAt).toBe(T0));

    now = T0 + SESSION_MAX_IDLE_MS + 1;
    typeAndSend("is anyone there?");

    expect(within(log()).queryByText("dead air")).not.toBeInTheDocument();
    expect(within(log()).queryByText("is anyone there?")).not.toBeInTheDocument();
    expect(screen.getByTestId("expired-notice")).toBeInTheDocument();
    expect(input().value).toBe("is anyone there?"); // kept so it can be resent
    await waitFor(() => expect(stored()).toBeNull());
    expect(screen.queryByTestId("urgent-banner")).not.toBeInTheDocument();

    // Sending again starts a genuinely new session.
    typeAndSend("is anyone there?");
    expect(within(log()).getByText("is anyone there?")).toBeInTheDocument();
    await waitFor(() => expect(stored()?.lastActivityAt).toBe(now));
  });

  it("expires on its own while the tab is open, without any user action", async () => {
    renderWithProviders(<Troubleshooter />, { clock });
    typeAndSend("The green thing isn't working");
    await waitFor(() => expect(stored()).not.toBeNull());

    now = T0 + SESSION_MAX_IDLE_MS - MINUTE;
    act(() => void vi.advanceTimersByTime(EXPIRY_CHECK_INTERVAL_MS));
    expect(within(log()).getByText("The green thing isn't working")).toBeInTheDocument();

    now = T0 + SESSION_MAX_IDLE_MS + MINUTE;
    act(() => void vi.advanceTimersByTime(EXPIRY_CHECK_INTERVAL_MS));
    expect(within(log()).queryByText("The green thing isn't working")).not.toBeInTheDocument();
    await waitFor(() => expect(stored()).toBeNull());
  });

  it("checks when the user returns to the tab", async () => {
    renderWithProviders(<Troubleshooter />, { clock });
    typeAndSend("The green thing isn't working");
    await waitFor(() => expect(stored()).not.toBeNull());
    now = T0 + 3 * SESSION_MAX_IDLE_MS;
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(screen.getByTestId("expired-notice")).toBeInTheDocument();
  });

  it("background renders and internal updates do not postpone expiry", async () => {
    const view = renderWithProviders(<Troubleshooter />, { clock });
    typeAndSend("The green thing isn't working");
    await waitFor(() => expect(stored()?.lastActivityAt).toBe(T0));

    now = T0 + 90 * MINUTE;
    view.rerender(
      <Providers clock={clock}>
        <Troubleshooter />
      </Providers>,
    ); // a re-render of the same tree
    act(() => void vi.advanceTimersByTime(EXPIRY_CHECK_INTERVAL_MS)); // the expiry check itself
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(stored()?.lastActivityAt).toBe(T0);

    now = T0 + SESSION_MAX_IDLE_MS + 1;
    act(() => void vi.advanceTimersByTime(EXPIRY_CHECK_INTERVAL_MS));
    await waitFor(() => expect(stored()).toBeNull());
  });

  it("user activity within the limit keeps the session alive", async () => {
    renderWithProviders(<Troubleshooter />, { clock });
    typeAndSend("The green thing isn't working");
    now = T0 + 100 * MINUTE;
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's it" }));
    await waitFor(() => expect(stored()?.lastActivityAt).toBe(T0 + 100 * MINUTE));
    now = T0 + 200 * MINUTE; // 200 min since start, 100 since last activity
    act(() => void vi.advanceTimersByTime(EXPIRY_CHECK_INTERVAL_MS));
    expect(within(log()).getByText("The green thing isn't working")).toBeInTheDocument();
  });

  it("selecting equipment in the Studio Explorer counts as activity", async () => {
    renderWithProviders(
      <>
        <Troubleshooter />
        <StudioExplorer />
      </>,
      { clock },
    );
    typeAndSend("The green thing isn't working");
    now = T0 + 100 * MINUTE;
    fireEvent.click(within(screen.getByRole("group", { name: /^Mixing console/ })).getByRole("button", { name: "Main broadcast mixing console" }));
    await waitFor(() => expect(stored()?.lastActivityAt).toBe(T0 + 100 * MINUTE));
  });

  it("restoring a session does not renew it", async () => {
    const events = [{ input: { type: "text" as const, text: "dead air" }, selectedEquipmentId: null }];
    saveSession(window.sessionStorage, events, { selectedEquipmentId: "green-next-button", activeViewId: null }, T0 - (SESSION_MAX_IDLE_MS - MINUTE));
    renderWithProviders(<Troubleshooter />, { clock });
    expect(await within(log()).findByText("dead air")).toBeInTheDocument();
    expect(stored()?.lastActivityAt).toBe(T0 - (SESSION_MAX_IDLE_MS - MINUTE));

    now = T0 + 2 * MINUTE; // now past the limit, though nobody has acted
    act(() => void vi.advanceTimersByTime(EXPIRY_CHECK_INTERVAL_MS));
    expect(within(log()).queryByText("dead air")).not.toBeInTheDocument();
    expect(screen.queryByText("Selected in Studio Explorer:")).not.toBeInTheDocument();
    await waitFor(() => expect(stored()).toBeNull());
  });

  it("an expired saved session is reported on load and never shown", async () => {
    const events = [{ input: { type: "text" as const, text: "dead air" }, selectedEquipmentId: null }];
    saveSession(window.sessionStorage, events, { selectedEquipmentId: null, activeViewId: null }, T0 - SESSION_MAX_IDLE_MS - 1);
    renderWithProviders(<Troubleshooter />, { clock });
    expect(await screen.findByTestId("expired-notice")).toBeInTheDocument();
    expect(within(log()).queryByText("dead air")).not.toBeInTheDocument();
    expect(stored()).toBeNull();
  });
});
