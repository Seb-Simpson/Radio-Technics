"use client";

import { ArrowRight, BookA, Crosshair, MessageSquare, Search, TriangleAlert, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { QuickAnswer } from "@/components/knowledge/QuickAnswer";
import { SourceLabel } from "@/components/knowledge/SourceLabel";
import { buttonStyles } from "@/components/ui/button-styles";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { articles as allArticles } from "@/data/articles";
import { getCategories, getEquipmentById } from "@/lib/content/equipment";
import { cn } from "@/lib/cn";
import { manualLabel } from "@/lib/knowledge/manual-label";
import { articleKindLabels, articleTypeLabels } from "@/lib/knowledge/labels";
import { equipmentChoices, searchKnowledge, type SearchInterpretation } from "@/lib/knowledge/search-engine";
import { useTroubleshooter } from "@/lib/troubleshooter/TroubleshooterProvider";
import { showEquipmentCommands } from "@/lib/workspace/commands";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";
import type { KnowledgeArticle } from "@/types";

export function KnowledgeCentre() {
  const [query, setQuery] = useState("");
  const [ignoreSelection, setIgnoreSelection] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const { state: workspace, run } = useWorkspace();
  const { handoff } = useTroubleshooter();
  const router = useRouter();
  const selected = getEquipmentById(workspace.selectedEquipmentId);
  /**
   * RT-002D-R1: carry the search's safety content into the troubleshooter. The
   * troubleshooter re-checks the text itself and never treats it as an answer.
   */
  const openTroubleshooterWithSafety = () => {
    handoff(deferredQuery);
    router.push("/troubleshooter");
  };

  const response = useMemo(
    () => searchKnowledge(deferredQuery, { selectedEquipmentId: workspace.selectedEquipmentId, ignoreSelection }),
    [deferredQuery, workspace.selectedEquipmentId, ignoreSelection],
  );

  /** Only the top result shows its quick answer inline; it is never shown for a lower-ranked article. */
  const topResult = response.articles[0]?.article;
  const topWithQuick = topResult?.quickAnswer ? topResult : undefined;

  return (
    <div className="flex flex-col gap-5">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-2">
        <label htmlFor="knowledge-search" className="text-sm font-medium text-ink-100">
          Describe the problem, or search for a topic
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input
            id="knowledge-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="For example: “It’s stuck on the same song”"
            aria-describedby="knowledge-search-note"
            className="h-12 w-full rounded-lg border border-ink-600 bg-ink-850 pr-10 pl-10 text-[15px] text-ink-50 placeholder:text-ink-400 focus:border-signal-500/70 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
        <p id="knowledge-search-note" className="text-[12px] text-ink-400">
          Keyword search with a presenter vocabulary — not an AI. It only suggests articles that exist and won&apos;t invent answers.
        </p>
      </form>

      {selected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-[13px]">
          <p className="text-ink-200">
            {ignoreSelection ? "Not using your selection:" : "Using your Studio Explorer selection when a question is vague:"}{" "}
            <span className="font-medium text-ink-50">{selected.name}</span>
          </p>
          <button
            type="button"
            aria-pressed={ignoreSelection}
            onClick={() => setIgnoreSelection((v) => !v)}
            className={buttonStyles({ variant: "ghost", size: "sm", className: "h-8" })}
          >
            {ignoreSelection ? "Use selection" : "Don't use selection"}
          </button>
        </div>
      )}

      {query.trim() === "" ? (
        <BrowseByCategory />
      ) : (
        <section aria-label="Search results" aria-live="polite" className="flex flex-col gap-4">
          {response.safety.urgent && (
            <div role="alert" className="flex gap-3 rounded-lg border border-alert-400/50 bg-alert-900/50 px-4 py-3 text-sm">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-alert-300" />
              <div>
                <p className="font-semibold text-alert-300">This sounds like silence on air — treat it as urgent.</p>
                <p className="mt-0.5 text-ink-100">Contact technical support now. The troubleshooter will record what happened for them.</p>
                <button type="button" onClick={openTroubleshooterWithSafety} className={buttonStyles({ variant: "primary", size: "sm", className: "mt-2" })}>
                  Open the troubleshooter
                </button>
              </div>
            </div>
          )}
          {response.safety.possibleSilence && (
            <div className="flex gap-3 rounded-lg border border-caution-400/30 bg-caution-900/40 px-4 py-3 text-sm text-ink-100">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-caution-400" />
              <div>
                <p>If listeners may be hearing nothing, don&apos;t search — use the troubleshooter now; possible silence on air is treated as urgent.</p>
                <button type="button" onClick={openTroubleshooterWithSafety} className={buttonStyles({ size: "sm", className: "mt-2" })}>
                  Check this in the troubleshooter
                </button>
              </div>
            </div>
          )}

          {response.context.source === "selection" && (
            <p className="text-[13px] text-ink-300">
              Your question doesn&apos;t name any equipment, so these results use your selection:{" "}
              <span className="font-medium text-ink-100">{getEquipmentById(response.context.equipmentId)?.name}</span>.
            </p>
          )}

          {response.message && <p className="text-sm text-ink-200">{response.message}</p>}

          {response.status === "needs-equipment" && (
            <ul aria-label="Choose equipment" className="flex flex-wrap gap-2">
              {equipmentChoices().map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setIgnoreSelection(false);
                      run([{ type: "select_equipment", equipmentId: e.id }]);
                    }}
                    className="min-h-10 rounded-md border border-ink-700 bg-ink-850 px-3 text-[13px] text-ink-100 hover:border-signal-500/60"
                  >
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {response.interpretations.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink-100">{response.status === "clarify" ? "Which is closest?" : "This looks like"}</h2>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {response.interpretations.map((interp) => (
                  <InterpretationCard
                    key={interp.intentId + (interp.equipmentId ?? "")}
                    interp={interp}
                    onShow={(id) => run(showEquipmentCommands(id))}
                    safetyQuery={response.safety.urgent || response.safety.possibleSilence ? deferredQuery : null}
                  />
                ))}
              </ul>
            </div>
          )}

          {response.articles.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-ink-100">
                {response.articles.length === 1 ? "1 article" : `${response.articles.length} articles`}
              </h2>
              {topWithQuick && (
                <div className="mt-2 flex flex-col gap-2">
                  <h3 className="font-medium text-ink-50">
                    <Link href={`/knowledge/${topWithQuick.id}`} className="underline underline-offset-2 hover:text-signal-300">
                      {topWithQuick.title}
                    </Link>
                  </h3>
                  <QuickAnswer article={topWithQuick} headingLevel={4} />
                </div>
              )}
              <ul className="mt-2 grid gap-3 md:grid-cols-2">
                {response.articles.filter(({ article }) => article !== topWithQuick).map(({ article, reasons }) => (
                  <li key={article.id}>
                    <ArticleCard article={article} reason={reasons[0]} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {response.status === "no-match" && (
            <div className="flex flex-wrap gap-2">
              <Link href="/troubleshooter" className={buttonStyles({ size: "sm" })}>
                <MessageSquare aria-hidden className="size-4" />
                Use the troubleshooter
              </Link>
              <button type="button" onClick={() => setQuery("")} className={buttonStyles({ variant: "ghost", size: "sm" })}>
                Browse all articles
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function InterpretationCard({
  interp,
  onShow,
  safetyQuery,
}: {
  interp: SearchInterpretation;
  onShow: (equipmentId: string) => void;
  /** The search, when it carried a safety concern that must not be lost on the way (RT-002D-R1). */
  safetyQuery: string | null;
}) {
  const { startTopic, send, handoff } = useTroubleshooter();
  const router = useRouter();
  const equipment = getEquipmentById(interp.equipmentId);
  const troubleshoot = () => {
    if (safetyQuery) handoff(safetyQuery);
    const started = interp.topicId ? startTopic(interp.topicId) : equipment ? send({ type: "equipment", equipmentId: equipment.id }) : false;
    if (started) router.push("/troubleshooter");
  };
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-signal-500/30 bg-signal-900/20 p-3">
      <p className="font-medium text-ink-50">{interp.label}</p>
      {equipment && <p className="text-[13px] text-ink-300">Equipment: {equipment.name}</p>}
      <p className="text-[12px] text-ink-400">Why: {interp.reasons.join("; ")}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {(interp.topicId || equipment) && (
          <button type="button" onClick={troubleshoot} className={buttonStyles({ variant: "primary", size: "sm", className: "min-h-10" })}>
            <Wrench aria-hidden className="size-3.5" />
            Start troubleshooting
          </button>
        )}
        {equipment && (
          <button type="button" onClick={() => onShow(equipment.id)} className={buttonStyles({ size: "sm", className: "min-h-10" })}>
            <Crosshair aria-hidden className="size-3.5 text-signal-400" />
            Show in studio
          </button>
        )}
      </div>
    </li>
  );
}

function manualChip(article: KnowledgeArticle) {
  const source = article.quickAnswer?.sourceIds
    .flatMap((id) => article.sources.filter((s) => s.id === id))
    .find((s) => manualLabel(s) !== null);
  return source ? (
    <div>
      <SourceLabel source={source} />
    </div>
  ) : null;
}

function ArticleCard({ article, reason }: { article: KnowledgeArticle; reason?: string }) {
  return (
    <Link
      href={`/knowledge/${article.id}`}
      className="group flex h-full flex-col gap-2 rounded-xl border border-ink-750 bg-ink-900 p-4 transition-colors hover:border-ink-500 hover:bg-ink-850"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-ink-400 uppercase">
          {articleTypeLabels[article.type]} · {articleKindLabels[article.kind]}
        </span>
        <VerificationBadge status={article.status} />
      </div>
      <h3 className="flex items-center gap-1.5 font-medium text-ink-50">
        {article.title}
        <ArrowRight aria-hidden className="size-3.5 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-signal-400" />
      </h3>
      <p className="text-[15px] leading-relaxed text-ink-300">{article.quickAnswer?.text ?? article.summary}</p>
      {manualChip(article)}
      {reason && <p className="mt-auto pt-1 text-[12px] text-ink-400">Why: {reason}</p>}
    </Link>
  );
}

function BrowseByCategory() {
  const groups = [
    ...getCategories().map((c) => ({ id: c.id as string, name: c.name, description: c.description })),
    { id: "general", name: "General help", description: "Getting support and finding your way around." },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Link href="/knowledge/glossary" className={buttonStyles({ size: "sm" })}>
          <BookA aria-hidden className="size-4" />
          Glossary of terms
        </Link>
      </div>
      {groups.map((group) => {
        const items = allArticles.filter((a) => a.category === group.id);
        if (items.length === 0) return null;
        return (
          <section key={group.id} aria-labelledby={`category-${group.id}`}>
            <h2 id={`category-${group.id}`} className="text-sm font-semibold text-ink-100">
              {group.name}
            </h2>
            <p className="text-[13px] text-ink-400">{group.description}</p>
            <ul className={cn("mt-2 grid gap-3 md:grid-cols-2")}>
              {items.map((article) => (
                <li key={article.id}>
                  <ArticleCard article={article} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
