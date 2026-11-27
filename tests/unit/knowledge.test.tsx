import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EquipmentPanel } from "@/components/studio/EquipmentPanel";
import { KnowledgeCentre } from "@/components/knowledge/KnowledgeCentre";
import { articles } from "@/data/articles";
import { sectionManualSource } from "@/lib/knowledge/manual-label";
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

describe("quick answers and manual labels", () => {
  const box = () => screen.getByLabelText("Describe the problem, or search for a topic");
  async function renderArticle(articleId: string) {
    const { default: ArticlePage } = await import("@/app/knowledge/[articleId]/page");
    const ui = await ArticlePage({ params: Promise.resolve({ articleId }) });
    return renderWithProviders(ui);
  }

  it("shows the quick answer before the first section, with a manual label and original link", async () => {
    await renderArticle("kb-myriad-live-assist");
    const article = articles.find((a) => a.id === "kb-myriad-live-assist")!;
    const answer = screen.getByText(article.quickAnswer!.text);
    const firstSection = screen.getByRole("heading", { level: 2, name: article.sections[0]!.heading });
    expect(answer.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // It comes right after the caution notice, before the symptoms list.
    const symptoms = screen.getByRole("heading", { name: "How presenters might describe this" });
    expect(answer.compareDocumentPosition(symptoms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const caution = screen.getByText(/It is not an approved\s+station procedure/);
    expect(caution.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const quick = screen.getByRole("region", { name: "Quick answer" });
    expect(within(quick).getByText("From the Myriad 6 manual")).toBeInTheDocument();
    const link = within(quick).getByRole("link", { name: /Read the original/ });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName(/opens in a new tab/);
  });

  it("labels only the manufacturer section of a mixed article", async () => {
    await renderArticle("kb-myriad-live-assist");
    const stationHeading = screen.getByRole("heading", { name: "What the station has told us" });
    expect(within(stationHeading.parentElement!).queryByText(/From the .* manual/)).toBeNull();
    const manualHeading = screen.getByRole("heading", { name: "What the manual says about the play modes" });
    expect(within(manualHeading.parentElement!).getByText("From the Myriad 6 manual")).toBeInTheDocument();
  });

  it("a station-reported quick answer has no label and no original link", async () => {
    await renderArticle("guide-green-button");
    const quick = screen.getByRole("region", { name: "Quick answer" });
    expect(within(quick).getByText("Station reported")).toBeInTheDocument();
    expect(within(quick).queryByText(/From the .* manual/)).toBeNull();
    expect(within(quick).queryByRole("link")).toBeNull();
  });

  it("article cards show the quick answer instead of the summary", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(screen.getByLabelText("Describe the problem, or search for a topic"), "live assist");
    const article = articles.find((a) => a.id === "kb-myriad-live-assist")!;
    expect(await screen.findByText(article.quickAnswer!.text)).toBeInTheDocument();
    expect(screen.queryByText(article.summary)).toBeNull();
  });

  it("shows the top result's quick answer inline, with its manual label and original link", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(screen.getByLabelText("Describe the problem, or search for a topic"), "how do i play the next song");
    const results = await screen.findByRole("region", { name: "Search results" });
    const article = articles.find((a) => a.id === "kb-myriad-next-item")!;
    const heading = within(results).getByRole("heading", { name: "Quick answer" });
    const block = heading.closest("section")!;
    expect(within(block).getByText(article.quickAnswer!.text)).toBeInTheDocument();
    expect(within(block).getByText("From the Myriad 6 manual")).toBeInTheDocument();
    expect(within(block).getByRole("link", { name: /Read the original/ })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
    expect(within(results).getByRole("link", { name: article.title })).toHaveAttribute("href", "/knowledge/kb-myriad-next-item");
    expect(within(results).getAllByText(article.quickAnswer!.text)).toHaveLength(1);
  });

  it.each([
    ["we're off air, how do I play the next song", /treat it as urgent/],
    ["nothing is coming out, how do I play the next song", /possible silence on air is treated as urgent/],
  ])(
    "urgency first: %j shows the silence notice and no inline quick answer, while ordinary cards stay",
    async (query, notice) => {
      const user = userEvent.setup();
      renderWithProviders(<KnowledgeCentre />);
      await user.type(box(), query);
      const results = await screen.findByRole("region", { name: "Search results" });
      expect(await within(results).findByText(notice)).toBeInTheDocument();
      expect(within(results).queryByRole("heading", { name: "Quick answer" })).toBeNull();
      expect(within(results).queryByRole("region", { name: "Quick answer" })).toBeNull();
      // The top article is not removed from the grid: it stays as an ordinary card.
      expect(within(results).getAllByRole("listitem").length).toBeGreaterThan(0);
      expect(within(results).getByRole("link", { name: /Understanding the next item in the log/ })).toBeInTheDocument();
    },
  );

  it("a calm query still shows the inline quick answer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(box(), "how do i play the next song");
    const results = await screen.findByRole("region", { name: "Search results" });
    expect(within(results).getByRole("heading", { name: "Quick answer" })).toBeInTheDocument();
    expect(within(results).queryByRole("alert")).toBeNull();
  });

  it("the equipment panel lists at most three manual quick answers, with a link to the Knowledge Centre for the rest", () => {
    render(<EquipmentPanel equipmentId="myriad-playout" onClose={() => {}} />);
    const heading = screen.getByRole("heading", { name: "From the maker's documentation" });
    const section = heading.parentElement!;
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    const more = within(section).getByRole("link", { name: "More in the Knowledge Centre" });
    expect(more).toHaveAttribute("href", "/knowledge");
    // Only the record's own related articles are used, in their order.
    const live = articles.find((a) => a.id === "kb-myriad-live-assist")!;
    expect(within(section).getByText(live.quickAnswer!.text)).toBeInTheDocument();
    // An article shown with its quick answer is not repeated under "Related guides".
    const related = screen.getByRole("heading", { name: "Related guides" }).parentElement!;
    for (const a of ["kb-myriad-next-item", "kb-myriad-live-assist", "kb-myriad-screen"]) {
      const title = articles.find((x) => x.id === a)!.title;
      expect(within(related).queryByRole("link", { name: title })).toBeNull();
    }
    expect(within(related).getByRole("link", { name: "The next song won't play" })).toBeInTheDocument();
  });

  it("the equipment panel omits the maker's documentation section when no related article is manual-backed", () => {
    render(<EquipmentPanel equipmentId="presenter-microphone" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Related guides" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "From the maker's documentation" })).toBeNull();
    expect(screen.queryByRole("link", { name: "More in the Knowledge Centre" })).toBeNull();
  });

  it("the equipment panel shows no 'More' link when three or fewer manual answers exist", () => {
    render(<EquipmentPanel equipmentId="equipment-rack" onClose={() => {}} />);
    const heading = screen.getByRole("heading", { name: "From the maker's documentation" });
    expect(within(heading.parentElement!).queryByRole("link", { name: "More in the Knowledge Centre" })).toBeNull();
  });
});

describe("section manual label", () => {
  const article = articles.find((a) => a.id === "kb-myriad-live-assist")!;
  const manualSection = article.sections.find((s) => s.status === "manufacturer-documented")!;

  it("labels a manufacturer-documented section that cites a read manual", () => {
    expect(sectionManualSource(manualSection, article.sources)?.product).toBe("Myriad 6");
  });

  it("never labels a station-reported or draft section that cites a manual", () => {
    for (const status of ["station-reported", "draft"] as const) {
      expect(sectionManualSource({ ...manualSection, status }, article.sources)).toBeUndefined();
    }
  });
});
