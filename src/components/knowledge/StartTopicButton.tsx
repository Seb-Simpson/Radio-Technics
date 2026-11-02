"use client";

import { Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { buttonStyles } from "@/components/ui/button-styles";
import { useTroubleshooter } from "@/lib/troubleshooter/TroubleshooterProvider";

/** Starts (or continues) a troubleshooting conversation on a known topic. */
export function StartTopicButton({ topicId, label }: { topicId: string; label: string }) {
  const { startTopic } = useTroubleshooter();
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (startTopic(topicId)) router.push("/troubleshooter");
      }}
      className={buttonStyles({ size: "sm", className: "min-h-10 justify-start text-left" })}
    >
      <Wrench aria-hidden className="size-3.5 shrink-0 text-signal-400" />
      {label}
    </button>
  );
}
