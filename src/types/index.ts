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
export type VerificationStatus = "verified" | "station-reported" | "draft";

export interface Fact {
  text: string;
  status: VerificationStatus;
  /** Where the information came from (e.g. a photograph or a station message). */
  source?: string;
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
}

/* ------------------------------------------------------------------ */
/* Knowledge Centre                                                    */
/* ------------------------------------------------------------------ */

export type ArticleType = "equipment-guide" | "troubleshooting" | "help-topic";

export interface ArticleSection {
  heading: string;
  body: string[];
  status: VerificationStatus;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  type: ArticleType;
  summary: string;
  equipmentIds: string[];
  status: VerificationStatus;
  /** ISO date of the last engineer review, or null if never reviewed. */
  lastReviewed: string | null;
  keywords: string[];
  sections: ArticleSection[];
}
