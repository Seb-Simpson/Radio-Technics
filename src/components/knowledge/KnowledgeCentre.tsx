"use client";

import { ArrowRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { VerificationBadge, verificationLabels } from "@/components/ui/VerificationBadge";
import { getEquipmentById } from "@/lib/content/equipment";
import { cn } from "@/lib/cn";
import { articleTypeLabels } from "@/lib/knowledge/labels";
import { searchArticles } from "@/lib/knowledge/search";
import type { ArticleType, VerificationStatus } from "@/types";

const typeFilters: { value: ArticleType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "equipment-guide", label: "Equipment guides" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "help-topic", label: "Help topics" },
];

const statusFilters: (VerificationStatus | "all")[] = ["all", "verified", "station-reported", "draft"];

export function KnowledgeCentre() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ArticleType | "all">("all");
  const [status, setStatus] = useState<VerificationStatus | "all">("all");
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => searchArticles({ query: deferredQuery, type, status }), [deferredQuery, type, status]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <label htmlFor="knowledge-search" className="sr-only">
            Search help topics
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input
            id="knowledge-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — for example “microphone” or “green button”"
            className="h-12 w-full rounded-lg border border-ink-600 bg-ink-850 pr-10 pl-10 text-[15px] text-ink-50 placeholder:text-ink-400 focus:border-signal-500/70 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterGroup label="Type">
            {typeFilters.map((filter) => (
              <FilterChip key={filter.value} active={type === filter.value} onClick={() => setType(filter.value)}>
                {filter.label}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label="Verification">
            {statusFilters.map((value) => (
              <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
                {value === "all" ? "Any" : verificationLabels[value].label}
              </FilterChip>
            ))}
          </FilterGroup>
        </div>
      </div>

      <p aria-live="polite" className="text-[13px] text-ink-400">
        {results.length === 1 ? "1 article" : `${results.length} articles`}
      </p>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-600 px-6 py-10 text-center">
          <p className="font-medium text-ink-100">No articles match</p>
          <p className="mt-1 text-sm text-ink-400">Try a simpler word, or clear the filters. You can also ask the Troubleshooter.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {results.map((article) => (
            <li key={article.id}>
              <Link
                href={`/knowledge/${article.id}`}
                className="group flex h-full flex-col gap-2 rounded-xl border border-ink-750 bg-ink-900 p-4 transition-colors hover:border-ink-500 hover:bg-ink-850"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-ink-400 uppercase">
                    {articleTypeLabels[article.type]}
                  </span>
                  <VerificationBadge status={article.status} />
                </div>
                <h2 className="flex items-center gap-1.5 font-medium text-ink-50">
                  {article.title}
                  <ArrowRight aria-hidden className="size-3.5 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-signal-400" />
                </h2>
                <p className="text-sm leading-relaxed text-ink-300">{article.summary}</p>
                {article.equipmentIds.length > 0 && (
                  <p className="mt-auto pt-1 text-[12px] text-ink-400">
                    {article.equipmentIds.length > 3
                      ? `${article.equipmentIds.length} equipment items`
                      : article.equipmentIds.map((id) => getEquipmentById(id)?.name).filter(Boolean).join(" · ")}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] text-ink-400">{label}</span>
      {children}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[13px] transition-colors",
        active ? "border-signal-500/50 bg-signal-900/60 text-signal-300" : "border-ink-700 bg-ink-850 text-ink-300 hover:text-ink-100",
      )}
    >
      {children}
    </button>
  );
}
