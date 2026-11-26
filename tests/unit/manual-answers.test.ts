import { describe, expect, it } from "vitest";
import { defaultContent, validateContent } from "@/lib/content/validate";
import { SOURCES } from "@/data/sources";
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

describe("Myriad 6 sources", () => {
  const manufacturer = Object.values(SOURCES).filter((s) => s.kind === "manufacturer");
  const read = manufacturer.filter((s) => s.retrievedOn !== null);

  it("registers the Myriad 6 help pages that were read", () => {
    const ids = manufacturer.map((s) => s.id);
    for (const id of [
      "myriad-6-support",
      "myriad-6-dashboard",
      "myriad-6-playing-media",
      "myriad-6-log-icons",
      "myriad-6-item-types",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("every manufacturer source cited by a manufacturer-documented section or quick answer is known, read and names its product", () => {
    const byId = new Map(manufacturer.map((s) => [s.id, s]));
    let sections = 0;
    for (const article of defaultContent.articles) {
      const cited = [
        ...article.sections.filter((sec) => sec.status === "manufacturer-documented").flatMap((sec) => sec.sourceIds ?? []),
        ...(article.quickAnswer?.status === "manufacturer-documented" ? article.quickAnswer.sourceIds : []),
      ];
      sections += article.sections.filter((sec) => sec.status === "manufacturer-documented").length;
      for (const id of cited) {
        const src = byId.get(id);
        expect(src, `${article.id} cites unknown source ${id}`).toBeDefined();
        expect(src!.retrievedOn, `${article.id} cites ${id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(src!.product, `${article.id} cites ${id}`).toBeTruthy();
      }
    }
    expect(sections).toBeGreaterThan(0);
  });

  it("every read Myriad source names its product, publisher and a help-portal or site URL", () => {
    const myriad = read.filter((s) => s.id.startsWith("myriad-6-"));
    expect(myriad.length).toBeGreaterThanOrEqual(5);
    for (const s of myriad) {
      expect(s.product, s.id).toBe("Myriad 6");
      expect(s.publisher, s.id).toBe("Broadcast Radio");
      expect(s.url, s.id).toMatch(/^https:\/\/(www|help)\.broadcastradio\.com\//);
    }
  });

  it("no read manufacturer source keeps a NOT_YET_READ note", () => {
    for (const s of read) {
      expect(s.note ?? "", s.id).not.toMatch(/not yet read|could not reach/i);
    }
  });
});

describe("Myriad 6 answers in the articles", () => {
  const byId = (id: string) => defaultContent.articles.find((a) => a.id === id)!;
  const myriad = defaultContent.articles.filter((a) => a.id.startsWith("kb-myriad-"));
  const sourceOf = (a: (typeof myriad)[number], id: string) => a.sources.find((s) => s.id === id);

  it("every kb-myriad article has a quick answer from a read Myriad source", () => {
    expect(myriad.length).toBe(8);
    for (const a of myriad) {
      const q = a.quickAnswer;
      expect(q, a.id).toBeDefined();
      expect(q!.status, a.id).toBe("manufacturer-documented");
      expect(q!.text.trim().split(/\s+/).length, a.id).toBeLessThanOrEqual(QUICK_ANSWER_MAX_WORDS);
      expect(q!.sourceIds.length, a.id).toBeGreaterThan(0);
      for (const id of q!.sourceIds) {
        const src = sourceOf(a, id);
        expect(src, `${a.id} ${id}`).toBeDefined();
        expect(manualLabel(src!), `${a.id} ${id}`).toBe("From the Myriad 6 manual");
      }
      expect(a.sections.some((sec) => sec.status === "manufacturer-documented"), a.id).toBe(true);
      expect(a.revisions.at(-1), a.id).toMatchObject({ date: "2026-11-26", author: "Development team (from Myriad 6 manual)" });
    }
  });

  it("kb-myriad-go-and-button still says the green button and Go are not confirmed to be the same", () => {
    const a = byId("kb-myriad-go-and-button");
    const text = [...a.sections.flatMap((s) => s.body), ...a.openQuestions, a.quickAnswer?.text ?? ""].join(" ");
    expect(text).toMatch(/not (yet )?confirmed/i);
    expect(a.quickAnswer!.text).toMatch(/not (yet )?confirmed/i);
    expect(a.openQuestions.join(" ")).toMatch(/same function/);
  });

  it("no manufacturer-documented text tells the presenter to restart, unplug, reset or change settings", () => {
    const bad = /\b(restart|reboot|unplug|reset|power off|change the settings?)\b/i;
    for (const a of defaultContent.articles) {
      for (const sec of a.sections.filter((s) => s.status === "manufacturer-documented")) {
        expect(`${sec.heading} ${sec.body.join(" ")}`, `${a.id} ${sec.heading}`).not.toMatch(bad);
      }
      if (a.quickAnswer?.status === "manufacturer-documented") expect(a.quickAnswer.text, a.id).not.toMatch(bad);
    }
  });

  it("quick answers carry the meaning of the manual", () => {
    expect(byId("kb-myriad-live-assist").quickAnswer!.text).toMatch(/wait|presenter starts|manually/i);
    expect(byId("kb-myriad-stop-chains").quickAnswer!.text).toMatch(/stop/i);
    expect(byId("kb-myriad-stop-chains").quickAnswer!.text).toMatch(/Go/);
    expect(byId("kb-myriad-screen").quickAnswer!.text).toMatch(/green circle/i);
    expect(byId("kb-myriad-screen").quickAnswer!.text).toMatch(/red square/i);
    expect(byId("kb-myriad-next-item").quickAnswer!.text).toMatch(/30 seconds/);
    expect(byId("kb-myriad-players").quickAnswer!.text).toMatch(/VU meter/i);
  });

  it("the screen article claims no colours the manual does not state", () => {
    const a = byId("kb-myriad-screen");
    expect(a.openQuestions.join(" ")).toMatch(/red|colour/i);
    expect(a.quickAnswer!.text).toMatch(/does not state any error or fault colour/);
    expect(a.quickAnswer!.text).not.toMatch(/no other dashboard colours/i);
  });

  it("the green button and next-song articles say nothing is confirmed about the button", () => {
    expect(byId("guide-green-button").quickAnswer!.text).toMatch(/not (yet )?confirmed/i);
    expect(byId("ts-next-song-wont-play").quickAnswer!.text).toMatch(/not (yet )?confirmed/i);
    const ts = byId("ts-next-song-wont-play");
    expect(ts.quickAnswer!.text).not.toMatch(/technical support/i);
    expect(ts.sections.filter((x) => x.status !== "manufacturer-documented").flatMap((x) => x.body).join(" ")).toMatch(/technical support/i);
  });

  it("glossary Myriad terms are no longer described as unread", () => {
    for (const t of defaultContent.glossary.filter((g) => ["stop-chain", "go-function"].includes(g.id))) {
      expect(t.definition + t.source, t.id).not.toMatch(/not yet read|once that has been read|has not been read/i);
      expect(t.source, t.id).toMatch(/Myriad 6/);
    }
  });
});

describe("real content", () => {
  it("still validates", () => {
    expect(validateContent(defaultContent, NOW)).toEqual([]);
  });
});
