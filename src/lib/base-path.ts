/**
 * Where the site is served from. Empty for a normal deployment; set (at build
 * time) to e.g. "/Radio-Technics" for GitHub Pages, which serves a project at
 * https://<user>.github.io/<repo>/. Next.js prefixes its own links, routes and
 * assets automatically; this helper is for plain <img src> and manifest paths
 * that come from content data as root paths ("/studio/photos/…").
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  return BASE_PATH && path.startsWith("/") && !path.startsWith("//") ? `${BASE_PATH}${path}` : path;
}
