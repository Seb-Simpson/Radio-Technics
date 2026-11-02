"use client";

import { Crosshair } from "lucide-react";
import { buttonStyles } from "@/components/ui/button-styles";
import { showEquipmentCommands } from "@/lib/workspace/commands";
import { useWorkspace } from "@/lib/workspace/WorkspaceProvider";

export function ShowInStudioButton({ equipmentId, label }: { equipmentId: string; label: string }) {
  const { run } = useWorkspace();
  return (
    <button type="button" onClick={() => run(showEquipmentCommands(equipmentId))} className={buttonStyles({ size: "sm" })}>
      <Crosshair aria-hidden className="size-3.5 text-signal-400" />
      {label}
    </button>
  );
}
