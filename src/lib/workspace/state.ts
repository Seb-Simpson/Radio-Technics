import { findViewForEquipment, getHotspotsForView, getViews } from "@/lib/content/views";
import type { WorkspaceCommand } from "./commands";

export interface WorkspaceState {
  selectedEquipmentId: string | null;
  /** The exact hotspot chosen, if selection came from a region of a photo. */
  selectedHotspotId: string | null;
  highlightedEquipmentId: string | null;
  activeViewId: string | null;
  /** Changes whenever the viewer should zoom to an equipment item. */
  focusRequest: { equipmentId: string; token: number } | null;
  /**
   * Counts select_equipment commands, so choosing the SAME item again is still
   * seen as a deliberate action (it renews the session's activity time).
   */
  selectionSeq: number;
}

export const initialWorkspaceState: WorkspaceState = {
  selectedEquipmentId: null,
  selectedHotspotId: null,
  highlightedEquipmentId: null,
  activeViewId: null,
  focusRequest: null,
  selectionSeq: 0,
};

function viewShowsEquipment(viewId: string | null, equipmentId: string): boolean {
  if (!viewId) return false;
  return getHotspotsForView(viewId).some((hotspot) => hotspot.equipmentId === equipmentId);
}

/**
 * Pure reducer. Commands must already be validated
 * (see validateWorkspaceCommand) before reaching here.
 */
export function workspaceReducer(state: WorkspaceState, command: WorkspaceCommand): WorkspaceState {
  switch (command.type) {
    case "select_equipment":
      return {
        ...state,
        selectedEquipmentId: command.equipmentId,
        selectedHotspotId: command.hotspotId ?? null,
        selectionSeq: state.selectionSeq + 1,
        highlightedEquipmentId:
          state.highlightedEquipmentId === command.equipmentId ? state.highlightedEquipmentId : null,
      };
    case "highlight_equipment": {
      const activeViewId = viewShowsEquipment(state.activeViewId, command.equipmentId)
        ? state.activeViewId
        : (findViewForEquipment(command.equipmentId)?.id ?? state.activeViewId);
      return {
        ...state,
        highlightedEquipmentId: command.equipmentId,
        activeViewId,
        focusRequest: { equipmentId: command.equipmentId, token: (state.focusRequest?.token ?? 0) + 1 },
      };
    }
    case "show_view":
      return { ...state, activeViewId: command.viewId };
    case "clear_selection":
      return { ...state, selectedEquipmentId: null, selectedHotspotId: null, highlightedEquipmentId: null };
    case "open_studio_explorer":
      // Navigation is a side effect handled by the provider.
      return command.equipmentId && command.equipmentId !== state.selectedEquipmentId
        ? { ...state, selectedEquipmentId: command.equipmentId, selectedHotspotId: null }
        : state;
  }
}

/** The view to display: the active one if valid, otherwise the first available. */
export function resolveActiveViewId(state: WorkspaceState): string | null {
  const views = getViews();
  if (state.activeViewId && views.some((view) => view.id === state.activeViewId)) return state.activeViewId;
  return views[0]?.id ?? null;
}
