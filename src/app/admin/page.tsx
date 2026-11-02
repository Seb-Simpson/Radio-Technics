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
import { articleTypeLabels } from "@/lib/knowledge/labels";

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
        headers={["ID", "Title", "Type", "Status", "Last reviewed"]}
        rows={articles.map((article) => [
          <code key="id" className="font-mono text-[12px] text-ink-300">{article.id}</code>,
          article.title,
          articleTypeLabels[article.type],
          <VerificationBadge key="status" status={article.status} />,
          article.lastReviewed ?? "Never",
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
