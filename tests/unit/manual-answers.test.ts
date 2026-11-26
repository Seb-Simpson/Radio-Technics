import { describe, expect, it } from "vitest";
import { defaultContent, validateContent } from "@/lib/content/validate";
import { manualLabel, QUICK_ANSWER_MAX_WORDS } from "@/lib/knowledge/manual-label";
import type { ContentBundle } from "@/lib/content/validate";
import type { SourceReference } from "@/types";

const NOW = new Date("2026-11-26T12:00:00Z");

const manual: SourceReference = {
  id: "manual-src",
  title: "Myriad 6 user guide",
  url: "https://example.com/manual.pdf",
  publisher: "Manufacturer",
  kind: "manufacturer",
  product: "Myriad 6",
  retrievedOn: "2026-11-26",
};

function withChanges(change: (c: ContentBundle) => void) {
  const clone = structuredClone(defaultContent);
  change(clone);
  return validateContent(clone, NOW).map((i) => i.message);
}

describe("manualLabel", () => {
  it("labels a read manufacturer source that names its product", () => {
    expect(manualLabel(manual)).toBe("From the Myriad 6 manual");
  });
  it("returns null when the source has not been read", () => {
    expect(manualLabel({ ...manual, retrievedOn: null })).toBeNull();
  });
  it("returns null for non-manufacturer sources and missing product", () => {
    expect(manualLabel({ ...manual, kind: "station" })).toBeNull();
    expect(manualLabel({ ...manual, product: undefined })).toBeNull();
  });
});

describe("quick answer validation", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

  it("limit is 40 words", () => expect(QUICK_ANSWER_MAX_WORDS).toBe(40));

  it("rejects a quick answer over the limit", () => {
    const m = withChanges((c) => {
      const art = c.articles[0]!;
      art.sources.push({ ...manual });
      art.quickAnswer = { text: words(41), status: "manufacturer-documented", sourceIds: ["manual-src"] };
    });
    expect(m.join("\n")).toMatch(/quick answer is longer than 40 words/);
  });

  it("accepts a 40-word quick answer citing a read manufacturer source", () => {
    const m = withChanges((c) => {
      const art = c.articles[0]!;
      art.sources.push({ ...manual });
      art.quickAnswer = { text: words(40), status: "manufacturer-documented", sourceIds: ["manual-src"] };
    });
    expect(m.join("\n")).not.toMatch(/quick answer/);
  });

  it("rejects manufacturer-documented citing an unread source", () => {
    const m = withChanges((c) => {
      const art = c.articles[0]!;
      art.sources.push({ ...manual, retrievedOn: null });
      art.quickAnswer = { text: "Short answer.", status: "manufacturer-documented", sourceIds: ["manual-src"] };
    });
    expect(m.join("\n")).toMatch(/cites a manufacturer source that hasn't been read/);
  });

  it("rejects an unknown source", () => {
    const m = withChanges((c) => {
      c.articles[0]!.quickAnswer = { text: "Short answer.", status: "draft", sourceIds: ["nope"] };
    });
    expect(m.join("\n")).toMatch(/quick answer cites unknown source/);
  });

  it("rejects manufacturer-documented quick answers on approved procedures", () => {
    const m = withChanges((c) => {
      const art = c.articles[0]!;
      art.kind = "approved-procedure";
      art.sources.push({ ...manual });
      art.quickAnswer = { text: "Short answer.", status: "manufacturer-documented", sourceIds: ["manual-src"] };
    });
    expect(m.join("\n")).toMatch(/approved procedure; its quick answer cannot be manufacturer-documented/);
  });
});

describe("real content", () => {
  it("still validates", () => {
    expect(validateContent(defaultContent, NOW)).toEqual([]);
  });
});
