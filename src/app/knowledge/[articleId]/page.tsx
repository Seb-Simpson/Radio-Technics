import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ShowInStudioButton } from "@/components/knowledge/ShowInStudioButton";
import { StartTopicButton } from "@/components/knowledge/StartTopicButton";
import { PageContainer } from "@/components/shell/PageContainer";
import { Notice } from "@/components/ui/Notice";
import { VerificationBadge, verificationLabels } from "@/components/ui/VerificationBadge";
import { buttonStyles } from "@/components/ui/button-styles";
import { getGlossaryTerm } from "@/data/glossary";
import { troubleshootingTopics } from "@/data/troubleshooting-flows";
import { getEquipmentById } from "@/lib/content/equipment";
import { articleKindLabels, articleTypeLabels, sourceKindLabels } from "@/lib/knowledge/labels";
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

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-ink-750 bg-ink-900 p-4">
      <h2 id={id} className="text-sm font-semibold text-ink-100">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Bullets({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "caution" }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className={`flex gap-2.5 text-[15px] leading-relaxed ${tone === "caution" ? "text-caution-300" : "text-ink-200"}`}>
          <span aria-hidden className={`mt-2.5 size-1 shrink-0 rounded-full ${tone === "caution" ? "bg-caution-400" : "bg-ink-400"}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function ArticlePage({ params }: Props) {
  const { articleId } = await params;
  const article = getArticleById(articleId);
  if (!article) notFound();

  const relatedEquipment = article.equipmentIds.flatMap((id) => {
    const record = getEquipmentById(id);
    return record ? [record] : [];
  });
  const relatedArticles = article.relatedArticleIds.flatMap((id) => {
    const related = getArticleById(id);
    return related ? [related] : [];
  });
  const topics = article.relatedTopicIds.flatMap((id) => troubleshootingTopics.filter((t) => t.id === id));
  const terms = article.glossaryTermIds.flatMap((id) => {
    const term = getGlossaryTerm(id);
    return term ? [term] : [];
  });
  const sourceTitle = (id: string) => article.sources.find((s) => s.id === id)?.title ?? id;

  return (
    <PageContainer>
      <div>
        <Link href="/knowledge" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ArrowLeft aria-hidden className="size-4" />
          Knowledge Centre
        </Link>
      </div>

      <article className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="border-b border-ink-750 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-signal-400 uppercase">
                {articleTypeLabels[article.type]}
              </span>
              <VerificationBadge status={article.status} />
              <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[11px] font-medium text-ink-200">
                {articleKindLabels[article.kind]}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-50 sm:text-[28px]">{article.title}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-300">{article.summary}</p>
            {article.software && (
              <p className="mt-2 text-[13px] text-ink-300">
                Applies to: <span className="text-ink-100">{article.software.product} {article.software.versions.join(", ")}</span>
                {article.software.stationConfiguration && <> · Station setup: {article.software.stationConfiguration}</>}
              </p>
            )}
          </header>

          {article.kind !== "approved-procedure" && (
            <Notice tone="caution" title={`${verificationLabels[article.status].label} · ${articleKindLabels[article.kind]}`}>
              {verificationLabels[article.status].description} This article explains and helps describe a problem. It is not an approved
              station procedure — don&apos;t change or operate equipment because of it.
            </Notice>
          )}

          {article.symptoms.length > 0 && (
            <Block id="symptoms" title="How presenters might describe this">
              <Bullets items={article.symptoms.map((s) => `“${s}”`)} />
            </Block>
          )}

          <div className="flex flex-col gap-6">
            {article.sections.map((section, index) => (
              <section key={section.heading} aria-labelledby={`section-${index}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`section-${index}`} className="text-lg font-semibold text-ink-50">
                    {section.heading}
                  </h2>
                  <VerificationBadge status={section.status} />
                </div>
                <div className="mt-2">
                  {section.body.length > 1 ? <Bullets items={section.body} /> : <p className="text-[15px] leading-relaxed text-ink-200">{section.body[0]}</p>}
                </div>
                {section.sourceIds && section.sourceIds.length > 0 && (
                  <p className="mt-1.5 text-[12px] text-ink-400">Source: {section.sourceIds.map(sourceTitle).join("; ")}</p>
                )}
              </section>
            ))}
          </div>

          {article.diagnosticQuestions.length > 0 && (
            <Block id="diagnostic" title="Questions that help identify the problem">
              <Bullets items={article.diagnosticQuestions} />
            </Block>
          )}

          {article.openQuestions.length > 0 && (
            <Block id="open-questions" title="Unresolved — waiting for the station engineer">
              <p className="mb-2 text-[13px] text-ink-300">These are open questions, not guidance.</p>
              <Bullets items={article.openQuestions} tone="caution" />
            </Block>
          )}

          <Block id="sources" title="Sources">
            <ul className="flex flex-col gap-3">
              {article.sources.map((source) => (
                <li key={source.id} className="text-[14px] leading-relaxed">
                  <p className="flex flex-wrap items-center gap-2">
                    {source.url?.startsWith("https://") ? (
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-signal-300 underline underline-offset-2">
                        {source.title}
                        <ExternalLink aria-hidden className="size-3.5" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ) : (
                      <span className="font-medium text-ink-100">{source.title}</span>
                    )}
                    <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[11px] text-ink-200">{sourceKindLabels[source.kind]}</span>
                    {source.retrievedOn === null && (
                      <span className="rounded-full border border-caution-400/35 bg-caution-900/50 px-2 py-0.5 text-[11px] text-caution-300">Not yet read</span>
                    )}
                  </p>
                  <p className="text-[13px] text-ink-300">
                    {source.publisher}
                    {source.retrievedOn && <> · read {source.retrievedOn}</>}
                  </p>
                  {source.note && <p className="text-[13px] text-ink-400">{source.note}</p>}
                </li>
              ))}
            </ul>
          </Block>
        </div>

        <aside aria-label="Related information" className="flex flex-col gap-4 lg:pt-1">
          <Block id="review-status" title="Review status">
            <p className="text-[13px] text-ink-300">
              {article.review
                ? `Reviewed by ${article.review.reviewer} on ${article.review.date} (${article.review.source}).`
                : "Not yet reviewed by the station engineer."}
            </p>
          </Block>
          {topics.length > 0 && (
            <Block id="related-topics" title="Troubleshoot this">
              <div className="flex flex-col gap-2">
                {topics.map((topic) => (
                  <StartTopicButton key={topic.id} topicId={topic.id} label={topic.label} />
                ))}
              </div>
            </Block>
          )}
          {relatedEquipment.length > 0 && (
            <Block id="related-equipment" title="Related equipment">
              <ul className="flex flex-col gap-1.5">
                {relatedEquipment.map((record) => (
                  <li key={record.id}>
                    <ShowInStudioButton equipmentId={record.id} label={record.name} />
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {relatedArticles.length > 0 && (
            <Block id="related-articles" title="Related articles">
              <ul className="flex flex-col gap-1">
                {relatedArticles.map((related) => (
                  <li key={related.id}>
                    <Link href={`/knowledge/${related.id}`} className="block rounded-md py-1.5 text-[14px] text-signal-300 underline-offset-2 hover:underline">
                      {related.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {terms.length > 0 && (
            <Block id="terms" title="Terms explained">
              <dl className="flex flex-col gap-2">
                {terms.map((term) => (
                  <div key={term.id}>
                    <dt className="text-[14px] font-medium text-ink-100">
                      <Link href={`/knowledge/glossary#${term.id}`} className="underline-offset-2 hover:underline">
                        {term.term}
                      </Link>
                    </dt>
                    <dd className="text-[13px] leading-relaxed text-ink-300">{term.definition}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}
          <Block id="history" title="Version history">
            <ol className="flex flex-col gap-1.5">
              {article.revisions.map((rev, i) => (
                <li key={i} className="text-[13px] text-ink-300">
                  <span className="font-mono text-ink-200">{rev.date}</span> — {rev.summary} <span className="text-ink-400">({rev.author})</span>
                </li>
              ))}
            </ol>
          </Block>
        </aside>
      </article>
    </PageContainer>
  );
}
