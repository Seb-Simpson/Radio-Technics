import { articles as allArticles } from "@/data/articles";
import { glossary } from "@/data/glossary";
import { searchConcepts, searchIntents, type SearchIntent } from "@/data/search-vocabulary";
import { getAllEquipment, getEquipmentById, isKnownEquipmentId } from "@/lib/content/equipment";
import { matchEquipment } from "@/lib/troubleshooter/interpret";
import { hasPhrase, normaliseReply, understand } from "@/lib/troubleshooter/understand";
import type { KnowledgeArticle } from "@/types";

/**
 * Knowledge Centre search (RT-003).
 *
 * This is a LOCAL, DETERMINISTIC search: vocabulary and keyword matching with
 * ranking. It is not an AI model and the UI says so. RT-004 can replace or
 * augment it with an LLM-backed retriever by implementing `KnowledgeRetriever`
 * and returning the same `SearchResponse` shape; the safety classification
 * here (urgent silence) must keep running independently of any model.
 */

export interface SearchContext {
  /** Equipment selected in the Studio Explorer, if any. Never invented. */
  selectedEquipmentId: string | null;
  /** Set when the user chose to search without their selection. */
  ignoreSelection?: boolean;
}

export interface SearchInterpretation {
  intentId: string;
  label: string;
  /** The single equipment item this interpretation is about, if any. */
  equipmentId: string | null;
  articleIds: string[];
  topicId?: string;
  score: number;
  reasons: string[];
}

export interface ArticleResult {
  article: KnowledgeArticle;
  score: number;
  reasons: string[];
}

export type SearchStatus = "empty" | "results" | "clarify" | "needs-equipment" | "no-match";

export interface SearchResponse {
  query: string;
  status: SearchStatus;
  /** Always "local-keyword" in RT-003, so the UI never implies a live AI. */
  engine: "local-keyword";
  safety: { urgent: boolean; possibleSilence: boolean };
  context: { equipmentId: string | null; source: "query" | "selection" | null; selectionIgnored: boolean };
  /** Equipment named in the query (may be several if ambiguous). */
  equipmentMatches: string[];
  interpretations: SearchInterpretation[];
  articles: ArticleResult[];
  message?: string;
}

/** Interface for RT-004: an LLM-backed retriever must return the same shape. */
export interface KnowledgeRetriever {
  readonly id: string;
  /** True only for genuine AI models. The UI labels results accordingly. */
  readonly isAI: boolean;
  search(query: string, context: SearchContext): Promise<SearchResponse>;
}

/* ------------------------------------------------------------------ */
/* Text processing                                                     */
/* ------------------------------------------------------------------ */

// Generic problem words carry no topic on their own; symptoms are handled by concepts.
const STOP_WORD_LIST =
  "work working works worked doing done happen happens happened happening anything nothing something problem problems issue issues wrong mean means " +
  "a an the is are was were be been it its it's this that these those to of in on at for and or but with my our your i me we you they he she " +
  "do does did not no can will would should could just still please there here what why how when where which who whom about from by as so if " +
  "then than too very really thing things";
const STOP_WORDS = new Set(STOP_WORD_LIST.split(" "));

/** Very small stemmer: enough for "playing/played/plays" and "speakers/speaker". */
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenise(text: string): string[] {
  return normaliseReply(text)
    .replace(/[,.;!?]/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem);
}

/**
 * A vague reference to "the thing I selected": "it", or "this"/"that" used on
 * its own ("this isn't working") — not "that red square", where it's a determiner.
 */
const VAGUE_REFERENCE = /\bits?\b|\b(this|that)\b(?= (is|was|does|did|will|can|thing|one)\b|$)/;

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

interface FieldText {
  title: string[];
  keywords: string[];
  symptoms: string[];
  summary: string[];
  related: string[];
  body: string[];
}

const fieldCache = new Map<string, FieldText>();
function fieldsFor(article: KnowledgeArticle): FieldText {
  const cached = fieldCache.get(article.id);
  if (cached) return cached;
  const equipmentText = article.equipmentIds.flatMap((id) => {
    const record = getEquipmentById(id);
    return record ? [record.name, ...record.aliases] : [];
  });
  const glossaryText = article.glossaryTermIds.flatMap((id) => {
    const term = glossary.find((t) => t.id === id);
    return term ? [term.term, ...term.aliases] : [];
  });
  const fields: FieldText = {
    title: tokenise(article.title),
    keywords: tokenise(article.keywords.join(" ")),
    symptoms: tokenise(article.symptoms.join(" ")),
    summary: tokenise(article.summary),
    related: tokenise([...equipmentText, ...glossaryText].join(" ")),
    body: tokenise(article.sections.flatMap((s) => [s.heading, ...s.body]).join(" ")),
  };
  fieldCache.set(article.id, fields);
  return fields;
}

const FIELD_WEIGHTS: Record<keyof FieldText, number> = { title: 5, keywords: 4, symptoms: 4, summary: 3, related: 2, body: 1 };

/** Lexical score: weighted matches of query terms in article fields. */
function lexicalScore(article: KnowledgeArticle, terms: string[]): { score: number; matched: string[] } {
  if (terms.length === 0) return { score: 0, matched: [] };
  const fields = fieldsFor(article);
  let score = 0;
  const matched: string[] = [];
  for (const term of new Set(terms)) {
    let best = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS) as [keyof FieldText, number][]) {
      if (fields[field].includes(term)) best = Math.max(best, weight);
    }
    if (best > 0) {
      score += best;
      matched.push(term);
    }
  }
  return { score, matched };
}

function conceptsIn(normalised: string, audio: "present" | "absent" | null): Set<string> {
  // Pronouns are dropped so "why is not it working" still contains "not working".
  const text = normalised.replace(/\b(it|this|that|they|its)\b/g, " ").replace(/\s+/g, " ").trim();
  const found = new Set<string>();
  for (const concept of searchConcepts) {
    // Problem descriptions are usually negative ("can't hear myself"), so negation is not filtered here…
    if (concept.phrases.some((p) => hasPhrase(text, normaliseReply(p)))) found.add(concept.id);
  }
  // …except for sound: "it's not silent" means sound IS present, so it isn't a no-audio problem.
  if (audio === "present") found.delete("no-audio");
  return found;
}

function matchesIntent(intent: SearchIntent, concepts: Set<string>): string[] | null {
  if (intent.exclude?.some((c) => concepts.has(c))) return null;
  let best: string[] | null = null;
  for (const set of intent.match) {
    if (set.every((c) => concepts.has(c)) && (!best || set.length > best.length)) best = set;
  }
  return best;
}

function interpretIntents(concepts: Set<string>, knownEquipment: Set<string>, fromSelection: boolean) {
  const interpretations: SearchInterpretation[] = [];
  let equipmentNeeded = false;
  for (const intent of searchIntents) {
    const set = matchesIntent(intent, concepts);
    if (!set) continue;
    const overlap = intent.equipmentIds.filter((id) => knownEquipment.has(id));
    if (intent.requiresEquipment && overlap.length === 0) {
      equipmentNeeded ||= knownEquipment.size === 0 && (concepts.has("unresponsive") || concepts.has("not-playing"));
      continue;
    }
    // A query about specific equipment should not be read as being about different equipment.
    if (knownEquipment.size > 0 && intent.equipmentIds.length > 0 && overlap.length === 0) continue;
    const reasons = [`matched “${set.join(" + ")}”`];
    let score = 3 * set.length + (intent.requiresEquipment ? 1 : 0);
    if (overlap.length > 0) {
      score += 2;
      reasons.push(fromSelection ? "uses the equipment selected in the Studio Explorer" : "matches the equipment you named");
    }
    interpretations.push({
      intentId: intent.id,
      label: intent.label,
      equipmentId: intent.focusEquipmentId ?? overlap[0] ?? (intent.equipmentIds.length === 1 ? intent.equipmentIds[0]! : null),
      articleIds: intent.articleIds,
      topicId: intent.topicId,
      score,
      reasons,
    });
  }
  return { interpretations, equipmentNeeded };
}

/** "myriad's frozen" → "myriad is frozen", so equipment names survive normalisation. */
function expandNounIs(text: string): string {
  return text.replace(/\b([a-z]{3,})['\u2019]s\b/gi, (match, word: string) =>
    ["it", "that", "there", "what", "who", "here", "nothing", "everything", "something", "someone", "somebody"].includes(word.toLowerCase()) ? match : `${word} is`,
  );
}

/** "red square", "green box"… are screen indicators, not the green button. */
const COLOUR_SHAPE = /\b(red|green|blue|yellow|orange|amber|grey|gray|white|black)\s+(square|squares|box|boxes|light|lights|bit|dot|dots|circle|icon|symbol|bar|block|line|tick)\b/gi;

/** Longest query processed at all; longer ones are refused, never silently cut (RT-002D-R1). */
export const MAX_QUERY_LENGTH = 500;

export function searchKnowledge(rawQuery: string, context: SearchContext, source: KnowledgeArticle[] = allArticles): SearchResponse {
  const full = rawQuery.trim();
  // Ranking only looks at the first 300 characters; safety (below) reads the whole query.
  const query = expandNounIs(full.slice(0, 300));
  const base = {
    query,
    engine: "local-keyword" as const,
    safety: { urgent: false, possibleSilence: false },
    context: { equipmentId: null, source: null, selectionIgnored: Boolean(context.ignoreSelection) } as SearchResponse["context"],
    equipmentMatches: [] as string[],
    interpretations: [] as SearchInterpretation[],
    articles: [] as ArticleResult[],
  };
  if (!query) return { ...base, status: "empty" };
  if (full.length > MAX_QUERY_LENGTH) {
    return {
      ...base,
      status: "no-match",
      message: `That search is ${full.length} characters long; the limit is ${MAX_QUERY_LENGTH}. Please shorten it \u2014 none of it has been used. If the station is off air, use the \u201cWe're off air\u201d button.`,
    };
  }

  // 1. Safety first, on the WHOLE query, independent of ranking (same classifier as the troubleshooter).
  const u = understand(full);
  const concern = u.broadcast.status === "current-confirmed" || u.broadcast.status === "current-possible";
  const safety = {
    urgent: concern,
    possibleSilence: !concern && (u.signals.includes("silence") || u.signals.includes("on-air-unknown")),
  };

  const normalised = normaliseReply(query);
  const concepts = conceptsIn(normalised, u.audio);
  const terms = tokenise(query);

  // 2. Equipment: from the query first. The Studio selection is only used when the
  //    query refers to something vaguely ("why isn't IT working?"), or as a fallback
  //    when a symptom alone matches nothing. It is never invented.
  const named = matchEquipment(query.replace(COLOUR_SHAPE, " indicator ")).equipmentIds;
  const vagueReference = VAGUE_REFERENCE.test(normalised.replace(/[,.;!?]/g, " ").replace(/\s+/g, " ").trim());
  const selected =
    !context.ignoreSelection && named.length === 0 && context.selectedEquipmentId && isKnownEquipmentId(context.selectedEquipmentId)
      ? context.selectedEquipmentId
      : null;
  const symptomOnly = ["unresponsive", "not-playing", "stuck", "no-audio"].some((c) => concepts.has(c));

  let usedSelection = Boolean(selected && vagueReference);
  let pass = interpretIntents(concepts, new Set(named.length > 0 ? named : usedSelection ? [selected!] : []), usedSelection);
  if (pass.interpretations.length === 0 && selected && !usedSelection && symptomOnly) {
    usedSelection = true;
    pass = interpretIntents(concepts, new Set([selected]), true);
  } else if (pass.interpretations.length === 0 && usedSelection) {
    // The selection didn't fit what was asked; don't force it.
    const without = interpretIntents(concepts, new Set(), false);
    if (without.interpretations.length > 0) {
      usedSelection = false;
      pass = without;
    }
  }
  const knownEquipment = new Set(named.length > 0 ? named : usedSelection ? [selected!] : []);
  const ctx: SearchResponse["context"] = {
    equipmentId: named.length === 1 ? named[0]! : usedSelection ? selected : null,
    source: named.length === 1 ? "query" : usedSelection ? "selection" : null,
    selectionIgnored: Boolean(context.ignoreSelection && context.selectedEquipmentId),
  };
  const { equipmentNeeded } = pass;
  let interpretations = pass.interpretations;
  // A confirmed off-air report is not diluted with less urgent readings.
  if (safety.urgent) interpretations = interpretations.filter((i) => i.intentId === "silence-on-air");
  // Naming equipment alone ("mixer") still finds its articles and troubleshooting.
  if (interpretations.length === 0 && knownEquipment.size === 1) {
    const id = [...knownEquipment][0]!;
    const record = getEquipmentById(id)!;
    const related = [...record.relatedArticleIds, ...source.filter((a) => a.equipmentIds.includes(id)).map((a) => a.id)];
    interpretations = [
      {
        intentId: `equipment:${id}`,
        label: `About the ${record.shortName}`,
        equipmentId: id,
        articleIds: [...new Set(related)],
        score: 3,
        reasons: [usedSelection ? "uses the equipment selected in the Studio Explorer" : "matches the equipment you named"],
      },
    ];
  }
  interpretations.sort((a, b) => b.score - a.score);
  const top = interpretations[0]?.score ?? 0;
  const plausible = interpretations.filter((i) => i.score >= top * 0.8);

  // 4. Articles: from plausible interpretations, plus lexical matches, plus equipment relevance.
  const scores = new Map<string, ArticleResult>();
  const bump = (article: KnowledgeArticle, amount: number, reason: string) => {
    const entry = scores.get(article.id) ?? { article, score: 0, reasons: [] };
    entry.score += amount;
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    scores.set(article.id, entry);
  };
  for (const interp of plausible) {
    interp.articleIds.forEach((id, i) => {
      const article = source.find((a) => a.id === id);
      if (article) bump(article, interp.score + 4 - i, `suggested for “${interp.label}”`);
    });
  }
  for (const article of source) {
    const { score, matched } = lexicalScore(article, terms);
    // Require a meaningful lexical match on its own (two terms, or one strong field match).
    if (score >= 4 || (scores.has(article.id) && score > 0)) bump(article, score, `mentions ${matched.slice(0, 3).join(", ")}`);
  }
  for (const id of knownEquipment) {
    for (const entry of scores.values()) {
      if (entry.article.equipmentIds.includes(id)) bump(entry.article, 2, `about the ${getEquipmentById(id)?.shortName ?? "equipment"}`);
    }
  }
  const ranked = [...scores.values()].sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title));

  // 5. Status.
  let status: SearchStatus;
  let message: string | undefined;
  if (plausible.length > 1) {
    status = "clarify";
    message = "This could mean a few different things. Choose the closest, or open an article below.";
  } else if (plausible.length === 1 || ranked.length > 0) {
    status = "results";
  } else if (equipmentNeeded || (named.length === 0 && concepts.has("unresponsive"))) {
    status = "needs-equipment";
    message = "Which piece of equipment do you mean? Choose it below or select it in the Studio Explorer.";
  } else {
    status = "no-match";
    message = "Radio Technics has no article that matches this, and it won't guess an answer. Try different words, browse the categories, or use the troubleshooter.";
  }
  if (named.length > 1 && status !== "clarify") {
    message = `Your search mentions more than one piece of equipment (${named.map((id) => getEquipmentById(id)?.name).join(", ")}).`;
  }

  return { ...base, status, message, safety, context: ctx, equipmentMatches: named, interpretations: plausible, articles: ranked };
}

/** The local retriever wrapped in the RT-004 interface. */
export const localKnowledgeRetriever: KnowledgeRetriever = {
  id: "local-keyword",
  isAI: false,
  search: (query, context) => Promise.resolve(searchKnowledge(query, context)),
};

/** Equipment suggestions offered when a query needs equipment but none is known. */
export function equipmentChoices(): { id: string; name: string }[] {
  return getAllEquipment().map((e) => ({ id: e.id, name: e.name }));
}
