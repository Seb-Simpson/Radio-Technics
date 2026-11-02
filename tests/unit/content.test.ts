import { describe, expect, it } from "vitest";
import { equipment } from "@/data/equipment";
import { hotspots } from "@/data/hotspots";
import { getEquipmentById, isKnownEquipmentId } from "@/lib/content/equipment";
import { defaultContent, validateContent } from "@/lib/content/validate";
import { findViewForEquipment, getViews } from "@/lib/content/views";
import { getStudioViews, demoLayoutView } from "@/data/studio-views";

describe("equipment records", () => {
  it("load with unique IDs and the required fields", () => {
    expect(equipment.length).toBeGreaterThanOrEqual(10);
    const ids = equipment.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const record of equipment) {
      expect(record.name).toBeTruthy();
      expect(record.description).toBeTruthy();
      expect(record.primaryFunction.text).toBeTruthy();
      expect(record.commonProblems.length).toBeGreaterThan(0);
      expect(record.requiresVerification.length).toBeGreaterThan(0);
    }
  });

  it("includes the known studio equipment", () => {
    for (const id of [
      "mixing-console",
      "presenter-microphone",
      "guest-microphones",
      "myriad-playout",
      "green-next-button",
      "zoom-camera",
      "headphone-monitoring",
      "studio-monitor-speakers",
      "audio-level-meters",
      "equipment-rack",
      "studio-computers",
    ]) {
      expect(getEquipmentById(id), id).toBeDefined();
    }
  });

  it("records the green button's function as station-reported, not engineer-verified", () => {
    const button = getEquipmentById("green-next-button")!;
    expect(button.primaryFunction.text).toBe("Advances Myriad to the next song.");
    expect(button.primaryFunction.status).toBe("station-reported");
  });

  it("marks nothing as engineer-verified yet", () => {
    for (const record of equipment) {
      expect(record.primaryFunction.status).not.toBe("verified");
      for (const fact of record.knownInformation) expect(fact.status).not.toBe("verified");
    }
  });

  it("returns undefined for unknown or empty IDs", () => {
    expect(getEquipmentById("toaster")).toBeUndefined();
    expect(getEquipmentById(null)).toBeUndefined();
    expect(isKnownEquipmentId(42)).toBe(false);
  });
});

describe("content integrity", () => {
  it("has no broken references", () => {
    expect(validateContent()).toEqual([]);
  });

  it("detects broken references", () => {
    const issues = validateContent({
      ...defaultContent,
      hotspots: [
        ...defaultContent.hotspots,
        { id: "bad-hotspot", viewId: "missing-view", equipmentId: "toaster", region: { x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, placeholder: true },
      ],
    });
    const messages = issues.map((i) => i.message).join("\n");
    expect(messages).toMatch(/missing equipment "toaster"/);
    expect(messages).toMatch(/missing view "missing-view"/);
    expect(messages).toMatch(/outside the image/);
  });

  it("every hotspot references a real equipment record (hotspots don't duplicate content)", () => {
    for (const hotspot of hotspots) expect(isKnownEquipmentId(hotspot.equipmentId)).toBe(true);
  });
});

describe("studio views", () => {
  it("falls back to the illustrative layout when no photographs exist", () => {
    expect(getStudioViews([])).toEqual([demoLayoutView]);
    expect(getViews().every((v) => v.illustrative)).toBe(true);
  });

  it("finds a view showing a given equipment item", () => {
    expect(findViewForEquipment("green-next-button")?.id).toBe("demo-layout");
    expect(findViewForEquipment("toaster")).toBeUndefined();
  });
});
