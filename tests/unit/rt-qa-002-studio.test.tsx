/** RT-QA-002 Priority 5: image failures, hotspot identity, provenance. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PhotoViewer } from "@/components/studio/PhotoViewer";
import { StudioExplorer } from "@/components/studio/StudioExplorer";
import { defaultContent, isMeaningfulProvenance, validateContent, validateReview } from "@/lib/content/validate";
import { validateWorkspaceCommand } from "@/lib/workspace/commands";
import { initialWorkspaceState, workspaceReducer } from "@/lib/workspace/state";
import type { StudioView } from "@/types";
import { media } from "../setup";
import { renderWithProviders } from "./render";

describe("8. photographs that fail before React is ready", () => {
  const photo: StudioView = {
    id: "mixing-console",
    title: "Mixing console",
    description: "",
    kind: "photo",
    src: "/studio/photos/does-not-exist.jpg",
    width: 1200,
    height: 1600,
    alt: "Mixing console",
    illustrative: false,
  };
  const hotspot = { id: "h1", viewId: "mixing-console", equipmentId: "mixing-console", region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, placeholder: false, identity: "draft" as const };

  it("detects an image that had already failed when the component mounted", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth")!;
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    // Simulate the browser state after an early 404: finished, with no pixels.
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 0 });
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    try {
      render(<PhotoViewer view={photo} hotspots={[hotspot]} selectedEquipmentId={null} highlightedEquipmentId={null} onSelectEquipment={() => {}} />);
      expect(screen.getByRole("alert")).toHaveTextContent("This photograph couldn't be loaded");
      expect(screen.queryByRole("button", { name: "Main broadcast mixing console" })).not.toBeInTheDocument();
      expect(screen.queryByRole("img", { name: "Mixing console" })).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", descriptor);
      if (complete) Object.defineProperty(HTMLImageElement.prototype, "complete", complete);
      else delete (HTMLImageElement.prototype as { complete?: boolean }).complete;
    }
  });
});

describe("9. each hotspot keeps its own identity", () => {
  it("validates hotspot IDs on selection commands", () => {
    expect(validateWorkspaceCommand({ type: "select_equipment", equipmentId: "equipment-rack", hotspotId: "equipment-rack-xnode" }).ok).toBe(true);
    expect(validateWorkspaceCommand({ type: "select_equipment", equipmentId: "equipment-rack", hotspotId: "nope" }).ok).toBe(false);
    expect(validateWorkspaceCommand({ type: "select_equipment", equipmentId: "mixing-console", hotspotId: "equipment-rack-xnode" }).ok).toBe(false);
    expect(validateWorkspaceCommand({ type: "select_equipment", equipmentId: "equipment-rack", hotspotId: 7 }).ok).toBe(false);
  });

  it("stores the selected hotspot separately from the selected equipment", () => {
    let s = workspaceReducer(initialWorkspaceState, { type: "select_equipment", equipmentId: "equipment-rack", hotspotId: "equipment-rack-xnode" });
    expect(s).toMatchObject({ selectedEquipmentId: "equipment-rack", selectedHotspotId: "equipment-rack-xnode" });
    s = workspaceReducer(s, { type: "select_equipment", equipmentId: "equipment-rack" });
    expect(s.selectedHotspotId).toBeNull();
    s = workspaceReducer(s, { type: "clear_selection" });
    expect(s.selectedHotspotId).toBeNull();
  });

  it("shows the note for the exact hotspot chosen and highlights only that region", async () => {
    media.wide = true;
    const user = userEvent.setup();
    renderWithProviders(<StudioExplorer />);
    await user.click(screen.getByRole("tab", { name: "Equipment rack" }));
    const viewer = screen.getByRole("group", { name: /^Equipment rack/ });
    const regions = within(viewer).getAllByRole("button", { name: "Technical equipment rack" });
    expect(regions).toHaveLength(3);
    const panel = () => screen.getByRole("complementary", { name: "Selected equipment" });
    const note = () => within(panel()).getByText("In this photo:").closest("p")!.textContent ?? "";

    await user.click(regions[0]!);
    expect(note()).toMatch(/Axia QOR\.16 Integrated Console Engine/);
    expect(regions.map((r) => r.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);

    await user.click(regions[1]!);
    expect(note()).toMatch(/X-NODE 2/);
    expect(note()).not.toMatch(/QOR\.16/);
    expect(regions.map((r) => r.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);

    await user.click(regions[2]!);
    expect(note()).toMatch(/Fourteen numbered switches/);

    // Choosing the equipment itself (not a region) still marks every region showing it.
    await user.click(within(screen.getByRole("region", { name: "All equipment" })).getByRole("button", { name: "Technical equipment rack" }));
    expect(regions.map((r) => r.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
  });
});

describe("10. provenance must be meaningful", () => {
  const NOW = new Date("2026-11-02T12:00:00Z");
  const review = { reviewer: "Jo Smith (station engineer)", date: "2026-10-30" };

  it.each(["TBC", "n/a", "N/A", "na", "tbd", "---", "?", "pending", "unknown", "Email", "see above", "x"])("rejects review source %j", (source) => {
    expect(isMeaningfulProvenance(source)).toBe(false);
    expect(validateReview({ ...review, source }, NOW).join(" ")).toMatch(/meaningful source/);
  });

  it.each(["Email from Jo Smith, 30 October", "Studio walkthrough with the engineer", "Phone call with station manager"])("accepts %j", (source) => {
    expect(validateReview({ ...review, source }, NOW)).toEqual([]);
  });

  it.each(["Station engineer", "engineer", "TBC", "n/a", "me"])("rejects reviewer %j without an identifiable person", (reviewer) => {
    expect(validateReview({ reviewer, date: "2026-10-30", source: "Email from the station" }, NOW).join(" ")).toMatch(/reviewer/);
  });

  it("rejects placeholder provenance on station-reported facts", () => {
    const content = structuredClone(defaultContent);
    content.equipment[0]!.knownInformation[0]!.source = "n/a";
    expect(validateContent(content, NOW).map((i) => i.message).join("\n")).toMatch(/placeholder source "n\/a"/);
  });

  it("a verified fact with a placeholder source is rejected", () => {
    const content = structuredClone(defaultContent);
    content.equipment[0]!.knownInformation[0] = { text: "Confirmed", status: "verified", review: { ...review, source: "TBC" } };
    expect(validateContent(content, NOW).map((i) => i.message).join("\n")).toMatch(/is marked verified but its review needs a meaningful source/);
  });
});
