"use client";

import type { ReactNode } from "react";
import { TroubleshooterProvider } from "@/lib/troubleshooter/TroubleshooterProvider";
import { WorkspaceProvider } from "@/lib/workspace/WorkspaceProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <TroubleshooterProvider>{children}</TroubleshooterProvider>
    </WorkspaceProvider>
  );
}
