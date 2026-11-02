"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from "react";
import { validateWorkspaceCommands, type WorkspaceCommand } from "./commands";
import { initialWorkspaceState, workspaceReducer, type WorkspaceState } from "./state";

export const STUDIO_PATH = "/studio";

interface WorkspaceContextValue {
  state: WorkspaceState;
  /**
   * Run UI commands. Input is treated as untrusted: each command is validated
   * and invalid ones are rejected (returned in `errors`) without side effects.
   */
  run: (commands: unknown) => { applied: WorkspaceCommand[]; errors: string[] };
  /** Pages that embed the explorer register here so we don't navigate away. */
  setEmbeddedExplorerVisible: (visible: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function batchReducer(state: WorkspaceState, commands: WorkspaceCommand[]): WorkspaceState {
  return commands.reduce(workspaceReducer, state);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(batchReducer, initialWorkspaceState);
  const router = useRouter();
  const pathname = usePathname();
  const embeddedVisible = useRef(false);

  const run = useCallback(
    (input: unknown) => {
      const { commands, errors } = validateWorkspaceCommands(input);
      if (errors.length > 0 && process.env.NODE_ENV !== "production") {
        console.warn("[workspace] rejected commands:", errors);
      }
      if (commands.length > 0) dispatch(commands);
      const wantsExplorer = commands.some((c) => c.type === "open_studio_explorer");
      if (wantsExplorer && !embeddedVisible.current && pathname !== STUDIO_PATH) {
        router.push(STUDIO_PATH);
      }
      return { applied: commands, errors };
    },
    [pathname, router],
  );

  const setEmbeddedExplorerVisible = useCallback((visible: boolean) => {
    embeddedVisible.current = visible;
  }, []);

  const value = useMemo(() => ({ state, run, setEmbeddedExplorerVisible }), [state, run, setEmbeddedExplorerVisible]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return context;
}
