import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShowInStudioButton } from "@/components/knowledge/ShowInStudioButton";
import { PageContainer } from "@/components/shell/PageContainer";
import { Notice } from "@/components/ui/Notice";
import { VerificationBadge, verificationLabels } from "@/components/ui/VerificationBadge";
import { buttonStyles } from "@/components/ui/button-styles";
import { getEquipmentById } from "@/lib/content/equipment";
import { articleTypeLabels } from "@/lib/knowledge/labels";
import { getArticleById, getArticles } from "@/lib/knowledge/search";

interface Props {
  params: Promise<{ articleId: string }>;
}

export function generateStaticParams() {
  return getArticles().map((article) => ({ articleId: article.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { articleId } = await params;
  return { title: getArticleById(articleId)?.title ?? "Article" };
}

export default async function ArticlePage({ params }: Props) {
  const { articleId } = await params;
  const article = getArticleById(articleId);
  if (!article) notFound();

  const relatedEquipment = article.equipmentIds.flatMap((id) => {
    const record = getEquipmentById(id);
    return record ? [record] : [];
  });

  return (
    <PageContainer>
      <div>
        <Link href="/knowledge" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ArrowLeft aria-hidden className="size-4" />
          Knowledge Centre
        </Link>
      </div>

      <article className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <header className="border-b border-ink-750 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-signal-400 uppercase">
                {articleTypeLabels[article.type]}
              </span>
              <VerificationBadge status={article.status} />
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-50 sm:text-[28px]">{article.title}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-300">{article.summary}</p>
          </header>

          {article.status !== "verified" && (
            <Notice tone="caution" className="mt-5" title={verificationLabels[article.status].label}>
              {verificationLabels[article.status].description} Do not treat this article as an official station procedure.
            </Notice>
          )}

          <div className="mt-6 flex flex-col gap-6">
            {article.sections.map((section) => (
              <section key={section.heading} aria-labelledby={`s-${section.heading}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`s-${section.heading}`} className="text-lg font-semibold text-ink-50">
                    {section.heading}
                  </h2>
                  <VerificationBadge status={section.status} />
                </div>
                {section.body.length > 1 ? (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {section.body.map((paragraph) => (
                      <li key={paragraph} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-200">
                        <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-ink-400" />
                        {paragraph}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-200">{section.body[0]}</p>
                )}
              </section>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:pt-1">
          <div className="rounded-xl border border-ink-750 bg-ink-900 p-4">
            <h2 className="text-sm font-semibold text-ink-100">Review status</h2>
            <p className="mt-1 text-[13px] text-ink-400">
              {article.lastReviewed ? `Last reviewed by the engineer on ${article.lastReviewed}.` : "Not yet reviewed by the station engineer."}
            </p>
          </div>
          {relatedEquipment.length > 0 && (
            <div className="rounded-xl border border-ink-750 bg-ink-900 p-4">
              <h2 className="text-sm font-semibold text-ink-100">Related equipment</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {relatedEquipment.map((record) => (
                  <li key={record.id}>
                    <ShowInStudioButton equipmentId={record.id} label={record.name} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </article>
    </PageContainer>
  );
}
