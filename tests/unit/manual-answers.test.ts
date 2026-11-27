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
  it("labels a product page as a product page, and keeps manual as the default", () => {
    expect(manualLabel({ ...manual, documentType: "product-page" })).toBe("From the Myriad 6 product page");
    expect(manualLabel({ ...manual, documentType: "manual" })).toBe("From the Myriad 6 manual");
  });
  it("still returns null for an unread product page", () => {
    expect(manualLabel({ ...manual, documentType: "product-page", retrievedOn: null })).toBeNull();
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

  it("counts words across any whitespace", () => {
    const m = withChanges((c) => {
      const art = c.articles[0]!;
      art.sources.push({ ...manual });
      art.quickAnswer = { text: `${words(21)}\n\t ${words(20)}`, status: "manufacturer-documented", sourceIds: ["manual-src"] };
    });
    expect(m.join("\n")).toMatch(/quick answer is longer than 40 words/);
  });

  it("rejects empty text", () => {
    const m = withChanges((c) => {
      const art = c.articles[0]!;
      art.sources.push({ ...manual });
      art.quickAnswer = { text: "", status: "draft", sourceIds: ["manual-src"] };
    });
    expect(m.join("\n")).toMatch(/quick answer has no text/);
  });

  it("rejects whitespace-only text", () => {
    const m = withChanges((c) => {
      const art = c.articles[0]!;
      art.sources.push({ ...manual });
      art.quickAnswer = { text: " \n\t ", status: "draft", sourceIds: ["manual-src"] };
    });
    expect(m.join("\n")).toMatch(/quick answer has no text/);
  });

  it("rejects a quick answer that cites no source", () => {
    const m = withChanges((c) => {
      c.articles[0]!.quickAnswer = { text: "Short answer.", status: "draft", sourceIds: [] };
    });
    expect(m.join("\n")).toMatch(/quick answer cites no source/);
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

  it("the green button article says nothing is confirmed about the button", () => {
    expect(byId("guide-green-button").quickAnswer!.text).toMatch(/not (yet )?confirmed/i);
  });

  it("the next-song troubleshooting article has no quick answer, so its silence guidance leads", () => {
    const ts = byId("ts-next-song-wont-play");
    expect(ts.quickAnswer).toBeUndefined();
    expect(ts.sections[0]!.heading).toBe("If there is silence on air");
    expect(ts.sections.filter((x) => x.status !== "manufacturer-documented").flatMap((x) => x.body).join(" ")).toMatch(/technical support/i);
  });

  it("the unread manuals are registered as unread manufacturer sources and cited by no manufacturer-documented text", () => {
    const unread = ["axia-iq-user-manual", "axia-iq-quick-start", "behringer-ms16-quick-start", "behringer-ms16-user-manual"];
    for (const id of unread) {
      const src = (Object.values(SOURCES) as SourceReference[]).find((x) => x.id === id);
      expect(src, id).toBeDefined();
      expect(src!.kind).toBe("manufacturer");
      expect(src!.retrievedOn, id).toBeNull();
      expect(src!.url, id).toMatch(/^https:\/\//);
      // Listed on an article's sources, so /admin shows it under "Manufacturer sources not yet read".
      expect(defaultContent.articles.some((a) => a.sources.some((x) => x.id === id)), id).toBe(true);
      for (const a of defaultContent.articles) {
        for (const sec of a.sections) {
          if (sec.status === "manufacturer-documented") expect(sec.sourceIds ?? [], `${a.id}/${sec.heading}`).not.toContain(id);
        }
        expect(a.quickAnswer?.sourceIds ?? [], a.id).not.toContain(id);
      }
    }
  });

  it("xNode2 article says the top network port accepts PoE+ power, not that it supplies power", () => {
    const a = byId("kb-telos-xnode2");
    const text = a.sections.flatMap((x) => x.body).join(" ");
    expect(text).toMatch(/top network port can also power the unit \(PoE\+\)/);
    expect(text).not.toMatch(/supply power/i);
  });

  it("QOR.16 and iQ notes say the QOR.16 page mentions iQ, and the pairing is unconfirmed", () => {
    expect(SOURCES.axiaQor16.note).not.toMatch(/does not mention iQ/i);
    expect(SOURCES.axiaQor16.note).toMatch(/FAQ also mentions iQ/);
    expect(byId("kb-axia-qor16").openQuestions.join(" ")).toMatch(/mentions iQ in its FAQ/);
    expect(byId("kb-axia-qor16").relatedArticleIds).not.toContain("kb-axia-iq-console");
    expect(byId("kb-axia-iq-console").relatedArticleIds).not.toContain("kb-axia-qor16");
  });

  it("glossary Myriad terms are no longer described as unread", () => {
    for (const t of defaultContent.glossary.filter((g) => ["stop-chain", "go-function"].includes(g.id))) {
      expect(t.definition + t.source, t.id).not.toMatch(/not yet read|once that has been read|has not been read/i);
      expect(t.source, t.id).toMatch(/Myriad 6/);
    }
  });
});

describe("studio hardware explanations", () => {
  const byId = (id: string) => defaultContent.articles.find((a) => a.id === id)!;
  const equipment = (id: string) => defaultContent.equipment.find((e) => e.id === id)!;
  const hardware = [
    { id: "kb-axia-iq-console", equipment: "mixing-console", label: "From the Axia iQ product page", host: /^https:\/\/www\.telosalliance\.com\// },
    { id: "kb-axia-qor16", equipment: "equipment-rack", label: "From the Axia QOR.16 product page", host: /^https:\/\/www\.telosalliance\.com\// },
    { id: "kb-telos-xnode2", equipment: "equipment-rack", label: "From the Telos xNode2 manual", host: /^https:\/\/docs\.telosalliance\.com\// },
    { id: "kb-behringer-ms16", equipment: "studio-monitor-speakers", label: "From the Behringer MS16 product page", host: /^https:\/\/www\.behringer\.com\// },
  ];

  it("each article has a short quick answer from a read manufacturer source", () => {
    for (const h of hardware) {
      const a = byId(h.id);
      expect(a, h.id).toBeDefined();
      expect(a.kind, h.id).toBe("informational");
      expect(a.status, h.id).toBe("draft");
      const q = a.quickAnswer!;
      expect(q.status, h.id).toBe("manufacturer-documented");
      expect(q.text.trim().split(/\s+/).length, h.id).toBeLessThanOrEqual(QUICK_ANSWER_MAX_WORDS);
      expect(q.sourceIds.length, h.id).toBeGreaterThan(0);
      for (const id of q.sourceIds) {
        const src = a.sources.find((s) => s.id === id)!;
        expect(src.kind, `${h.id} ${id}`).toBe("manufacturer");
        expect(src.url, `${h.id} ${id}`).toMatch(h.host);
        expect(src.retrievedOn, `${h.id} ${id}`).toBe("2026-11-26");
        expect(manualLabel(src), `${h.id} ${id}`).toBe(h.label);
      }
      expect(a.revisions.at(-1), h.id).toMatchObject({ date: "2026-11-26" });
      expect(a.revisions.at(-1)!.author, h.id).toMatch(/^Development team \(from .+ documentation\)$/);
    }
  });

  it("no hardware article tells the presenter to restart, unplug, reset or change settings", () => {
    const bad = /\b(restart|reboot|unplug|reset|power off|change the settings?)\b/i;
    for (const h of hardware) {
      const a = byId(h.id);
      for (const sec of a.sections.filter((s) => s.status === "manufacturer-documented")) {
        expect(`${sec.heading} ${sec.body.join(" ")}`, `${h.id} ${sec.heading}`).not.toMatch(bad);
      }
      expect(a.quickAnswer!.text, h.id).not.toMatch(bad);
      expect(a.diagnosticQuestions.length, h.id).toBe(0);
    }
  });

  it("each quick answer attributes its facts to the maker and says the model is not confirmed", () => {
    for (const h of hardware) {
      const t = byId(h.id).quickAnswer!.text;
      expect(t, h.id).toMatch(/not (yet )?confirmed/i);
      expect(t, h.id).toMatch(/\b(Axia|Telos|Behringer) (says|describes)\b/);
    }
    expect(byId("kb-behringer-ms16").quickAnswer!.text).toMatch(/photo/i);
  });

  it("iQ and QOR.16 articles are not cross-linked, since the sources do not pair them", () => {
    expect(byId("kb-axia-iq-console").relatedArticleIds).not.toContain("kb-axia-qor16");
    expect(byId("kb-axia-qor16").relatedArticleIds).not.toContain("kb-axia-iq-console");
    expect(byId("kb-axia-qor16").relatedArticleIds).toContain("kb-telos-xnode2");
  });

  it("the MS16 article states the page describes a small personal monitor pair while the photo shows wall-mounted speakers", () => {
    const a = byId("kb-behringer-ms16");
    const text = [...a.sections.flatMap((s) => s.body), ...a.openQuestions].join(" ");
    expect(text).toMatch(/personal monitor/i);
    expect(text).toMatch(/home studios/i);
    expect(text).toMatch(/wall-mounted/i);
  });

  it("each is linked from, and links to, its equipment record", () => {
    for (const h of hardware) {
      expect(byId(h.id).equipmentIds, h.id).toContain(h.equipment);
      expect(equipment(h.equipment).relatedArticleIds, h.id).toContain(h.id);
    }
  });

  it("model identifications stay photo observations that the station has not confirmed", () => {
    for (const h of hardware) {
      const a = byId(h.id);
      const own = a.sections.filter((s) => s.status !== "manufacturer-documented").flatMap((s) => s.body).join(" ");
      expect(own, h.id).toMatch(/photo/i);
      expect(own + a.openQuestions.join(" "), h.id).toMatch(/not (been )?confirmed/i);
      expect(a.sections.some((s) => s.status === "station-reported"), h.id).toBe(false);
      expect(a.sections.filter((s) => s.status === "manufacturer-documented").length, h.id).toBeGreaterThan(0);
    }
    expect(byId("kb-behringer-ms16").quickAnswer!.text).not.toMatch(/wall/i);
  });

  it("does not claim the QOR.16 is paired with the iQ console", () => {
    const a = byId("kb-axia-qor16");
    expect(a.openQuestions.join(" ")).toMatch(/iQ/);
    expect(a.quickAnswer!.text).not.toMatch(/\biQ\b/);
  });
});

describe("real content", () => {
  it("still validates", () => {
    expect(validateContent(defaultContent, NOW)).toEqual([]);
  });
});
