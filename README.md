# Radio Technics

An interactive studio explorer and troubleshooting assistant for radio presenters.

> **Status: Phase RT-002 prototype.** Not connected to any studio equipment. The troubleshooter follows scripted conversations — it is not a live AI. No information has been verified by the station engineer yet.

## Current functionality
- **Dashboard** — quick actions, common problems, equipment shortcuts, honest setup progress.
- **Studio Explorer** — the station's ten real photographs (thumbnail tabs), each zoomable and pannable by mouse, touch, pinch or keyboard, with clickable equipment hotspots. On phones and tablets, selected equipment opens in a compact bottom sheet. Hotspot identifications are marked unverified until the engineer confirms them. A clearly labelled illustrative drawing is used only if no photographs are configured.
- **Troubleshooter** — scripted, deterministic conversations. Typed replies are understood structurally (yes / no / not sure, hedged answers, observations such as silence, requests for help, questions about restarting equipment), and contradictions get a clarifying question instead of a guess. Every question offers *I'm not sure*, *Show me where* and *I need technical support*. Possible silence on air is escalated. Ends with a copyable summary that keeps the presenter's own words.
- **Sessions** — a conversation survives a page refresh within the same browser tab, expires after two hours idle, and can be cleared with **End session**.
- **Knowledge Centre** — searchable guides and help topics, each showing its verification status.
- **Administration** — read-only content records and a live content-integrity check.
- **Hotspot editor (developers only)** — `/dev/hotspots`, for placing hotspots on photographs. Not available in production builds.
- **Installable** — web app manifest and icons, so it can be added to a phone's home screen. It does **not** work offline yet.

## Requirements
- Node.js 20.9 or newer (developed on Node 22)
- npm

## Setup and development
```bash
npm install
npm run dev
```
Open http://localhost:3000.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) at 1440, 820, 390, 375 and 320px, including axe accessibility checks and touch tests. Run `npm run build` first. If Playwright's browser isn't installed, run `npx playwright install chromium`. |
| `npm run check` | Typecheck + unit tests + build |

## Project structure
```
src/
  app/                    Routes: / (dashboard), /studio, /troubleshooter, /knowledge, /knowledge/[articleId], /admin
  components/
    shell/                App shell, navigation
    ui/                   Shared primitives (badges, notices, button styles)
    studio/               PhotoViewer (zoom/pan/hotspots), StudioDiagram, EquipmentPanel, StudioExplorer
    troubleshooter/       Chat interface
    knowledge/            Knowledge Centre UI
    dashboard/            Dashboard client widgets
  data/                   Equipment, studio views, hotspots, articles, troubleshooting flows
  lib/
    content/              Lookups + validateContent()
    workspace/            Validated UI commands, reducer, WorkspaceProvider
    troubleshooter/       Interpreter, pure engine, TroubleshooterProvider
    knowledge/            Search
  types/                  Shared domain types
tests/
  unit/                   Vitest tests
  e2e/                    Playwright tests
```

## Adding studio photographs
1. **Import** the photo. This applies the camera's orientation, removes all metadata (including GPS location), caps the size at 2400px and can blur sensitive areas such as a logged-in name on a screen:
   ```bash
   node scripts/import-photo.mjs ~/Downloads/IMG_1234.jpg presenter-desk
   node scripts/import-photo.mjs ~/Downloads/IMG_1235.jpg myriad-screen --blur 215,423,125,20
   ```
   It writes `public/studio/photos/<id>.jpg` and prints the real width and height.
2. **Register** it in `studioPhotos` in `src/data/studio-views.ts` with the `photo(...)` helper (id, title, description, alt text, width, height).
3. **Place hotspots** with the developer editor: run `npm run dev`, open http://localhost:3000/dev/hotspots, choose the photo (or open a local file to try it first), pick the equipment and drag to draw. Regions can be moved, resized with the corner handles or arrow keys, and checked with *Preview in viewer*. Copy the generated lines into `photoHotspots` in `src/data/hotspots.ts`.
4. Run `npm test`. The content-integrity tests reject unknown IDs, invalid geometry and photos that still contain metadata.

New hotspots are recorded with `identity: "draft"`. Only change that to `verified` with a `review` record once the engineer has confirmed the item.

## Limitations (RT-002)
- Troubleshooter uses deterministic understanding and scripted flows, not AI.
- No engineer-verified information or procedures yet; technical-support contact details have not been provided.
- Hotspot positions were placed from the photographs by the development team; which equipment each one shows is unconfirmed.
- No authentication or editing. Sessions are kept only in the current browser tab.
- No offline support (no service worker).
- Tested in Chromium with emulated phones and touch; not yet tested on physical iPhones or Android devices.
- Not deployed.

See `PHASE_STATUS.md` for details and `ROADMAP.md` for next steps.
