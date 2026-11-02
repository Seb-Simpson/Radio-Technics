/**
 * The hotspot editor is a developer tool. It never saves anything, but it is
 * still kept out of production unless explicitly enabled, because there is
 * no authentication yet (RT-002 C1).
 *
 * Enabled when: running `next dev`, or RT_ENABLE_HOTSPOT_EDITOR=1 is set on
 * the server (used by the end-to-end tests).
 */
export function isHotspotEditorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" || env.RT_ENABLE_HOTSPOT_EDITOR === "1";
}
