import { ArrowRight, Map as MapIcon, MessageSquare } from "lucide-react";
import Link from "next/link";
import { CommonTopics } from "@/components/dashboard/CommonTopics";
import { EquipmentShortcuts } from "@/components/dashboard/EquipmentShortcuts";
import { PageContainer } from "@/components/shell/PageContainer";
import { Notice } from "@/components/ui/Notice";
import { articles } from "@/data/articles";
import { EXPECTED_PHOTO_COUNT, studioPhotos } from "@/data/studio-views";
import { getAllEquipment } from "@/lib/content/equipment";

export default function DashboardPage() {
  const equipment = getAllEquipment();
  const verifiedArticles = articles.filter((a) => a.status === "verified").length;
  const openQuestions = equipment.reduce((total, record) => total + record.requiresVerification.length, 0);

  const progress = [
    { label: "Studio photographs added", value: `${studioPhotos.length} of ${EXPECTED_PHOTO_COUNT}` },
    { label: "Equipment records", value: String(equipment.length) },
    { label: "Engineer-verified guides", value: `${verifiedArticles} of ${articles.length}` },
    { label: "Open questions for the engineer", value: String(openQuestions) },
  ];

  return (
    <PageContainer>
      <Notice tone="caution" title="Prototype — demonstration mode">
        Radio Technics isn&apos;t connected to the studio. The troubleshooter follows scripted conversations, and no procedures have
        been verified by the station engineer yet.
      </Notice>

      <section aria-labelledby="dashboard-title">
        <p className="font-mono text-[11px] font-medium tracking-[0.14em] text-signal-400 uppercase">Radio Technics</p>
        <h1 id="dashboard-title" className="mt-1 text-[28px] font-semibold tracking-tight text-ink-50 sm:text-[32px]">
          Studio help, in plain English
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-300">
          Find out what a piece of equipment does, or work through a problem one question at a time.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-[1.3fr_1fr]">
          <Link
            href="/troubleshooter"
            className="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-xl border border-signal-500/40 bg-signal-900/40 p-5 transition-colors hover:border-signal-400/70 hover:bg-signal-900/60 sm:p-6"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-signal-500 text-ink-950">
              <MessageSquare aria-hidden className="size-5" />
            </span>
            <span>
              <span className="flex items-center gap-2 text-xl font-semibold text-ink-50">
                Troubleshoot a problem
                <ArrowRight aria-hidden className="size-5 text-signal-300 transition-transform group-hover:translate-x-1" />
              </span>
              <span className="mt-1 block text-[15px] text-ink-200">Describe what&apos;s wrong and answer a few simple questions.</span>
            </span>
          </Link>
          <Link
            href="/studio"
            className="group flex flex-col justify-between gap-6 rounded-xl border border-ink-700 bg-ink-900 p-5 transition-colors hover:border-ink-500 hover:bg-ink-850 sm:p-6"
          >
            <span className="flex size-10 items-center justify-center rounded-lg border border-ink-600 bg-ink-800 text-signal-400">
              <MapIcon aria-hidden className="size-5" />
            </span>
            <span>
              <span className="flex items-center gap-2 text-xl font-semibold text-ink-50">
                Explore the studio
                <ArrowRight aria-hidden className="size-5 text-ink-400 transition-transform group-hover:translate-x-1" />
              </span>
              <span className="mt-1 block text-[15px] text-ink-300">See each piece of equipment and what it does.</span>
            </span>
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section aria-labelledby="topics-title" className="overflow-hidden rounded-xl border border-ink-750 bg-ink-900">
          <h2 id="topics-title" className="border-b border-ink-750 px-4 py-3 text-sm font-semibold text-ink-100 sm:px-5">
            Common problems
          </h2>
          <CommonTopics />
        </section>

        <section aria-labelledby="progress-title" className="rounded-xl border border-ink-750 bg-ink-900">
          <h2 id="progress-title" className="border-b border-ink-750 px-4 py-3 text-sm font-semibold text-ink-100 sm:px-5">
            Setup progress
          </h2>
          <dl className="divide-y divide-ink-750">
            {progress.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                <dt className="text-sm text-ink-300">{item.label}</dt>
                <dd className="font-mono text-sm font-medium text-ink-50 tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-ink-750 px-4 py-3 text-[13px] leading-relaxed text-ink-400 sm:px-5">
            Counts come from the project&apos;s own records. See{" "}
            <Link href="/admin" className="text-signal-300 underline underline-offset-2 hover:text-signal-400">
              Administration
            </Link>{" "}
            for details.
          </p>
        </section>
      </div>

      <section aria-labelledby="equipment-title">
        <h2 id="equipment-title" className="text-sm font-semibold text-ink-100">
          Equipment
        </h2>
        <p className="mt-0.5 mb-3 text-[13px] text-ink-400">Choose an item to find it in the Studio Explorer.</p>
        <EquipmentShortcuts />
      </section>
    </PageContainer>
  );
}
