import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { KnowledgeCentre } from "@/components/knowledge/KnowledgeCentre";
import { articles } from "@/data/articles";
import { getArticlesForEquipment, searchArticles } from "@/lib/knowledge/search";
import { renderWithProviders } from "./render";
import { navigation } from "../setup";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";

describe("knowledge search", () => {
  it("ranks the most relevant article first", () => {
    expect(searchArticles({ query: "microphone" })[0]?.id).toBe("ts-microphone-not-heard");
    expect(searchArticles({ query: "green button" })[0]?.id).toBe("guide-green-button");
  });

  it("requires every term to match", () => {
    expect(searchArticles({ query: "microphone zebra" })).toEqual([]);
  });

  it("filters by type, status and equipment", () => {
    expect(searchArticles({ type: "help-topic" }).every((a) => a.type === "help-topic")).toBe(true);
    expect(searchArticles({ status: "verified" })).toEqual([]);
    expect(getArticlesForEquipment("green-next-button").map((a) => a.id)).toContain("guide-green-button");
  });

  it("no article claims engineer verification yet", () => {
    for (const article of articles) {
      expect(article.status).not.toBe("verified");
      for (const section of article.sections) expect(section.status).not.toBe("verified");
    }
  });
});

describe("Knowledge Centre UI", () => {
  const box = () => screen.getByLabelText("Describe the problem, or search for a topic");

  it("browses by category when nothing is typed, with authority badges", () => {
    renderWithProviders(<KnowledgeCentre />);
    expect(screen.getByRole("heading", { name: "Playout" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "General help" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Understanding Myriad 6 Live Assist/ })).toHaveAttribute("href", "/knowledge/kb-myriad-live-assist");
    expect(screen.getAllByText("Unverified draft").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Glossary of terms" })).toHaveAttribute("href", "/knowledge/glossary");
    expect(screen.getByText(/not an AI/)).toBeInTheDocument();
  });

  it("understands presenter phrasing and offers interpretations with actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(box(), "It's stuck on the same song");
    const results = await screen.findByRole("region", { name: "Search results" });
    expect(within(results).getByText("Myriad isn't responding or looks frozen")).toBeInTheDocument();
    expect(within(results).getAllByRole("button", { name: "Start troubleshooting" }).length).toBeGreaterThan(0);
    expect(within(results).getByRole("link", { name: /Recognising playback status/ })).toBeInTheDocument();
  });

  it("asks which equipment for a vague question, and uses the choice as context", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(box(), "Why isn't it working?");
    expect(await screen.findByText(/Which piece of equipment do you mean/)).toBeInTheDocument();
    await user.click(within(screen.getByRole("list", { name: "Choose equipment" })).getByRole("button", { name: "Green Myriad button" }));
    expect(await screen.findByText(/these results use your selection/)).toBeInTheDocument();
    expect(screen.getByText("The green next-song button isn't working")).toBeInTheDocument();
    // The selection can be switched off.
    await user.click(screen.getByRole("button", { name: "Don't use selection" }));
    expect(await screen.findByText(/Which piece of equipment do you mean/)).toBeInTheDocument();
  });

  it("is honest when nothing matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(box(), "how do I make a cup of tea");
    expect(await screen.findByText(/won't guess an answer/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Understanding/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use the troubleshooter" })).toHaveAttribute("href", "/troubleshooter");
  });

  it("flags silence on air as urgent", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(box(), "we're off air");
    expect(await screen.findByRole("alert")).toHaveTextContent("treat it as urgent");
  });

  it("Show in studio selects the equipment through validated commands; Start troubleshooting opens the troubleshooter", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <KnowledgeCentre />
        <SelectionProbe />
      </>,
    );
    await user.type(box(), "the green button stopped working");
    await user.click(await screen.findByRole("button", { name: "Show in studio" }));
    expect(screen.getByTestId("selection")).toHaveTextContent("green-next-button");
    expect(navigation.push).toHaveBeenCalledWith("/studio");
    navigation.push.mockClear();
    await user.click(screen.getByRole("button", { name: "Start troubleshooting" }));
    expect(navigation.push).toHaveBeenCalledWith("/troubleshooter");
  });
});

function SelectionProbe() {
  const { state } = useWorkspace();
  return <p data-testid="selection">{state.selectedEquipmentId ?? "none"}</p>;
}
