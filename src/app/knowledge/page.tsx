import type { Metadata } from "next";
import { KnowledgeCentre } from "@/components/knowledge/KnowledgeCentre";
import { PageContainer } from "@/components/shell/PageContainer";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Knowledge Centre" };

export default function KnowledgePage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Knowledge Centre"
        title="Guides and help topics"
        description="Search in your own words, or browse by equipment. Articles explain and help you describe a problem; only engineer-approved procedures are instructions."
      />
      <Notice title="How far each article can be trusted">
        Every article shows its level: <strong className="font-medium text-ink-100">engineer verified</strong> (approved for this studio),{" "}
        <strong className="font-medium text-ink-100">station reported</strong>, <strong className="font-medium text-ink-100">manufacturer documentation</strong>{" "}
        (how a product generally works — not permission to change anything) or <strong className="font-medium text-ink-100">unverified draft</strong>.
        Nothing has been verified by the station engineer yet, and there are no approved procedures.
      </Notice>
      <KnowledgeCentre />
    </PageContainer>
  );
}
