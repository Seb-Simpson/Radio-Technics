/** RT-003 intelligent (local, non-AI) search. */
import { describe, expect, it } from "vitest";
import { articles } from "@/data/articles";
import { searchConcepts, searchIntents } from "@/data/search-vocabulary";
import { troubleshootingTopics } from "@/data/troubleshooting-flows";
import { isKnownEquipmentId } from "@/lib/content/equipment";
import { localKnowledgeRetriever, searchKnowledge, stem, tokenise } from "@/lib/knowledge/search-engine";
import { createConversation, respond } from "@/lib/troubleshooter/engine";

const none = { selectedEquipmentId: null };
const search = (q: string, selectedEquipmentId: string | null = null, ignoreSelection = false) => searchKnowledge(q, { selectedEquipmentId, ignoreSelection });
const intents = (q: string, sel: string | null = null) => search(q, sel).interpretations.map((i) => i.intentId);
const topArticles = (q: string, sel: string | null = null, n = 3) => search(q, sel).articles.slice(0, n).map((a) => a.article.id);

describe("1. common presenter phrasing", () => {
  it.each([
    ["The next song won't play.", "next-song-wont-play", "ts-next-song-wont-play"],
    ["It's stuck on the same song.", "myriad-unresponsive", "kb-myriad-playback-status"],
    ["Myriad isn't doing anything.", "myriad-unresponsive", "kb-myriad-playback-status"],
    ["The green button stopped working.", "green-button-not-working", "guide-green-button"],
    ["Nothing's coming out.", "silence-on-air", "kb-audio-output"],
    ["I can't hear myself.", "cant-hear-myself", "ts-microphone-not-heard"],
    ["The screen looks weird.", "myriad-screen-odd", "kb-myriad-screen"],
    ["What does that red square mean?", "indicator-meaning", "kb-myriad-screen"],
    // Alternative phrasings
    ["the track won't start", "next-song-wont-play", "ts-next-song-wont-play"],
    ["myriad's frozen", "myriad-unresponsive", "kb-myriad-playback-status"],
    ["pressed the green thing and nothing happened", "green-button-not-working", "guide-green-button"],
    ["there's no sound", "silence-on-air", "kb-audio-output"],
    ["what's the green box next to the song?", "indicator-meaning", "kb-myriad-screen"],
    ["is it on automatic?", "live-assist", "kb-myriad-live-assist"],
    ["it stopped by itself", "stop-chain", "kb-myriad-stop-chains"],
    ["what's playing right now", "now-playing", "kb-myriad-now-playing"],
    ["a lead has come out", "cable", "help-cables"],
  ])("%j → %s", (query, intent, article) => {
    expect(intents(query)).toContain(intent);
    expect(topArticles(query, null, 4)).toContain(article);
  });
});

describe("2. equipment synonyms", () => {
  it.each([
    ["mixer", "mixing-console"],
    ["the desk", "mixing-console"],
    ["cans", "headphone-monitoring"],
    ["playout", "myriad-playout"],
    ["webcam", "zoom-camera"],
    ["the PPM meters", "audio-level-meters"],
  ])("%j resolves to %s", (query, equipmentId) => {
    const r = search(query);
    expect(r.context).toMatchObject({ equipmentId, source: "query" });
    expect(r.interpretations[0]?.equipmentId).toBe(equipmentId);
    expect(r.articles.length).toBeGreaterThan(0);
  });

  it("stems simple word forms", () => {
    expect(stem("playing")).toBe("play");
    expect(stem("speakers")).toBe("speaker");
    expect(tokenise("What's playing on the speakers?")).toEqual(["play", "speaker"]);
  });
});

describe("3. ambiguity gives several plausible readings", () => {
  it.each([
    ["Nothing's coming out.", ["silence-on-air", "no-sound-headphones", "no-sound-speakers"]],
    ["the track won't start", ["next-song-wont-play", "myriad-unresponsive"]],
    ["The screen looks weird.", ["myriad-screen-odd", "computer-screen-odd"]],
  ])("%j → clarify", (query, expected) => {
    const r = search(query);
    expect(r.status).toBe("clarify");
    expect(r.interpretations.map((i) => i.intentId)).toEqual(expect.arrayContaining(expected));
    expect(r.message).toMatch(/few different things/);
  });

  it("a clear general reading wins over near-duplicates", () => {
    const r = search("The next song won't play.");
    expect(r.status).toBe("results");
    expect(r.interpretations[0]?.intentId).toBe("next-song-wont-play");
    // Its top article asks whether the green button or the Myriad screen was used.
    expect(r.articles[0]?.article.diagnosticQuestions.join(" ")).toMatch(/green button or the Myriad screen/);
  });

  it("a symptom with no subject asks which equipment", () => {
    const r = search("Why isn't it working?");
    expect(r.status).toBe("needs-equipment");
    expect(r.articles).toEqual([]);
    expect(r.context.equipmentId).toBeNull();
  });
});

describe("4. unknown questions", () => {
  it.each(["how do I make a cup of tea", "what's the weather in Hertford", "zxqv"])("%j → honest no-match", (query) => {
    const r = search(query);
    expect(r.status).toBe("no-match");
    expect(r.articles).toEqual([]);
    expect(r.interpretations).toEqual([]);
    expect(r.message).toMatch(/won't guess/);
  });

  it("empty input is not searched", () => {
    expect(search("   ").status).toBe("empty");
  });

  it("is labelled as local keyword search, never AI", async () => {
    expect(search("mixer").engine).toBe("local-keyword");
    expect(localKnowledgeRetriever.isAI).toBe(false);
    expect((await localKnowledgeRetriever.search("mixer", none)).status).toBe("results");
  });
});

describe("5. selected equipment as context", () => {
  it("uses the selection for vague questions, and says so", () => {
    const r = search("Why isn't it working?", "green-next-button");
    expect(r.context).toMatchObject({ equipmentId: "green-next-button", source: "selection" });
    expect(r.interpretations[0]).toMatchObject({ intentId: "green-button-not-working" });
    expect(r.interpretations[0]!.reasons.join(" ")).toMatch(/selected in the Studio Explorer/);
  });

  it("does not use the selection when the query names other equipment", () => {
    const r = search("the mixer isn't working", "green-next-button");
    expect(r.context).toMatchObject({ equipmentId: "mixing-console", source: "query" });
  });

  it("does not force the selection onto an unrelated question", () => {
    const r = search("What does that red square mean?", "green-next-button");
    expect(r.context.source).toBeNull();
    expect(r.interpretations[0]?.intentId).toBe("indicator-meaning");
  });

  it("can be ignored on request, and never invents context", () => {
    expect(search("Why isn't it working?", "green-next-button", true)).toMatchObject({ status: "needs-equipment", context: { selectionIgnored: true, equipmentId: null } });
    expect(search("Why isn't it working?", "toaster").context.equipmentId).toBeNull();
  });
});

describe("6–7. results link to valid articles, equipment and topics", () => {
  it("every intent references real articles, equipment and topics", () => {
    const articleIds = new Set(articles.map((a) => a.id));
    const topicIds = new Set(troubleshootingTopics.map((t) => t.id));
    const conceptIds = new Set(searchConcepts.map((c) => c.id));
    for (const intent of searchIntents) {
      for (const id of intent.articleIds) expect(articleIds.has(id), `${intent.id} → ${id}`).toBe(true);
      for (const id of intent.equipmentIds) expect(isKnownEquipmentId(id), `${intent.id} → ${id}`).toBe(true);
      if (intent.topicId) expect(topicIds.has(intent.topicId), intent.id).toBe(true);
      for (const set of intent.match) for (const c of set) expect(conceptIds.has(c), `${intent.id} → ${c}`).toBe(true);
    }
  });

  it("search results only ever contain known articles and equipment", () => {
    for (const q of ["next song", "mixer", "nothing's coming out", "red square", "the screen looks weird", "why isn't it working"]) {
      const r = search(q, "green-next-button");
      for (const a of r.articles) expect(articles).toContain(a.article);
      for (const i of r.interpretations) if (i.equipmentId) expect(isKnownEquipmentId(i.equipmentId)).toBe(true);
    }
  });
});

describe("11. urgent-silence protection still applies", () => {
  it("search flags confirmed silence as urgent and keeps only the urgent reading", () => {
    const r = search("We're off air!");
    expect(r.safety.urgent).toBe(true);
    expect(r.interpretations.map((i) => i.intentId)).not.toContain("play-next-song");
  });

  it("possible silence is flagged without being treated as confirmed", () => {
    expect(search("Nothing's coming out").safety).toEqual({ urgent: false, possibleSilence: true });
    expect(search("it's not silent").safety).toEqual({ urgent: false, possibleSilence: false });
  });

  it("the troubleshooter's urgent path is unchanged", () => {
    const s = respond(createConversation(), { type: "text", text: "Can someone help me? We're off air." }, none).state;
    expect(s.urgent).toBe(true);
  });
});

describe("quick answers found by asking naturally (Phase 1)", () => {
  it.each([
    ["how do i play the next song", "kb-myriad-next-item"],
    ["how do I play the next song?", "kb-myriad-next-item"],
    ["what do the red squares mean", "kb-myriad-screen"],
    ["what do the colours mean", "kb-myriad-screen"],
    ["what are the icons in the log", "kb-myriad-screen"],
    ["what is live assist", "kb-myriad-live-assist"],
  ])("%j finds %s first, with a quick answer", (query, id) => {
    const top = search(query).articles[0]!;
    expect(top.article.id).toBe(id);
    expect(top.quickAnswer).toBe(top.article.quickAnswer!.text);
  });

  it("results without a quick answer carry none", () => {
    const withoutQuick = search("cable").articles.find((r) => !r.article.quickAnswer);
    expect(withoutQuick?.quickAnswer).toBeUndefined();
  });

  it("PROGRAM 1 / MONITOR finds only the article that already mentions those labels", () => {
    const r = search("what does PROGRAM 1 mean");
    expect(r.articles[0]?.article.id).toBe("kb-audio-output");
    expect(r.safety).toEqual({ urgent: false, possibleSilence: false });
  });

  it("silence handling is unchanged when combined with a how-to question", () => {
    const r = search("we're off air, how do I play the next song");
    expect(r.safety.urgent).toBe(true);
    expect(r.interpretations.map((i) => i.intentId)).not.toContain("play-next-song");
  });
});
