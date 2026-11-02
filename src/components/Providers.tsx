"use client";

import type { ReactNode } from "react";
import { TroubleshooterProvider } from "@/lib/troubleshooter/TroubleshooterProvider";
import { WorkspaceProvider } from "@/lib/workspace/WorkspaceProvider";

/** `clock` is injectable so tests can control session expiry. */
export function Providers({ children, clock }: { children: ReactNode; clock?: () => number }) {
  return (
    <WorkspaceProvider>
      <TroubleshooterProvider clock={clock}>{children}</TroubleshooterProvider>
    </WorkspaceProvider>
  );
}
