import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EquipmentPanel } from "@/components/studio/EquipmentPanel";
import { PhotoViewer, clampTransform, fitSize, focusTransform, zoomAround } from "@/components/studio/PhotoViewer";
import { StudioExplorer } from "@/components/studio/StudioExplorer";
import type { StudioView } from "@/types";
import { navigation } from "../setup";
import { renderWithProviders } from "./render";

describe("Studio Explorer", () => {
  it("selecting a hotspot updates the detail panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioExplorer />);
    const panel = screen.getByRole("complementary", { name: "Selected equipment" });
    expect(within(panel).getByText("Select a piece of equipment")).toBeInTheDocument();

    const hotspot = screen.getByRole("button", { name: /^Green Myriad button \(placeholder/ });
    await user.click(hotspot);

    expect(hotspot).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByRole("heading", { level: 2, name: "Green Myriad button" })).toBeInTheDocument();
    expect(within(panel).getByText("Advances Myriad to the next song.")).toBeInTheDocument();
    expect(within(panel).getByText("Button appears unresponsive", { exact: false })).toBeInTheDocument();
    expect(within(panel).getByText(/How the button is connected to Myriad/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /The green Myriad button/ })).toHaveAttribute("href", "/knowledge/guide-green-button");
    expect(within(panel).getAllByText("Station reported").length).toBeGreaterThan(0);
  });

  it("choosing from the equipment list selects and highlights it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioExplorer />);
    const list = screen.getByRole("region", { name: "All equipment" });
    await user.click(within(list).getByRole("button", { name: "Main broadcast mixing console" }));
    const hotspot = screen.getByRole("button", { name: /^Main broadcast mixing console \(placeholder/ });
    expect(hotspot).toHaveAttribute("data-highlighted", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Main broadcast mixing console" })).toBeInTheDocument();
  });

  it("closing the panel clears the selection", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioExplorer />);
    await user.click(screen.getByRole("button", { name: /^Zoom video camera \(placeholder/ }));
    await user.click(screen.getByRole("button", { name: "Close equipment details" }));
    expect(screen.getByText("Select a piece of equipment")).toBeInTheDocument();
  });

  it("'Troubleshoot this' starts the troubleshooter for that equipment", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioExplorer />);
    await user.click(screen.getByRole("button", { name: /^Green Myriad button \(placeholder/ }));
    await user.click(screen.getByRole("button", { name: "Troubleshoot this" }));
    expect(navigation.push).toHaveBeenCalledWith("/troubleshooter");
  });

  it("explains that real photographs are missing and labels the illustrative layout", () => {
    renderWithProviders(<StudioExplorer />);
    expect(screen.getByText("Real studio photographs haven't been added yet")).toBeInTheDocument();
    expect(screen.getByText("Illustrative layout — not the real studio")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /\(placeholder position\)/ }).length).toBeGreaterThan(5);
  });

  it("shows an empty state when there are no views at all", () => {
    renderWithProviders(<StudioExplorer views={[]} hotspots={[]} />);
    expect(screen.getByText("No studio views available")).toBeInTheDocument();
    // Equipment is still reachable from the list.
    expect(screen.getByRole("button", { name: "Green Myriad button" })).toBeInTheDocument();
  });

  it("handles a photograph that fails to load", () => {
    const photo: StudioView = {
      id: "studio-01",
      title: "Studio desk",
      description: "",
      kind: "photo",
      src: "/studio/photos/missing.jpg",
      width: 1200,
      height: 800,
      alt: "Studio desk",
      illustrative: false,
    };
    render(
      <PhotoViewer
        view={photo}
        hotspots={[{ id: "h1", viewId: "studio-01", equipmentId: "mixing-console", region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, placeholder: false }]}
        selectedEquipmentId={null}
        highlightedEquipmentId={null}
        onSelectEquipment={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Main broadcast mixing console" })).toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { name: "Studio desk" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This photograph couldn't be loaded");
    expect(screen.queryByRole("button", { name: "Main broadcast mixing console" })).not.toBeInTheDocument();
  });

  it("never renders hotspots that reference unknown equipment", () => {
    render(
      <PhotoViewer
        view={{ id: "v", title: "V", description: "", kind: "diagram", width: 100, height: 100, alt: "", illustrative: true }}
        hotspots={[{ id: "h", viewId: "v", equipmentId: "toaster", region: { x: 0, y: 0, width: 0.5, height: 0.5 }, placeholder: true }]}
        selectedEquipmentId={null}
        highlightedEquipmentId={null}
        onSelectEquipment={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /toaster/i })).not.toBeInTheDocument();
  });

  it("zoom controls and keyboard shortcuts change the zoom level", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioExplorer />);
    const level = screen.getByRole("status", { name: "Zoom level" });
    expect(level).toHaveTextContent("100%");
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(level).toHaveTextContent("140%");
    await user.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(level).toHaveTextContent("100%");

    const viewer = screen.getByRole("group", { name: /Illustrative layout/ });
    viewer.focus();
    await user.keyboard("+");
    expect(level).toHaveTextContent("140%");
    await user.keyboard("0");
    expect(level).toHaveTextContent("100%");
  });

  it("panel reports unknown equipment safely", () => {
    render(<EquipmentPanel equipmentId="toaster" onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Equipment not found");
  });
});

describe("viewer geometry", () => {
  it("fits images preserving aspect ratio", () => {
    expect(fitSize({ width: 1600, height: 900 }, { width: 800, height: 800 })).toEqual({ width: 800, height: 450 });
    expect(fitSize({ width: 1600, height: 900 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const t = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 });
    // A stage point at (100, 50) relative to centre stays at (100, 50) on screen.
    expect(t.x + 100 * t.scale).toBeCloseTo(100);
    expect(t).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("clamps zoom and pan so the image can't be lost", () => {
    const stage = { width: 800, height: 450 };
    const viewport = { width: 800, height: 450 };
    expect(clampTransform({ scale: 10, x: 0, y: 0 }, stage, viewport).scale).toBe(4);
    expect(clampTransform({ scale: 1, x: 500, y: 500 }, stage, viewport)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(clampTransform({ scale: 2, x: 9999, y: 0 }, stage, viewport).x).toBe(400);
  });

  it("centres on a hotspot region when focusing", () => {
    const t = focusTransform({ x: 0.5, y: 0.5, width: 0.1, height: 0.1 }, { width: 1000, height: 500 });
    expect(t.scale).toBe(2.5);
    expect(t.x).toBeCloseTo(-0.05 * 1000 * 2.5);
  });
});
