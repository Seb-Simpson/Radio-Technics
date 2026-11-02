import { describe, expect, it } from "vitest";
import { showEquipmentCommands, validateWorkspaceCommand, validateWorkspaceCommands } from "@/lib/workspace/commands";
import { initialWorkspaceState, workspaceReducer } from "@/lib/workspace/state";

describe("workspace command validation", () => {
  it("accepts valid commands", () => {
    expect(validateWorkspaceCommand({ type: "highlight_equipment", equipmentId: "green-next-button" })).toEqual({
      ok: true,
      command: { type: "highlight_equipment", equipmentId: "green-next-button" },
    });
    expect(validateWorkspaceCommand({ type: "open_studio_explorer" }).ok).toBe(true);
    expect(validateWorkspaceCommand({ type: "show_view", viewId: "demo-layout" }).ok).toBe(true);
  });

  it("rejects unknown equipment IDs", () => {
    const result = validateWorkspaceCommand({ type: "highlight_equipment", equipmentId: "toaster" });
    expect(result).toEqual({ ok: false, error: 'Unknown equipment ID: "toaster"' });
    expect(validateWorkspaceCommand({ type: "select_equipment" }).ok).toBe(false);
    expect(validateWorkspaceCommand({ type: "open_studio_explorer", equipmentId: "nope" }).ok).toBe(false);
  });

  it("rejects unsupported command types and malformed input", () => {
    expect(validateWorkspaceCommand({ type: "press_button_on_air", equipmentId: "green-next-button" }).ok).toBe(false);
    expect(validateWorkspaceCommand({ type: "eval", code: "alert(1)" }).ok).toBe(false);
    expect(validateWorkspaceCommand("highlight_equipment").ok).toBe(false);
    expect(validateWorkspaceCommand(null).ok).toBe(false);
    expect(validateWorkspaceCommand([]).ok).toBe(false);
    expect(validateWorkspaceCommand({ type: "show_view", viewId: "nowhere" }).ok).toBe(false);
  });

  it("strips unexpected properties", () => {
    const result = validateWorkspaceCommand({ type: "select_equipment", equipmentId: "mixing-console", script: "x" });
    expect(result.ok && result.command).toEqual({ type: "select_equipment", equipmentId: "mixing-console" });
  });

  it("validates lists individually", () => {
    const { commands, errors } = validateWorkspaceCommands([
      { type: "select_equipment", equipmentId: "mixing-console" },
      { type: "highlight_equipment", equipmentId: "fake" },
    ]);
    expect(commands).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(validateWorkspaceCommands("nope").errors).toHaveLength(1);
  });

  it("show-equipment helper produces only valid commands", () => {
    const { errors } = validateWorkspaceCommands(showEquipmentCommands("green-next-button"));
    expect(errors).toEqual([]);
  });
});

describe("workspace reducer", () => {
  it("highlights equipment, switches to a view showing it and requests focus", () => {
    const state = workspaceReducer(initialWorkspaceState, { type: "highlight_equipment", equipmentId: "green-next-button" });
    expect(state.highlightedEquipmentId).toBe("green-next-button");
    expect(state.activeViewId).toBe("demo-layout");
    expect(state.focusRequest).toEqual({ equipmentId: "green-next-button", token: 1 });
    const again = workspaceReducer(state, { type: "highlight_equipment", equipmentId: "green-next-button" });
    expect(again.focusRequest?.token).toBe(2);
  });

  it("selecting different equipment clears an old highlight", () => {
    let state = workspaceReducer(initialWorkspaceState, { type: "highlight_equipment", equipmentId: "mixing-console" });
    state = workspaceReducer(state, { type: "select_equipment", equipmentId: "zoom-camera" });
    expect(state.selectedEquipmentId).toBe("zoom-camera");
    expect(state.highlightedEquipmentId).toBeNull();
  });

  it("clears selection", () => {
    let state = workspaceReducer(initialWorkspaceState, { type: "select_equipment", equipmentId: "zoom-camera" });
    state = workspaceReducer(state, { type: "clear_selection" });
    expect(state.selectedEquipmentId).toBeNull();
  });
});
