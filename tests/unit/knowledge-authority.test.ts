/**
 * RT-003: the three levels of authority (manufacturer documentation,
 * station-reported information, engineer-approved instructions) must stay
 * distinct, and nothing can be promoted without the required evidence.
 */
import { describe, expect, it } from "vitest";
import { articles } from "@/data/articles";
import { glossary } from "@/data/glossary";
import { SOURCES } from "@/data/sources";
import { defaultContent, validateContent, type ContentBundle } from "@/lib/content/validate";
import type { ReviewRecord } from "@/types";

const NOW = new Date("2026-11-26T12:00:00Z");
const review: ReviewRecord = { reviewer: "Jo Smith (station engineer)", date: "2026-10-30", source: "Studio walkthrough with the engineer" };
const messages = (change: (c: ContentBundle) => ContentBundle) => validateContent(change(structuredClone(defaultContent)), NOW).map((i) => i.message).join("\n");
const article = (c: ContentBundle, id: string) => c.articles.find((a) => a.id === id)!;

describe("shipped knowledge content", () => {
  it("is internally consistent", () => {
    expect(validateContent(defaultContent, NOW)).toEqual([]);
  });

  it("contains no approved procedures and no engineer-verified articles yet", () => {
    for (const a of articles) {
      expect(a.kind, a.id).toBe("informational");
      expect(a.status, a.id).not.toBe("verified");
    }
  });

  it("does not claim manufacturer documentation beyond what has been read", () => {
    for (const a of articles) {
      expect(a.status).not.toBe("manufacturer-documented");
      for (const s of a.sections) expect(s.status, `${a.id}: ${s.heading}`).not.toBe("manufacturer-documented");
    }
    for (const src of [SOURCES.myriadSupport, SOURCES.myriadDashboard, SOURCES.myriadPlaying]) {
      expect(src.kind).toBe("manufacturer");
      expect(src.retrievedOn).toBe("2026-11-26");
      expect(src.note).toMatch(/^Read 2026-11-26/);
    }
  });

  it("every Myriad article states the version it applies to and lists the official source", () => {
    const myriad = articles.filter((a) => a.equipmentIds.includes("myriad-playout") && a.id.startsWith("kb-myriad"));
    expect(myriad.length).toBeGreaterThanOrEqual(7);
    for (const a of myriad) {
      expect(a.software, a.id).toMatchObject({ product: "Myriad Playout", versions: ["6"] });
      expect(a.sources.some((s) => s.kind === "manufacturer" && s.url?.startsWith("https://")), a.id).toBe(true);
      expect(a.diagnosticQuestions.length + a.openQuestions.length, a.id).toBeGreaterThan(0);
    }
  });

  it("never treats the green button as equivalent to Myriad's Go function", () => {
    const goArticle = articles.find((a) => a.id === "kb-myriad-go-and-button")!;
    const text = JSON.stringify(goArticle);
    expect(text).toMatch(/does not assume|treats the button and any on-screen control as separate/i);
    expect(goArticle.openQuestions.join(" ")).toMatch(/same function/);
  });

  it("glossary terms for Myriad features don't define them from memory", () => {
    for (const id of ["stop-chain", "go-function"]) {
      expect(glossary.find((t) => t.id === id)!.definition).toMatch(/once that has been read/);
    }
  });
});

describe("manufacturer documentation is not engineer approval", () => {
  it("rejects manufacturer-documented content citing an unread manufacturer source", () => {
    expect(
      messages((c) => {
        article(c, "kb-myriad-screen").sources.find((s) => s.id === "myriad-6-dashboard")!.retrievedOn = null;
        article(c, "kb-myriad-screen").sections[0]!.status = "manufacturer-documented";
        article(c, "kb-myriad-screen").sections[0]!.sourceIds = ["myriad-6-dashboard"];
        return c;
      }),
    ).toMatch(/manufacturer-documented but cites no manufacturer source that has been read/);
  });

  it("accepts manufacturer-documented content once the source has really been read", () => {
    expect(
      messages((c) => {
        const a = article(c, "kb-myriad-screen");
        a.sources.find((s) => s.id === "myriad-6-dashboard")!.retrievedOn = "2026-11-01";
        a.sections[0]!.status = "manufacturer-documented";
        a.sections[0]!.sourceIds = ["myriad-6-dashboard"];
        return c;
      }),
    ).toBe("");
  });

  it("an article backed only by manufacturer documentation cannot be an approved procedure", () => {
    const text = messages((c) => {
      const a = article(c, "kb-myriad-players");
      a.sources.find((s) => s.id === "myriad-6-playing-media")!.retrievedOn = "2026-11-01";
      a.status = "manufacturer-documented";
      a.kind = "approved-procedure";
      for (const s of a.sections) {
        s.status = "manufacturer-documented";
        s.sourceIds = ["myriad-6-playing-media"];
      }
      return c;
    });
    expect(text).toMatch(/kb-myriad-players is an approved procedure but is not engineer-verified with a review/);
    expect(text).toMatch(/approved procedure but contains sections that are not engineer-verified/);
  });

  it("an approved procedure is only valid with an engineer review and all sections verified", () => {
    const ok = messages((c) => {
      const a = article(c, "help-cables");
      a.kind = "approved-procedure";
      a.status = "verified";
      a.review = review;
      for (const s of a.sections) s.status = "verified";
      return c;
    });
    expect(ok).toBe("");
    expect(
      messages((c) => {
        const a = article(c, "help-cables");
        a.kind = "approved-procedure";
        a.status = "verified";
        a.review = { ...review, source: "n/a" };
        for (const s of a.sections) s.status = "verified";
        return c;
      }),
    ).toMatch(/meaningful source/);
  });
});

describe("structural rules", () => {
  it.each([
    ["missing related article", (c: ContentBundle) => (article(c, "kb-myriad-screen").relatedArticleIds.push("nope"), c), /missing related article "nope"/],
    ["self reference", (c: ContentBundle) => (article(c, "kb-myriad-screen").relatedArticleIds.push("kb-myriad-screen"), c), /lists itself/],
    ["missing topic", (c: ContentBundle) => (article(c, "kb-myriad-screen").relatedTopicIds.push("topic-nope"), c), /missing troubleshooting topic/],
    ["missing glossary term", (c: ContentBundle) => (article(c, "kb-myriad-screen").glossaryTermIds.push("nope"), c), /missing glossary term/],
    ["uncited source", (c: ContentBundle) => (article(c, "kb-myriad-screen").sections[0]!.sourceIds = ["ghost"], c), /cites source "ghost"/],
    ["http URL", (c: ContentBundle) => (article(c, "kb-myriad-screen").sources[0]!.url = "http://example.com", c), /https/],
    ["future retrieval date", (c: ContentBundle) => (article(c, "kb-myriad-screen").sources[0]!.retrievedOn = "2030-01-01", c), /invalid retrieval date/],
    ["question without ?", (c: ContentBundle) => (article(c, "kb-myriad-screen").diagnosticQuestions.push("Check the cable"), c), /not a question/],
    ["no version history", (c: ContentBundle) => (article(c, "kb-myriad-screen").revisions = [], c), /no version history/],
    ["verified glossary term", (c: ContentBundle) => (c.glossary[0]!.status = "verified", c), /cannot be "verified"/],
    ["no sources", (c: ContentBundle) => (article(c, "kb-myriad-screen").sources = [], c), /has no sources/],
  ])("rejects %s", (_l, change, pattern) => {
    expect(messages(change)).toMatch(pattern);
  });
});
