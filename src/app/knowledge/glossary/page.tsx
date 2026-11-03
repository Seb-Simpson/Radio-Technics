import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/shell/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { buttonStyles } from "@/components/ui/button-styles";
import { glossary } from "@/data/glossary";
import { getEquipmentById } from "@/lib/content/equipment";

export const metadata: Metadata = { title: "Glossary" };

export default function GlossaryPage() {
  const terms = [...glossary].sort((a, b) => a.term.localeCompare(b.term));
  return (
    <PageContainer>
      <div>
        <Link href="/knowledge" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ArrowLeft aria-hidden className="size-4" />
          Knowledge Centre
        </Link>
      </div>
      <PageHeader
        eyebrow="Knowledge Centre"
        title="Glossary"
        description="Plain-English explanations of studio terms. Each says where the explanation comes from."
      />
      <dl className="flex flex-col gap-4">
        {terms.map((term) => (
          <div key={term.id} id={term.id} className="scroll-mt-20 rounded-xl border border-ink-750 bg-ink-900 p-4">
            <dt className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-ink-50">{term.term}</span>
              <VerificationBadge status={term.status} />
            </dt>
            <dd className="mt-1.5 flex flex-col gap-1.5">
              <p className="text-[15px] leading-relaxed text-ink-200">{term.definition}</p>
              {term.aliases.length > 0 && <p className="text-[13px] text-ink-400">Also called: {term.aliases.join(", ")}</p>}
              {term.relatedEquipmentIds.length > 0 && (
                <p className="text-[13px] text-ink-400">
                  Related equipment: {term.relatedEquipmentIds.map((id) => getEquipmentById(id)?.name ?? id).join(", ")}
                </p>
              )}
              <p className="text-[12px] text-ink-400">Source: {term.source}</p>
            </dd>
          </div>
        ))}
      </dl>
    </PageContainer>
  );
}
