import { getEquipmentById } from "@/lib/content/equipment";
import { getViewById } from "@/lib/content/views";

/**
 * Structured UI commands that may manipulate the studio workspace.
 *
 * This is the ONLY way troubleshooting logic (today: scripted flows; later:
 * an AI model) can affect the interface. Every command is validated against
 * an allow-list of types and against real equipment/view IDs before it runs.
 * Commands never reach physical studio equipment.
 */
export type WorkspaceCommand =
  | { type: "select_equipment"; equipmentId: string }
  | { type: "highlight_equipment"; equipmentId: string }
  | { type: "open_studio_explorer"; equipmentId?: string }
  | { type: "show_view"; viewId: string }
  | { type: "clear_selection" };

export type WorkspaceCommandType = WorkspaceCommand["type"];

export const WORKSPACE_COMMAND_TYPES: readonly WorkspaceCommandType[] = [
  "select_equipment",
  "highlight_equipment",
  "open_studio_explorer",
  "show_view",
  "clear_selection",
] as const;

export type CommandValidation =
  | { ok: true; command: WorkspaceCommand }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommandType(value: unknown): value is WorkspaceCommandType {
  return typeof value === "string" && (WORKSPACE_COMMAND_TYPES as readonly string[]).includes(value);
}

function checkEquipmentId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return "equipmentId must be a non-empty string";
  if (!getEquipmentById(value)) return `Unknown equipment ID: "${value}"`;
  return null;
}

/**
 * Validate an untrusted value as a workspace command.
 * Unknown keys are dropped; the returned command is a fresh object.
 */
export function validateWorkspaceCommand(input: unknown): CommandValidation {
  if (!isRecord(input)) return { ok: false, error: "Command must be an object" };
  const { type } = input;
  if (!isCommandType(type)) return { ok: false, error: `Unsupported command type: ${String(type)}` };

  switch (type) {
    case "select_equipment":
    case "highlight_equipment": {
      const error = checkEquipmentId(input.equipmentId);
      if (error) return { ok: false, error };
      return { ok: true, command: { type, equipmentId: input.equipmentId as string } };
    }
    case "open_studio_explorer": {
      if (input.equipmentId === undefined) return { ok: true, command: { type } };
      const error = checkEquipmentId(input.equipmentId);
      if (error) return { ok: false, error };
      return { ok: true, command: { type, equipmentId: input.equipmentId as string } };
    }
    case "show_view": {
      const { viewId } = input;
      if (typeof viewId !== "string" || !getViewById(viewId)) {
        return { ok: false, error: `Unknown studio view ID: "${String(viewId)}"` };
      }
      return { ok: true, command: { type, viewId } };
    }
    case "clear_selection":
      return { ok: true, command: { type } };
  }
}

/** Validate a list of commands. Invalid commands are rejected individually. */
export function validateWorkspaceCommands(inputs: unknown): {
  commands: WorkspaceCommand[];
  errors: string[];
} {
  if (!Array.isArray(inputs)) return { commands: [], errors: ["Commands must be an array"] };
  const commands: WorkspaceCommand[] = [];
  const errors: string[] = [];
  for (const input of inputs) {
    const result = validateWorkspaceCommand(input);
    if (result.ok) commands.push(result.command);
    else errors.push(result.error);
  }
  return { commands, errors };
}

/** Standard command sequence for "show the user where this equipment is". */
export function showEquipmentCommands(equipmentId: string): WorkspaceCommand[] {
  return [
    { type: "select_equipment", equipmentId },
    { type: "highlight_equipment", equipmentId },
    { type: "open_studio_explorer", equipmentId },
  ];
}
