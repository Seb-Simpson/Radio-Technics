# Publishing Radio Technics as a website

The whole app runs in the browser, so it can be published as plain files:
`npm run build:pages` writes a complete static site to `out/`. The only thing
left out is the developer-only hotspot editor (`/dev/hotspots`), which needs a
server. Everything else works, including saved sessions (they stay in each
visitor's own browser tab) and the urgent broadcast button.

Anyone with the link can use the site. Visitors don't need a GitHub account.

## Before publishing — please read
- **Do not make this repository public yet.** The original, unredacted rack
  photo (with a phone number) is still reachable through PR #2's old commit
  (`refs/pull/2/head`). A public repository would expose it. GitHub Support has
  to remove it first: see `docs/SECURITY-PHOTO-EXPOSURE.md`.
- The published site is **public**. It shows the studio photographs (the rack
  photo is redacted) and the equipment notes. It asks search engines not to
  index it, but anyone with the link can open it.
- It is a **prototype**. The latest safety work has not been independently
  audited. Don't rely on it for real on-air emergencies.

## Option A — GitHub Pages from this (private) repository
GitHub Pages for a private repository needs a paid GitHub plan (Pro or above).
The site is public; the code and its history stay private.

1. Repository **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
2. Merge to `main` (or run **Actions → Publish to GitHub Pages → Run workflow**).
3. The site appears at `https://<your-username>.github.io/Radio-Technics/`
   (the exact link is shown on the workflow run and in Settings → Pages).

## Option B — free: publish only the built site to a separate public repository
For a free account. The new repository contains only the built website files
(no source code, no history, no unredacted photo).

1. Create a new **public** repository, for example `radio-technics-site`,
   with nothing in it.
2. Build with that repository's name as the base path and publish `out/`:
   ```bash
   NEXT_PUBLIC_BASE_PATH=/radio-technics-site npm run build:pages
   ```
   then push the contents of `out/` (plus an empty `.nojekyll` file) to the new
   repository's `main` branch.
3. In the new repository: **Settings → Pages → Source: "Deploy from a branch"**,
   branch `main`, folder `/ (root)`.
4. The site appears at `https://<your-username>.github.io/radio-technics-site/`.

Each update means rebuilding and pushing `out/` again.

## Checking a build locally
`npm run build:pages` (optionally with `NEXT_PUBLIC_BASE_PATH`) and serve `out/`
with any static file server under the same path.
