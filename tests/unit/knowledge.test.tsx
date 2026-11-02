import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { KnowledgeCentre } from "@/components/knowledge/KnowledgeCentre";
import { articles } from "@/data/articles";
import { getArticlesForEquipment, searchArticles } from "@/lib/knowledge/search";
import { renderWithProviders } from "./render";

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
  it("searches and shows verification status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    expect(screen.getByText(`${articles.length} articles`)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search help topics"), "cable");
    expect(await screen.findByText("1 article")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cables that look unplugged/ })).toHaveAttribute("href", "/knowledge/help-cables");
    expect(screen.getAllByText("Unverified draft").length).toBeGreaterThan(0);
  });

  it("shows a helpful empty state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KnowledgeCentre />);
    await user.type(screen.getByLabelText("Search help topics"), "xylophone");
    expect(await screen.findByText("No articles match")).toBeInTheDocument();
  });
});
