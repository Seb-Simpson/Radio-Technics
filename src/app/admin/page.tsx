import { CircleCheck, Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/shell/PageContainer";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { articles } from "@/data/articles";
import { hotspots } from "@/data/hotspots";
import { EXPECTED_PHOTO_COUNT, demoLayoutView, studioPhotos } from "@/data/studio-views";
import { flowNodes } from "@/data/troubleshooting-flows";
import { getAllEquipment, getCategory } from "@/lib/content/equipment";
import { validateContent } from "@/lib/content/validate";
import { articleKindLabels, articleTypeLabels } from "@/lib/knowledge/labels";
import { verificationLabels } from "@/components/ui/VerificationBadge";
import { glossary } from "@/data/glossary";
import type { SourceReference, VerificationStatus } from "@/types";

export const metadata: Metadata = { title: "Administration" };

export default function AdminPage() {
  const issues = validateContent();
  const equipment = getAllEquipment();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administration"
        title="Content records"
        description="A read-only view of the records that power Radio Technics, and a check that they all link together correctly."
      />

      <Notice title="Read-only">
        <span className="inline-flex items-center gap-1.5">
          <Lock aria-hidden className="size-3.5" />
          Editing isn&apos;t available yet. It will be added once sign-in and permissions are in place. Until then, records are changed by
          editing the files in <code className="font-mono text-ink-200">src/data</code>.
        </span>
      </Notice>

      <section aria-labelledby="integrity-title" className="rounded-xl border border-ink-750 bg-ink-900 p-4 sm:p-5">
        <h2 id="integrity-title" className="text-sm font-semibold text-ink-100">
          Content integrity
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-300">
          These checks confirm that records link together and that anything marked verified has a complete review record (named
          reviewer, real date, meaningful source). They cannot prove that an engineer genuinely approved it — review records should
          be checked with the station.
        </p>
        {issues.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-signal-300">
            <CircleCheck aria-hidden className="size-4" />
            All {equipment.length} equipment records, {hotspots.length} hotspots, {articles.length} articles and {flowNodes.length}{" "}
            troubleshooting steps link together correctly.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {issues.map((issue) => (
              <li key={`${issue.area}-${issue.message}`} className="flex gap-2 text-sm text-caution-300">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-mono text-[12px] text-ink-400">{issue.area}</span> {issue.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReviewQueue />

      <AdminTable
        title="Equipment"
        caption={`${equipment.length} records`}
        headers={["ID", "Name", "Category", "Hotspots", "Guides", "Open questions"]}
        rows={equipment.map((record) => [
          <code key="id" className="font-mono text-[12px] text-ink-300">{record.id}</code>,
          record.name,
          getCategory(record.category)?.name ?? record.category,
          String(hotspots.filter((h) => h.equipmentId === record.id).length),
          String(record.relatedArticleIds.length),
          String(record.requiresVerification.length),
        ])}
      />

      <AdminTable
        title="Articles"
        caption={`${articles.length} articles`}
        headers={["ID", "Title", "Type", "Kind", "Status", "Last reviewed"]}
        rows={articles.map((article) => [
          <code key="id" className="font-mono text-[12px] text-ink-300">{article.id}</code>,
          article.title,
          articleTypeLabels[article.type],
          articleKindLabels[article.kind],
          <VerificationBadge key="status" status={article.status} />,
          article.review ? `${article.review.date} (${article.review.reviewer})` : "Never",
        ])}
      />

      <AdminTable
        title="Studio views"
        caption={`${studioPhotos.length} of ${EXPECTED_PHOTO_COUNT} photographs added`}
        headers={["ID", "Title", "Type", "Size", "Hotspots"]}
        rows={[...studioPhotos, demoLayoutView].map((view) => [
          <code key="id" className="font-mono text-[12px] text-ink-300">{view.id}</code>,
          view.title,
          view.illustrative ? "Illustrative (not the real studio)" : "Photograph",
          `${view.width} × ${view.height}`,
          String(hotspots.filter((h) => h.viewId === view.id).length),
        ])}
      />
    </PageContainer>
  );
}

function AdminTable({ title, caption, headers, rows }: { title: string; caption: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink-750 bg-ink-900">
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-750 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
        <p className="text-[12px] text-ink-400">{caption}</p>
      </div>
      {/* Focusable so keyboard users can scroll the table sideways on small screens. */}
      <div className="overflow-x-auto focus-visible:outline-offset-[-2px]" tabIndex={0} role="region" aria-label={`${title} table`}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-750">
              {headers.map((header) => (
                <th key={header} scope="col" className="px-4 py-2 text-[12px] font-medium text-ink-400 sm:px-5">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-2.5 text-ink-200 sm:px-5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Engineer review foundation (RT-003). Read-only: it lists what needs the
 * station engineer, so it can be worked through. Nothing here can approve
 * content; approval is recorded in the data files with a review record.
 */
function ReviewQueue() {
  const equipmentQuestions = getAllEquipment().filter((e) => e.requiresVerification.length > 0);
  const articleQuestions = articles.filter((a) => a.openQuestions.length > 0);
  const unverifiedHotspots = hotspots.filter((h) => !h.placeholder && h.identity !== "verified");
  const unread = new Map<string, SourceReference>();
  for (const a of articles) for (const src of a.sources) if (src.retrievedOn === null) unread.set(src.id, src);
  const statuses: VerificationStatus[] = ["verified", "manufacturer-documented", "station-reported", "draft"];
  const counts = statuses.map((status) => ({
    status,
    articles: articles.filter((a) => a.status === status).length,
    sections: articles.flatMap((a) => a.sections).filter((sec) => sec.status === status).length,
    glossary: glossary.filter((t) => t.status === status).length,
  }));
  const total = equipmentQuestions.reduce((n, e) => n + e.requiresVerification.length, 0) + articleQuestions.reduce((n, a) => n + a.openQuestions.length, 0);

  return (
    <section aria-labelledby="review-title" className="rounded-xl border border-ink-750 bg-ink-900 p-4 sm:p-5">
      <h2 id="review-title" className="text-sm font-semibold text-ink-100">
        Engineer review queue
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-300">
        {total} open questions for the station engineer, {unverifiedHotspots.length} unconfirmed photo identifications and {unread.size} manufacturer
        sources not yet read. Approvals are recorded in the content files with a review record; this page cannot approve anything.
      </p>

      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Content by authority level">
        <table className="w-full min-w-[480px] text-left text-sm">
          <caption className="pb-2 text-left text-[12px] text-ink-400">Content by authority level</caption>
          <thead>
            <tr className="border-b border-ink-750 text-[12px] text-ink-400">
              <th scope="col" className="py-1.5 pr-4 font-medium">Level</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Articles</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Article sections</th>
              <th scope="col" className="py-1.5 font-medium">Glossary terms</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((row) => (
              <tr key={row.status} className="border-b border-ink-800 text-ink-200">
                <th scope="row" className="py-1.5 pr-4 font-normal">{verificationLabels[row.status].label}</th>
                <td className="py-1.5 pr-4">{row.articles}</td>
                <td className="py-1.5 pr-4">{row.sections}</td>
                <td className="py-1.5">{row.glossary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-4" open>
        <summary className="cursor-pointer text-sm font-medium text-ink-100">Manufacturer sources not yet read ({unread.size})</summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {[...unread.values()].map((src) => (
            <li key={src.id} className="text-[13px] text-ink-300">
              <span className="text-ink-100">{src.title}</span> — <span className="break-all">{src.url}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-100">Questions by equipment</summary>
        <ul className="mt-2 flex flex-col gap-3">
          {equipmentQuestions.map((e) => (
            <li key={e.id}>
              <p className="text-[13px] font-medium text-ink-100">{e.name}</p>
              <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-300">
                {e.requiresVerification.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-100">Questions from articles</summary>
        <ul className="mt-2 flex flex-col gap-3">
          {articleQuestions.map((a) => (
            <li key={a.id}>
              <p className="text-[13px] font-medium text-ink-100">{a.title}</p>
              <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-300">
                {a.openQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-100">Unconfirmed photo identifications ({unverifiedHotspots.length})</summary>
        <ul className="mt-2 list-disc pl-5 text-[13px] text-ink-300">
          {unverifiedHotspots.map((h) => (
            <li key={h.id}>
              <code className="font-mono text-ink-200">{h.id}</code> — {h.note ?? "No note"}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
