import type { ArticleKind, ArticleType, SourceKind } from "@/types";

export const articleTypeLabels: Record<ArticleType, string> = {
  "equipment-guide": "Equipment guide",
  troubleshooting: "Troubleshooting",
  "help-topic": "Help topic",
};

export const articleKindLabels: Record<ArticleKind, string> = {
  informational: "Information only",
  "approved-procedure": "Approved station procedure",
};

export const sourceKindLabels: Record<SourceKind, string> = {
  manufacturer: "Manufacturer documentation",
  station: "Station information",
  photograph: "Station photograph",
  engineer: "Station engineer",
  "development-team": "Radio Technics team",
};
