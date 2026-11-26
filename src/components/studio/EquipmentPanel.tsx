"use client";

import { ArrowRight, BookOpen, CircleHelp, ClipboardList, MousePointerClick, TriangleAlert, Wrench, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonStyles } from "@/components/ui/button-styles";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { getCategory, getEquipmentById } from "@/lib/content/equipment";
import { SourceLabel } from "@/components/knowledge/SourceLabel";
import { manualLabel } from "@/lib/knowledge/manual-label";
import { getArticleById, getArticlesForEquipment } from "@/lib/knowledge/search";
import type { Hotspot } from "@/types";

export interface EquipmentPanelProps {
  equipmentId: string | null;
  onClose: () => void;
  /** Primary action, e.g. "Troubleshoot this" or "Use in troubleshooter". */
  onTroubleshoot?: (equipmentId: string) => void;
  troubleshootLabel?: string;
  /** Whether the equipment appears in the current view. */
  inCurrentView?: boolean;
  /** The hotspot for this equipment in the photo on screen, if any. */
  photoHotspot?: Hotspot | null;
}

export function EquipmentPanel({
  equipmentId,
  onClose,
  onTroubleshoot,
  troubleshootLabel = "Troubleshoot this",
  inCurrentView = true,
  photoHotspot = null,
}: EquipmentPanelProps) {
  const record = getEquipmentById(equipmentId);

  if (!equipmentId) {
    return (
      <section aria-label="Equipment details" className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border border-ink-700 bg-ink-850">
          <MousePointerClick aria-hidden className="size-5 text-signal-400" />
        </span>
        <div>
          <h2 className="font-medium text-ink-100">Select a piece of equipment</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">
            Tap an item in the studio view or choose one from the equipment list to see what it does and common problems.
          </p>
        </div>
      </section>
    );
  }

  if (!record) {
    return (
      <section aria-label="Equipment details" role="alert" className="px-5 py-6">
        <p className="font-medium text-ink-100">Equipment not found</p>
        <p className="mt-1 text-sm text-ink-400">This item isn&apos;t in the studio equipment list. It may have been removed.</p>
        <button type="button" onClick={onClose} className={buttonStyles({ size: "sm", className: "mt-4" })}>
          Clear selection
        </button>
      </section>
    );
  }

  const category = getCategory(record.category);
  const articles = record.relatedArticleIds.flatMap((id) => {
    const article = getArticleById(id);
    return article ? [article] : [];
  });
  // Related by either direction of the link; only manual-backed quick answers are listed.
  const manualArticles = [...articles, ...getArticlesForEquipment(record.id)]
    .filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i)
    .flatMap((article) => {
      const source = article.quickAnswer?.sourceIds
        .flatMap((id) => article.sources.filter((s) => s.id === id))
        .find((s) => manualLabel(s) !== null);
      return article.quickAnswer && source ? [{ article, source }] : [];
    });

  return (
    <section aria-labelledby="equipment-panel-title" className="animate-fade-up flex flex-col" key={record.id}>
      <header className="flex items-start justify-between gap-3 border-b border-ink-750 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-signal-400 uppercase">{category?.name}</p>
          <h2 id="equipment-panel-title" className="mt-1 text-lg leading-snug font-semibold text-ink-50">
            {record.name}
          </h2>
          {!inCurrentView && <p className="mt-1 text-xs text-ink-400">Not shown in the current studio view.</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close equipment details"
          className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-5 px-5 py-5">
        <p className="text-[15px] leading-relaxed text-ink-200">{record.description}</p>

        <div className="rounded-lg border border-ink-700 bg-ink-850 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium tracking-wide text-ink-400 uppercase">What it does</h3>
            <VerificationBadge status={record.primaryFunction.status} />
          </div>
          <p className="mt-1.5 text-[15px] font-medium text-ink-50">{record.primaryFunction.text}</p>
        </div>

        {photoHotspot?.note && (
          <div className="flex flex-col items-start gap-1.5 rounded-lg border border-dashed border-ink-600 px-3 py-2.5">
            <p className="text-[13px] leading-relaxed text-ink-200">
              <span className="font-medium text-ink-100">In this photo: </span>
              {photoHotspot.note}
            </p>
            <VerificationBadge status={photoHotspot.identity} />
          </div>
        )}

        {onTroubleshoot && (
          <button type="button" onClick={() => onTroubleshoot(record.id)} className={buttonStyles({ variant: "primary", className: "w-full" })}>
            <Wrench aria-hidden className="size-4" />
            {troubleshootLabel}
          </button>
        )}

        <PanelSection icon={<ClipboardList aria-hidden className="size-4" />} title="Known information">
          <ul className="flex flex-col gap-2">
            {record.knownInformation.map((fact) => (
              <li key={fact.text} className="flex flex-col items-start gap-1.5 text-sm leading-relaxed text-ink-200">
                <span>{fact.text}</span>
                <VerificationBadge status={fact.status} />
              </li>
            ))}
          </ul>
        </PanelSection>

        <PanelSection icon={<TriangleAlert aria-hidden className="size-4" />} title="Problems people report">
          <ul className="flex flex-col gap-1.5">
            {record.commonProblems.map((problem) => (
              <li key={problem} className="flex gap-2 text-sm leading-relaxed text-ink-200">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-400" />
                {problem}
              </li>
            ))}
          </ul>
        </PanelSection>

        {manualArticles.length > 0 && (
          <PanelSection icon={<BookOpen aria-hidden className="size-4" />} title="From the manual">
            <ul className="flex flex-col gap-3">
              {manualArticles.map(({ article, source }) => (
                <li key={article.id} className="flex flex-col gap-1.5">
                  <Link href={`/knowledge/${article.id}`} className="-mx-2 block rounded-md px-2 py-1.5 text-[15px] font-medium text-signal-300 underline-offset-2 hover:underline">
                    {article.title}
                  </Link>
                  <p className="text-[15px] leading-relaxed text-ink-200">{article.quickAnswer?.text}</p>
                  <div>
                    <SourceLabel source={source} />
                  </div>
                </li>
              ))}
            </ul>
          </PanelSection>
        )}

        {articles.length > 0 && (
          <PanelSection icon={<BookOpen aria-hidden className="size-4" />} title="Related guides">
            <ul className="flex flex-col gap-1">
              {articles.map((article) => (
                <li key={article.id}>
                  <Link
                    href={`/knowledge/${article.id}`}
                    className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 text-sm text-ink-100 hover:bg-ink-800"
                  >
                    <span>{article.title}</span>
                    <ArrowRight aria-hidden className="size-3.5 text-ink-400 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </PanelSection>
        )}

        <PanelSection icon={<CircleHelp aria-hidden className="size-4" />} title="Awaiting engineer confirmation">
          <ul className="flex flex-col gap-1.5">
            {record.requiresVerification.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-caution-300/90">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-caution-400" />
                {item}
              </li>
            ))}
          </ul>
        </PanelSection>
      </div>
    </section>
  );
}

function PanelSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-100">
        <span className="text-ink-400">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
