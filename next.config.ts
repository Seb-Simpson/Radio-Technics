import type { NextConfig } from "next";

/**
 * Two builds from the same code:
 *   - `npm run build` — the normal server build (`next start`, tests).
 *   - `npm run build:pages` — a fully static site in `out/` for GitHub Pages
 *     (or any static host). Everything in the app runs in the browser, so
 *     nothing is lost — except the developer-only hotspot editor, which needs
 *     a server and is left out of static builds.
 * NEXT_PUBLIC_BASE_PATH sets the sub-path the site is served under (GitHub
 * Pages project sites live at /<repo-name>).
 */
const staticExport = process.env.RT_STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(basePath ? { basePath } : {}),
  ...(staticExport ? { output: "export" as const, trailingSlash: true, images: { unoptimized: true } } : {}),
  // The hotspot editor's page file is `page.dev.tsx`: only a route in server builds.
  pageExtensions: staticExport ? ["tsx", "ts"] : ["tsx", "ts", "dev.tsx"],
};

export default nextConfig;
