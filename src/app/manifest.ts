import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/base-path";

// Generated once at build time (works in static builds too).
export const dynamic = "force-static";

/**
 * Web app manifest: lets the app be added to a phone's home screen and
 * opened full-screen. There is deliberately no service worker yet, so the
 * app does NOT work offline — see ROADMAP.md for the planned offline
 * strategy (approved emergency instructions only; no conversations cached).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Radio Technics",
    short_name: "Radio Technics",
    description: "Studio explorer and troubleshooting help for radio presenters (prototype).",
    start_url: withBasePath("/"),
    scope: withBasePath("/"),
    display: "standalone",
    orientation: "any",
    background_color: "#0b0e10",
    theme_color: "#0b0e10",
    categories: ["utilities", "productivity"],
    icons: [
      { src: withBasePath("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBasePath("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBasePath("/icons/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
