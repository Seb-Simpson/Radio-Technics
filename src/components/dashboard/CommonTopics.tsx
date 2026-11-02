"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { troubleshootingTopics } from "@/data/troubleshooting-flows";
import { useTroubleshooter } from "@/lib/troubleshooter/TroubleshooterProvider";

export function CommonTopics() {
  const { startTopic } = useTroubleshooter();
  const router = useRouter();
  return (
    <ul className="divide-y divide-ink-750">
      {troubleshootingTopics.map((topic) => (
        <li key={topic.id}>
          <button
            type="button"
            onClick={() => {
              startTopic(topic.id);
              router.push("/troubleshooter");
            }}
            className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-ink-850 sm:px-5"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-ink-50">{topic.label}</span>
              <span className="block text-[13px] text-ink-400">{topic.description}</span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-signal-400" />
          </button>
        </li>
      ))}
    </ul>
  );
}
