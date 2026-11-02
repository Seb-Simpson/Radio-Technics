"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. Returns `false` on the server and during
 * the first client render, so markup always matches during hydration.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

/** Width at which the Studio Explorer shows its side panel instead of a bottom sheet. */
export const WIDE_LAYOUT_QUERY = "(min-width: 1280px)";
