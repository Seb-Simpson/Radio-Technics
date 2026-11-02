import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/shell/AppShell";
import { isActivePath, navItems } from "@/components/shell/navigation";
import { navigation } from "../setup";

describe("main navigation", () => {
  it("links to all five sections", () => {
    render(<AppShell>content</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Dashboard", "/"],
      ["Studio Explorer", "/studio"],
      ["Troubleshooter", "/troubleshooter"],
      ["Knowledge Centre", "/knowledge"],
      ["Administration", "/admin"],
    ]);
  });

  it("marks the current section, including nested pages", () => {
    navigation.pathname = "/knowledge/guide-green-button";
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("link", { name: "Knowledge Centre" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("provides a skip link and a main landmark", () => {
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveTextContent("content");
  });

  it("matches active paths correctly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/studio", "/")).toBe(false);
    expect(isActivePath("/studio", "/studio")).toBe(true);
    expect(isActivePath("/studios", "/studio")).toBe(false);
    expect(navItems).toHaveLength(5);
  });
});
