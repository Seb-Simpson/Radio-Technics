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
    expect(screen.getByText("Scripted responses — not a live AI")).toBeInTheDocument();
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
});
