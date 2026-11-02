import { equipment, equipmentCategories } from "@/data/equipment";
import type { EquipmentCategory, EquipmentCategoryId, EquipmentRecord } from "@/types";

const byId = new Map(equipment.map((record) => [record.id, record]));

export function getAllEquipment(): EquipmentRecord[] {
  return equipment;
}

/** Returns undefined for unknown IDs — callers must handle that case. */
export function getEquipmentById(id: string | null | undefined): EquipmentRecord | undefined {
  if (!id) return undefined;
  return byId.get(id);
}

export function isKnownEquipmentId(id: unknown): id is string {
  return typeof id === "string" && byId.has(id);
}

export function getCategories(): EquipmentCategory[] {
  return equipmentCategories;
}

export function getCategory(id: EquipmentCategoryId): EquipmentCategory | undefined {
  return equipmentCategories.find((category) => category.id === id);
}

export function getEquipmentByCategory(id: EquipmentCategoryId): EquipmentRecord[] {
  return equipment.filter((record) => record.category === id);
}
