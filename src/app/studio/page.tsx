import type { Metadata } from "next";
import { PageContainer } from "@/components/shell/PageContainer";
import { StudioExplorer } from "@/components/studio/StudioExplorer";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Studio Explorer" };

export default function StudioPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Studio Explorer"
        title="Explore the studio"
        description={
          <>
            Select equipment to see what it does and what still needs confirming.
            <span className="max-sm:sr-only"> Drag to move around, and scroll or pinch to zoom.</span>
          </>
        }
      />
      <StudioExplorer />
    </PageContainer>
  );
}
