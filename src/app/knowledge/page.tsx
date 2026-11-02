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
        description="Every article shows how far it can be trusted. Only engineer-verified information should be treated as station procedure."
      />
      <Notice title="No articles have been verified by the station engineer yet">
        Articles currently describe what is known and which questions to ask. They don&apos;t contain repair steps.
      </Notice>
      <KnowledgeCentre />
    </PageContainer>
  );
}
