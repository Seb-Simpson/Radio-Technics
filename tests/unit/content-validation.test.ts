/**
 * RT-002 Stage F: content validation must reject unsafe or malformed data.
 */
import { describe, expect, it } from "vitest";
import { validateRegion } from "@/lib/content/geometry";
import { defaultContent, isValidIsoDate, validateContent, validateReview } from "@/lib/content/validate";
import { validateWorkspaceCommand } from "@/lib/workspace/commands";
import type { ContentBundle } from "@/lib/content/validate";
import type { ReviewRecord } from "@/types";

const NOW = new Date("2026-11-02T12:00:00Z");
const goodReview: ReviewRecord = { reviewer: "Station engineer (J. Smith)", date: "2026-10-30", source: "Walkthrough in studio" };

function withChanges(change: (c: ContentBundle) => ContentBundle) {
  const clone = structuredClone(defaultContent);
  return validateContent(change(clone), NOW).map((i) => i.message);
}

describe("geometry", () => {
  it.each([
    ["NaN", { x: Number.NaN, y: 0, width: 0.1, height: 0.1 }, /finite/],
    ["Infinity", { x: 0, y: 0, width: Infinity, height: 0.1 }, /finite/],
    ["string", { x: "0.1", y: 0, width: 0.1, height: 0.1 }, /finite/],
    ["negative", { x: -0.01, y: 0, width: 0.1, height: 0.1 }, /outside/],
    ["past the edge", { x: 0.95, y: 0, width: 0.1, height: 0.1 }, /past the edge/],
    ["zero size", { x: 0.1, y: 0.1, width: 0, height: 0.1 }, /too small/],
    ["start beyond image", { x: 1.2, y: 0, width: 0.1, height: 0.1 }, /outside|past/],
  ])("rejects %s", (_l, region, message) => {
    expect(validateRegion(region).join(" ")).toMatch(message);
  });

  it("accepts a valid region and rejects non-objects", () => {
    expect(validateRegion({ x: 0, y: 0, width: 1, height: 1 })).toEqual([]);
    expect(validateRegion(null)).toEqual(["Region must be an object"]);
  });

  it("content validation reports invalid hotspot geometry", () => {
    const messages = withChanges((c) => {
      c.hotspots[0]!.region = { x: Number.NaN, y: 0, width: 0.2, height: 0.2 };
      c.hotspots[1]!.region = { x: 0.9, y: 0.9, width: 0.5, height: 0.5 };
      return c;
    });
    expect(messages.join("\n")).toMatch(/x must be a finite number/);
    expect(messages.join("\n")).toMatch(/past the edge/);
  });
});

describe("review dates and records", () => {
  it.each(["2026-02-30", "2026-13-01", "30/10/2026", "yesterday", "", "2026-1-5"])("rejects %j as a date", (value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });

  it("accepts real dates", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it.each([
    ["missing reviewer", { ...goodReview, reviewer: "" }, /reviewer/],
    ["placeholder reviewer", { ...goodReview, reviewer: "TBC" }, /reviewer/],
    ["future date", { ...goodReview, date: "2027-01-01" }, /future/],
    ["invalid date", { ...goodReview, date: "2026-02-30" }, /real date/],
    ["missing source", { ...goodReview, source: "" }, /source/],
  ])("rejects a review with %s", (_l, review, message) => {
    expect(validateReview(review, NOW).join(" ")).toMatch(message);
  });

  it("accepts a complete review", () => {
    expect(validateReview(goodReview, NOW)).toEqual([]);
  });
});

describe("nothing becomes 'verified' without review evidence", () => {
  it("rejects a verified fact without a review", () => {
    const messages = withChanges((c) => {
      c.equipment[0]!.knownInformation[0]!.status = "verified";
      return c;
    });
    expect(messages.join("\n")).toMatch(/mixing-console fact 1 is marked verified but its review record is missing/);
  });

  it("rejects a verified primary function with an incomplete review", () => {
    const messages = withChanges((c) => {
      const green = c.equipment.find((e) => e.id === "green-next-button")!;
      green.primaryFunction = { ...green.primaryFunction, status: "verified", review: { ...goodReview, reviewer: "unknown" } };
      return c;
    });
    expect(messages.join("\n")).toMatch(/green-next-button primary function is marked verified but its review needs the reviewer/);
  });

  it("accepts a verified fact with a complete review", () => {
    const messages = withChanges((c) => {
      c.equipment[0]!.knownInformation[0] = { text: "Confirmed fact", status: "verified", review: goodReview };
      return c;
    });
    expect(messages).toEqual([]);
  });

  it("rejects a verified article without review, or with unverified sections", () => {
    let messages = withChanges((c) => {
      c.articles[0]!.status = "verified";
      return c;
    });
    expect(messages.join("\n")).toMatch(/guide-studio-overview is marked verified but its review record is missing/);
    messages = withChanges((c) => {
      c.articles[0]!.status = "verified";
      c.articles[0]!.review = goodReview;
      return c;
    });
    expect(messages.join("\n")).toMatch(/is marked verified but .* is not/);
  });

  it("rejects a verified hotspot identity without review", () => {
    const messages = withChanges((c) => {
      c.hotspots[0]!.identity = "verified";
      return c;
    });
    expect(messages.join("\n")).toMatch(/identity is marked verified/);
  });

  it("rejects unknown verification statuses", () => {
    const messages = withChanges((c) => {
      (c.equipment[0]!.primaryFunction as { status: string }).status = "confirmed";
      return c;
    });
    expect(messages.join("\n")).toMatch(/unknown verification status "confirmed"/);
  });

  it("requires provenance for station-reported facts", () => {
    const messages = withChanges((c) => {
      delete c.equipment[0]!.knownInformation[0]!.source;
      return c;
    });
    expect(messages.join("\n")).toMatch(/station-reported but has no source/);
  });

  it("the shipped content contains no engineer-verified claims", () => {
    const json = JSON.stringify(defaultContent);
    expect(json).not.toMatch(/"status":"verified"/);
    expect(json).not.toMatch(/"identity":"verified"/);
  });
});

describe("structured references", () => {
  it("rejects broken equipment, article, flow and view references", () => {
    const messages = withChanges((c) => {
      c.equipment[0]!.relatedArticleIds.push("no-such-article");
      c.equipment[0]!.flowEntryNodeId = "no-such-node";
      c.articles[0]!.equipmentIds.push("no-such-equipment");
      c.flowNodes[0]!.options[0]!.next = "nowhere";
      c.flowNodes[0]!.options[0]!.audio = "sparkles" as never;
      c.views[0]!.src = "https://example.com/photo.jpg";
      return c;
    }).join("\n");
    expect(messages).toMatch(/missing article "no-such-article"/);
    expect(messages).toMatch(/missing flow node "no-such-node"/);
    expect(messages).toMatch(/missing equipment "no-such-equipment"/);
    expect(messages).toMatch(/missing node "nowhere"/);
    expect(messages).toMatch(/unknown audio claim "sparkles"/);
    expect(messages).toMatch(/src must be a file in \/studio\/photos\//);
  });

  it("rejects illustrative views whose hotspots claim real positions", () => {
    const messages = withChanges((c) => {
      c.hotspots.find((h) => h.viewId === "demo-layout")!.placeholder = false;
      return c;
    });
    expect(messages.join("\n")).toMatch(/illustrative view but not marked as a placeholder/);
  });
});

describe("workspace commands", () => {
  it.each([
    [{ type: "highlight_equipment", equipmentId: Number.NaN }],
    [{ type: "highlight_equipment", equipmentId: "toaster" }],
    [{ type: "operate_equipment", equipmentId: "green-next-button" }],
    [{ type: "show_view", viewId: "../../etc/passwd" }],
    [{ type: "open_studio_explorer", equipmentId: 42 }],
    [{ type: "__proto__" }],
  ])("rejects %j", (command) => {
    expect(validateWorkspaceCommand(command).ok).toBe(false);
  });
});
