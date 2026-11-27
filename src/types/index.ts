/**
 * Shared domain types for Radio Technics.
 *
 * Content (equipment, photos, hotspots, articles, flows) is kept as
 * structured records. Records reference each other by ID only — never by
 * copying content — so a future database or CMS can replace the static
 * data files without changing the UI.
 */

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

/**
 * How trustworthy a piece of information is.
 *
 * - `verified`         Confirmed in writing by the station engineer.
 * - `station-reported` Reported by station staff; engineer has not yet confirmed.
 * - `draft`            Written by the development team; must not be treated as procedure.
 */
export type VerificationStatus = "verified" | "manufacturer-documented" | "station-reported" | "draft";

/*
 * Levels of authority, from strongest to weakest for THIS studio:
 *   verified                — engineer-approved station information/instruction
 *   station-reported        — the station has described its setup
 *   manufacturer-documented — the manufacturer describes a feature in general
 *   draft                   — written by the development team / unconfirmed
 * Manufacturer documentation explains how a product generally behaves. It
 * never authorises operating or changing the station's equipment.
 */

/**
 * Evidence that the station engineer reviewed something. Required for
 * anything marked `verified`; validated by validateContent().
 */
export interface ReviewRecord {
  /** Name or role of the engineer who reviewed it. */
  reviewer: string;
  /** Calendar date of the review, YYYY-MM-DD. */
  date: string;
  /** Where the confirmation came from (e.g. "Engineer walkthrough", "Email from engineer"). */
  source: string;
}

export interface Fact {
  text: string;
  status: VerificationStatus;
  /** Where the information came from (e.g. a photograph or a station message). Required when station-reported. */
  source?: string;
  review?: ReviewRecord;
}

/* ------------------------------------------------------------------ */
/* Equipment                                                           */
/* ------------------------------------------------------------------ */

export type EquipmentCategoryId =
  | "mixing"
  | "microphones"
  | "playout"
  | "monitoring"
  | "video"
  | "technical";

export interface EquipmentCategory {
  id: EquipmentCategoryId;
  name: string;
  description: string;
}

export interface EquipmentRecord {
  /** Stable, unique, kebab-case ID. Hotspots, articles and flows refer to this. */
  id: string;
  name: string;
  /** Short label used on hotspots and chips. */
  shortName: string;
  category: EquipmentCategoryId;
  description: string;
  primaryFunction: Fact;
  /**
   * Plain-English phrase completing "the {shortName} that …".
   * Used when the troubleshooter asks the user to confirm which item they mean.
   */
  confirmationPhrase: string;
  knownInformation: Fact[];
  /** Problems a presenter might report, phrased as symptoms — never as diagnoses. */
  commonProblems: string[];
  /** Open questions that need an answer from the station engineer. */
  requiresVerification: string[];
  /**
   * Lower-case words/phrases presenters may use for this item.
   * Used by the deterministic prototype interpreter.
   */
  aliases: string[];
  relatedArticleIds: string[];
  /** Troubleshooting flow to start when this equipment is confirmed. */
  flowEntryNodeId?: string;
}

/* ------------------------------------------------------------------ */
/* Studio views and hotspots                                           */
/* ------------------------------------------------------------------ */

export type StudioViewKind = "photo" | "diagram";

export interface StudioView {
  id: string;
  title: string;
  description: string;
  kind: StudioViewKind;
  /** Path under /public for photos. Diagrams are rendered inline. */
  src?: string;
  /** Intrinsic pixel dimensions — used to keep hotspots aligned at any size. */
  width: number;
  height: number;
  alt: string;
  /** True when the view does NOT depict the real studio. */
  illustrative: boolean;
}

/** A rectangle expressed as fractions (0–1) of the image width/height. */
export interface HotspotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Hotspot {
  id: string;
  viewId: string;
  equipmentId: string;
  region: HotspotRegion;
  /** True when the position has not been checked against a real photograph. */
  placeholder: boolean;
  /** Whether the station has confirmed that this hotspot shows this equipment record. */
  identity: VerificationStatus;
  /** How the item was identified, or what is uncertain about it. */
  note?: string;
  review?: ReviewRecord;
}

/* ------------------------------------------------------------------ */
/* Knowledge Centre                                                    */
/* ------------------------------------------------------------------ */

export type ArticleType = "equipment-guide" | "troubleshooting" | "help-topic";

/**
 * `informational` explains things. `approved-procedure` gives steps a
 * presenter may follow — only allowed when engineer-verified with a review.
 */
export type ArticleKind = "informational" | "approved-procedure";

export type SourceKind = "manufacturer" | "station" | "photograph" | "engineer" | "development-team";

export interface SourceReference {
  /** Unique within the article. Sections cite sources by this ID. */
  id: string;
  title: string;
  url?: string;
  publisher: string;
  kind: SourceKind;
  /**
   * YYYY-MM-DD when someone actually read the source for this article, or
   * null if it is only listed for future reading. A manufacturer source must
   * have been read before anything can be marked manufacturer-documented.
   */
  retrievedOn: string | null;
  /** Product the source documents (e.g. "Myriad 6"); used for the "From the … manual" label. */
  product?: string;
  /** What kind of page a manufacturer source is. Absent means "manual". */
  documentType?: "manual" | "product-page";
  note?: string;
}

export interface ArticleRevision {
  date: string;
  author: string;
  summary: string;
}

export interface ArticleSection {
  heading: string;
  body: string[];
  status: VerificationStatus;
  /** Sources supporting this section (IDs from the article's `sources`). */
  sourceIds?: string[];
  /** Defaults to the article's review when omitted. */
  review?: ReviewRecord;
}

export interface SoftwareApplicability {
  product: string;
  versions: string[];
  /** Station-reported configuration, e.g. "Live Assist mode". */
  stationConfiguration?: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  aliases: string[];
  /** Plain-English explanation. */
  definition: string;
  status: VerificationStatus;
  /** Where the explanation comes from. */
  source: string;
  relatedEquipmentIds: string[];
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  type: ArticleType;
  summary: string;
  equipmentIds: string[];
  status: VerificationStatus;
  /** The engineer's review. Required when the article is `verified`. */
  review?: ReviewRecord;
  keywords: string[];
  sections: ArticleSection[];
  /** Browsing category: an equipment category or general help. */
  category: EquipmentCategoryId | "general";
  kind: ArticleKind;
  software?: SoftwareApplicability;
  /** How presenters might describe the problem, in their own words. */
  symptoms: string[];
  /** Questions that help narrow the problem down. Each ends with "?". */
  diagnosticQuestions: string[];
  /** Unresolved technical questions — shown separately from guidance. */
  openQuestions: string[];
  sources: SourceReference[];
  relatedArticleIds: string[];
  /** Troubleshooting topics (src/data/troubleshooting-flows.ts) this article relates to. */
  relatedTopicIds: string[];
  glossaryTermIds: string[];
  /** Newest last. */
  revisions: ArticleRevision[];
  /** A short, labelled answer shown ahead of the full article. */
  quickAnswer?: QuickAnswer;
}

export interface QuickAnswer {
  text: string;
  status: VerificationStatus;
  /** IDs of the article's `sources` this answer is taken from. */
  sourceIds: string[];
}
