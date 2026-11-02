import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HotspotEditor, draftsFromHotspots, normaliseRect, toHotspotCode, validateDraft, type DraftHotspot } from "@/components/dev/HotspotEditor";
import { hotspots } from "@/data/hotspots";
import { studioPhotos } from "@/data/studio-views";
import { isHotspotEditorEnabled } from "@/lib/dev/access";

const size = { width: 1200, height: 1600 };
const draft = (patch: Partial<DraftHotspot> = {}): DraftHotspot => ({
  key: "k1",
  suffix: "button",
  equipmentId: "green-next-button",
  note: "",
  rect: { left: 10, top: 20, right: 300, bottom: 400 },
  ...patch,
});

describe("hotspot editor logic", () => {
  it("accepts a valid draft", () => {
    expect(validateDraft(draft(), size, [])).toEqual([]);
  });

  it.each([
    ["NaN coordinate", draft({ rect: { left: Number.NaN, top: 0, right: 10, bottom: 10 } }), /numbers/],
    ["Infinity", draft({ rect: { left: 0, top: 0, right: Infinity, bottom: 10 } }), /numbers/],
    ["outside the photo", draft({ rect: { left: 1100, top: 0, right: 1300, bottom: 10 } }), /outside/],
    ["negative", draft({ rect: { left: -5, top: 0, right: 10, bottom: 10 } }), /outside/],
    ["too small", draft({ rect: { left: 0, top: 0, right: 2, bottom: 2 } }), /too small/],
    ["bad id", draft({ suffix: "Not Valid" }), /lower-case/],
    ["unknown equipment", draft({ equipmentId: "toaster" }), /valid equipment/],
  ])("rejects %s", (_label, d, message) => {
    expect(validateDraft(d, size, []).join(" ")).toMatch(message);
  });

  it("rejects duplicate IDs on the same photo", () => {
    expect(validateDraft(draft(), size, [draft({ key: "k2" })]).join(" ")).toMatch(/already used/);
  });

  it("normalises dragged rectangles in any direction", () => {
    expect(normaliseRect({ left: 300.4, top: 400.6, right: 10, bottom: -20 }, size)).toEqual({ left: 10, top: 0, right: 300, bottom: 401 });
  });

  it("generates configuration that matches the data format", () => {
    expect(toHotspotCode("green-button", [draft({ note: "Labelled" })])).toBe(
      '  onPhoto("green-button", "button", "green-next-button", [10, 20, 300, 400], "Labelled"),',
    );
    expect(toHotspotCode("v", [draft()])).toMatch(/Not yet confirmed by the engineer/);
  });

  it("round-trips the committed hotspots to within a pixel", () => {
    const view = studioPhotos.find((v) => v.id === "mixing-console")!;
    const drafts = draftsFromHotspots(view, hotspots);
    expect(drafts.map((d) => d.suffix)).toEqual(["console", "meters", "headphones-knob"]);
    expect(drafts[0]!.rect).toEqual({ left: 0, top: 265, right: 1200, bottom: 1105 });
  });

  it("is disabled in production unless explicitly enabled", () => {
    expect(isHotspotEditorEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isHotspotEditorEnabled({ NODE_ENV: "production", RT_ENABLE_HOTSPOT_EDITOR: "1" })).toBe(true);
    expect(isHotspotEditorEnabled({ NODE_ENV: "development" })).toBe(true);
  });
});

describe("hotspot editor UI", () => {
  it("loads existing hotspots, validates edits and blocks copying invalid configuration", () => {
    render(<HotspotEditor views={studioPhotos} hotspots={hotspots} />);
    const regions = screen.getByRole("heading", { name: "Regions on this photo" }).parentElement!;
    fireEvent.click(within(regions).getByRole("button", { name: /meters/ }));
    const left = screen.getByRole("spinbutton", { name: "Left (px)" });
    expect(left).toHaveValue(150);
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
    expect(screen.getByTestId("hotspot-code")).toHaveTextContent('onPhoto("mixing-console", "meters", "audio-level-meters", [150, 165, 640, 250]');

    fireEvent.change(left, { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Coordinates must be numbers");
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();

    fireEvent.change(left, { target: { value: "-40" } });
    expect(screen.getByRole("alert")).toHaveTextContent("outside the photo");

    fireEvent.change(left, { target: { value: "160" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("hotspot-code")).toHaveTextContent("[160, 165, 640, 250]");
  });

  it("switching photo loads that photo's hotspots", () => {
    render(<HotspotEditor views={studioPhotos} hotspots={hotspots} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Photograph" }), { target: { value: "equipment-rack" } });
    expect(screen.getByTestId("hotspot-code").textContent).toMatch(/"equipment-rack", "power-panel"/);
  });
});
