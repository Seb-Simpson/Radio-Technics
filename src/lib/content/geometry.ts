import type { HotspotRegion } from "@/types";

/** Smallest hotspot allowed, as a fraction of the image (0.5% of each side). */
export const MIN_REGION_FRACTION = 0.005;

/**
 * Validate a fractional hotspot region. Rejects NaN/Infinity, negative or
 * zero sizes, and anything extending outside the image.
 */
export function validateRegion(region: unknown): string[] {
  if (typeof region !== "object" || region === null) return ["Region must be an object"];
  const r = region as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of ["x", "y", "width", "height"] as const) {
    const value = r[key];
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${key} must be a finite number`);
  }
  if (errors.length > 0) return errors;
  const { x, y, width, height } = r as unknown as HotspotRegion;
  if (x < 0 || y < 0) errors.push("Region starts outside the image");
  if (width < MIN_REGION_FRACTION || height < MIN_REGION_FRACTION) errors.push("Region is too small");
  if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) errors.push("Region extends past the edge of the image");
  if (x > 1 || y > 1) errors.push("Region starts outside the image");
  return errors;
}

/** Pixel rectangle (left/top/right/bottom) → fractional region, rounded to 4 d.p. */
export function pixelsToRegion(size: { width: number; height: number }, rect: { left: number; top: number; right: number; bottom: number }): HotspotRegion {
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return {
    x: round(rect.left / size.width),
    y: round(rect.top / size.height),
    width: round((rect.right - rect.left) / size.width),
    height: round((rect.bottom - rect.top) / size.height),
  };
}
