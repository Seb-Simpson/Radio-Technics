import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StudioExplorer } from "@/components/studio/StudioExplorer";
import { Troubleshooter } from "@/components/troubleshooter/Troubleshooter";
import { media, navigation } from "../setup";
import { renderWithProviders } from "./render";

const log = () => screen.getByRole("log", { name: "Conversation" });

describe("Troubleshooter UI", () => {
  it("is clearly labelled as a prototype", () => {
    renderWithProviders(<Troubleshooter />);
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Scripted responses — not a live AI")).toBeInTheDocument();
    expect(screen.getByText("Prototype")).toBeInTheDocument();
  });

  it("asks for clarification when the description is vague", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.type(screen.getByLabelText("Describe the problem"), "It's not doing anything{Enter}");
    expect(within(log()).getByText("It's not doing anything")).toBeInTheDocument();
    expect(within(log()).getByText(/^What isn't responding\?/)).toBeInTheDocument();
    for (const label of ["I'm not sure", "Show me where", "I need technical support"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("shows a clear error for empty input", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type a short description");
  });

  it("advances through a flow using response buttons", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.click(screen.getByRole("button", { name: "I can't hear anything" }));
    expect(within(log()).getByText("Where are you trying to hear the sound?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "In my headphones" }));
    expect(within(log()).getByText("Is anything at all coming through your headphones?")).toBeInTheDocument();
  });

  it("uses the equipment selected in the Studio Explorer (scenario 2)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <StudioExplorer />
        <Troubleshooter />
      </>,
    );
    await user.click(screen.getByRole("tab", { name: "Green button" }));
    await user.click(within(screen.getByRole("group", { name: /^Green button/ })).getByRole("button", { name: "Green Myriad button" }));
    expect(screen.getByText("Selected in Studio Explorer:")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Describe the problem"), "It's not working{Enter}");
    expect(
      within(log()).getByText("Are you referring to the green button that advances Myriad to the next song?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, that's it" }));
    expect(within(log()).getByText("What happened on the Myriad screen after you pressed the green button?")).toBeInTheDocument();
  });

  it("'Show me where' highlights equipment in the embedded studio on wide screens", async () => {
    media.wide = true;
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    const workspace = await screen.findByRole("region", { name: "Studio workspace" });
    await user.type(screen.getByLabelText("Describe the problem"), "the green thing isn't working{Enter}");
    await user.click(screen.getByRole("button", { name: "Show me where" }));
    const hotspot = within(workspace).getByRole("button", { name: /^Green Myriad button/ });
    expect(hotspot).toHaveAttribute("data-highlighted", "true");
    expect(within(workspace).getByRole("heading", { level: 2, name: "Green Myriad button" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("lets the user pick equipment in the embedded studio only when asked to", async () => {
    media.wide = true;
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    const workspace = await screen.findByRole("region", { name: "Studio workspace" });
    await user.type(screen.getByLabelText("Describe the problem"), "It's not doing anything{Enter}");
    await user.click(within(workspace).getByRole("tab", { name: "Video camera" }));
    await user.click(within(workspace).getByRole("button", { name: "Zoom call camera" }));
    await user.click(within(workspace).getByRole("button", { name: "Use in troubleshooter" }));
    expect(within(log()).getByText("What's happening with the Zoom camera?")).toBeInTheDocument();
    // Mid-question, selecting other equipment must not silently restart the flow.
    await user.click(within(workspace).getByRole("tab", { name: "Equipment rack" }));
    await user.click(within(workspace).getAllByRole("button", { name: "Technical equipment rack" })[0]!);
    expect(within(workspace).queryByRole("button", { name: "Use in troubleshooter" })).not.toBeInTheDocument();
  });

  it("'Show me where' opens the Studio Explorer on narrow screens", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/troubleshooter";
    renderWithProviders(<Troubleshooter />);
    await user.type(screen.getByLabelText("Describe the problem"), "the green thing isn't working{Enter}");
    await user.click(screen.getByRole("button", { name: "Show me where" }));
    expect(navigation.push).toHaveBeenCalledWith("/studio");
  });

  it("offers a support summary at the end of a flow", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.click(screen.getByRole("button", { name: "I need technical support" }));
    expect(screen.getByRole("heading", { name: "Summary for technical support" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go back to my last question" })).toBeInTheDocument();
  });

  it("asks for confirmation before clearing, and 'Keep' keeps everything", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    expect(screen.getByRole("button", { name: "End session" })).toBeDisabled();
    await user.type(screen.getByLabelText("Describe the problem"), "the green thing isn't working{Enter}");
    await user.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("alertdialog", { name: "End this session?" });
    expect(within(dialog).getByRole("button", { name: "Keep session" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Keep session" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(log()).getByText("the green thing isn't working")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "End session" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "End session" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "End session" }));
    expect(within(log()).queryByText("the green thing isn't working")).not.toBeInTheDocument();
  });

  it("typing a question about restarting doesn't clear the conversation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    const input = screen.getByLabelText("Describe the problem");
    await user.type(input, "the green thing isn't working{Enter}");
    await user.type(input, "Should I restart the computer?{Enter}");
    expect(within(log()).getByText("the green thing isn't working")).toBeInTheDocument();
    expect(within(log()).getByText(/don't restart, unplug or reset equipment/)).toBeInTheDocument();
  });

  it("the end-of-conversation restart also needs confirmation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.type(screen.getByLabelText("Describe the problem"), "dead air{Enter}");
    await user.click(screen.getByRole("button", { name: "Start a new problem" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(within(log()).getByText("dead air")).toBeInTheDocument();
  });

  it("keeps an urgent banner visible after moving on to support", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    const input = screen.getByLabelText("Describe the problem");
    await user.type(input, "Can someone help me? We're off air.{Enter}");
    expect(screen.getByTestId("urgent-banner")).toHaveTextContent("Urgent: a broadcast interruption has been reported.");
    await user.type(input, "I need a human{Enter}");
    expect(screen.getByTestId("urgent-banner")).toBeInTheDocument();
  });

  it("shows possible (unconfirmed) silence differently from confirmed silence", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Troubleshooter />);
    await user.type(screen.getByLabelText("Describe the problem"), "Can someone help? It's gone silent{Enter}");
    expect(screen.getByTestId("possible-silence-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("urgent-banner")).not.toBeInTheDocument();
  });

  describe("pointing to the manual at an outcome (information only)", () => {
    async function reachGreenButtonOutcome(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText("Describe the problem"), "the green thing isn't working{Enter}");
      await user.click(screen.getByRole("button", { name: "Yes, that's it" }));
      await user.click(screen.getByRole("button", { name: "Nothing changed" }));
      await user.click(screen.getByRole("button", { name: "Yes, it's still playing" }));
    }

    it("links to what the manual says, after the technical-support message", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Troubleshooter />);
      await reachGreenButtonOutcome(user);
      expect(within(log()).getByText(/Please contact technical support/)).toBeInTheDocument();
      const section = screen.getByRole("region", { name: "What the manual says" });
      const link = within(section).getByRole("link", { name: /Understanding the next item in the log/ });
      expect(link).toHaveAttribute("href", "/knowledge/kb-myriad-next-item");
      expect(section).toHaveTextContent("From the Myriad 6 manual");
      // Not an answer path: nothing was added to the conversation by showing it.
      expect(within(section).queryByRole("button")).not.toBeInTheDocument();
      // The support message comes before the links in reading order.
      const support = within(log()).getByText(/Please contact technical support/);
      expect(support.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("does not show manual links while a question is still being asked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Troubleshooter />);
      await user.type(screen.getByLabelText("Describe the problem"), "the green thing isn't working{Enter}");
      await user.click(screen.getByRole("button", { name: "Yes, that's it" }));
      expect(screen.queryByRole("region", { name: /What the (manual|maker's documentation) says/ })).not.toBeInTheDocument();
    });

    it("never shows manual links on the urgent outcome or while an incident is open", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Troubleshooter />);
      await user.type(screen.getByLabelText("Describe the problem"), "the green thing isn't working{Enter}");
      await user.click(screen.getByRole("button", { name: "Yes, that's it" }));
      await user.click(screen.getByRole("button", { name: "Nothing changed" }));
      await user.click(screen.getByRole("button", { name: "No — there's silence" }));
      expect(screen.getByTestId("urgent-banner")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /What the (manual|maker's documentation) says/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Understanding the next item/ })).not.toBeInTheDocument();
    });

    const noManualRegion = () => expect(screen.queryByRole("region", { name: /What the (manual|maker's documentation) says/ })).not.toBeInTheDocument();

    it("shows no manual links when a possible incident was raised mid-flow and a non-urgent outcome is reached", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Troubleshooter />);
      await user.type(screen.getByLabelText("Describe the problem"), "the green thing isn't working{Enter}");
      await user.click(screen.getByRole("button", { name: "Yes, that's it" }));
      await user.click(screen.getByRole("button", { name: "Nothing changed" }));
      await user.click(screen.getByRole("button", { name: "We're off air / urgent broadcast problem" }));
      expect(screen.getByTestId("urgent-banner")).toBeInTheDocument();
      // Correct the earlier answer so the flow reaches a NON-urgent outcome while the incident is still open.
      await user.click(screen.getByRole("button", { name: "Change an earlier answer" }));
      await user.click(screen.getByRole("button", { name: /^“What happened on the Myriad screen/ }));
      await user.click(screen.getByRole("button", { name: "Something unexpected happened" }));
      await user.click(screen.getByRole("button", { name: "Something else" }));
      expect(within(log()).getByText(/Please contact technical support/)).toBeInTheDocument();
      expect(screen.getByTestId("urgent-banner")).toBeInTheDocument();
      noManualRegion();
    });

    it("shows no manual links after 'Broadcasting has resumed'", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Troubleshooter />);
      await reachGreenButtonOutcome(user);
      expect(screen.getByRole("region", { name: "What the manual says" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "We're off air / urgent broadcast problem" }));
      noManualRegion();
      await user.click(screen.getByRole("button", { name: "Broadcasting has resumed" }));
      expect(screen.getByTestId("urgent-banner")).toHaveTextContent("reported earlier");
      noManualRegion();
    });
  });
});
