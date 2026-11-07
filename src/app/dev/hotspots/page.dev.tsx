import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HotspotEditor } from "@/components/dev/HotspotEditor";
import { PageContainer } from "@/components/shell/PageContainer";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { hotspots } from "@/data/hotspots";
import { studioPhotos } from "@/data/studio-views";
import { isHotspotEditorEnabled } from "@/lib/dev/access";

export const metadata: Metadata = { title: "Hotspot editor (developer)", robots: { index: false } };
// Evaluated per request so the environment gate can't be baked into a static page.
export const dynamic = "force-dynamic";

export default function HotspotEditorPage() {
  if (!isHotspotEditorEnabled()) notFound();
  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Developer tool"
        title="Hotspot editor"
        description="Mark where equipment appears on a studio photograph and generate the configuration for src/data/hotspots.ts. Nothing is saved from this page."
      />
      <Notice tone="caution" title="Development only">
        This page is unavailable in production builds. Placing a hotspot does not confirm what the equipment is — new hotspots are
        recorded as unverified until the station engineer reviews them.
      </Notice>
      <HotspotEditor views={studioPhotos} hotspots={hotspots} />
    </PageContainer>
  );
}
