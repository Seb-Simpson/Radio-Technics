import type { Metadata } from "next";
import { PageContainer } from "@/components/shell/PageContainer";
import { Troubleshooter } from "@/components/troubleshooter/Troubleshooter";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Troubleshooter" };

export default function TroubleshooterPage() {
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Troubleshooter"
        title="What's the problem?"
        description="Describe it in your own words. I'll ask one question at a time. This prototype follows scripted conversations — it isn't a live AI and can't see or control studio equipment."
      />
      <Troubleshooter />
    </PageContainer>
  );
}
