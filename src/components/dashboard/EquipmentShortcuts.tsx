"use client";

import { AudioLines, Cpu, Headphones, Mic, Server, Video, type LucideIcon } from "lucide-react";
import { getCategories, getEquipmentByCategory } from "@/lib/content/equipment";
import { showEquipmentCommands } from "@/lib/workspace/commands";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";
import type { EquipmentCategoryId } from "@/types";

const icons: Record<EquipmentCategoryId, LucideIcon> = {
  mixing: AudioLines,
  microphones: Mic,
  playout: Cpu,
  monitoring: Headphones,
  video: Video,
  technical: Server,
};

export function EquipmentShortcuts() {
  const { run } = useWorkspace();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {getCategories().map((category) => {
        const Icon = icons[category.id];
        return (
          <section key={category.id} aria-labelledby={`cat-${category.id}`} className="rounded-xl border border-ink-750 bg-ink-900 p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg border border-ink-700 bg-ink-850">
                <Icon aria-hidden className="size-4 text-signal-400" />
              </span>
              <h3 id={`cat-${category.id}`} className="font-medium text-ink-50">
                {category.name}
              </h3>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-400">{category.description}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {getEquipmentByCategory(category.id).map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => run(showEquipmentCommands(record.id))}
                    className="rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1 text-[13px] text-ink-200 transition-colors hover:border-signal-500/50 hover:text-ink-50"
                  >
                    {record.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
