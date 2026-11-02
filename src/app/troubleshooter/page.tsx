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
        description={
          // Collapsed visually on phones to give the conversation room; the chat header keeps the prototype label.
          <span className="max-sm:sr-only">
            Describe it in your own words. I&apos;ll ask one question at a time. This prototype follows scripted conversations — it
            isn&apos;t a live AI and can&apos;t see or control studio equipment.
          </span>
        }
      />
      <Troubleshooter />
    </PageContainer>
  );
}
