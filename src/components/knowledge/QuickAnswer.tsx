import { ExternalLink } from "lucide-react";
import { SourceLabel } from "@/components/knowledge/SourceLabel";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { manualLabel } from "@/lib/knowledge/manual-label";
import type { KnowledgeArticle } from "@/types";

/** The short answer at the top of an article, with its manual label and link when it comes from a read manual. */
export function QuickAnswer({ article }: { article: KnowledgeArticle }) {
  const quick = article.quickAnswer;
  if (!quick) return null;
  const cited = quick.sourceIds.flatMap((id) => {
    const source = article.sources.find((s) => s.id === id);
    return source ? [source] : [];
  });
  const manual = cited.find((s) => manualLabel(s) !== null);
  const href = manual?.url?.startsWith("https://") ? manual.url : undefined;

  return (
    <section aria-labelledby="quick-answer-heading" className="rounded-xl border border-signal-500/30 bg-ink-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="quick-answer-heading" className="text-[15px] font-semibold text-ink-100">
          Quick answer
        </h2>
        {manual && <SourceLabel source={manual} />}
        <VerificationBadge status={quick.status} />
      </div>
      <p className="mt-2 text-[17px] leading-relaxed text-ink-50">{quick.text}</p>
      {manual && href && (
        <p className="mt-3">
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[15px] font-medium text-signal-300 underline underline-offset-2">
            Read the original
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      )}
    </section>
  );
}
