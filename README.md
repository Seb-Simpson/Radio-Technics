# Radio Technics

An interactive studio explorer and troubleshooting assistant for radio presenters.

> **Status: Phase RT-001 prototype.** Demonstration data only. Not connected to any studio equipment. The troubleshooter follows scripted conversations — it is not a live AI. No information has been verified by the station engineer yet.

## Current functionality
- **Dashboard** — quick actions, common problems, equipment shortcuts, honest setup progress.
- **Studio Explorer** — zoomable, pannable studio view (mouse, touch, pinch, keyboard) with clickable equipment hotspots, hover/selected/highlighted states and an equipment detail panel. Until real photographs are added it shows a clearly labelled *illustrative layout* with placeholder hotspots.
- **Troubleshooter** — scripted, deterministic conversations that clarify vague descriptions ("it's not doing anything", "the green thing isn't working"), ask one question at a time, and always offer *I'm not sure*, *Show me where* and *I need technical support*. "Show me where" highlights equipment in the studio view (beside the chat on wide screens; opens the Studio Explorer on smaller ones). Ends with a copyable summary for technical support.
- **Knowledge Centre** — searchable equipment guides, troubleshooting articles and help topics, each with verification status.
- **Administration** — read-only content records and a live content-integrity check. No editing until authentication exists.

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
| `npm run test:e2e` | Browser tests at desktop, tablet and phone widths (Playwright). Run `npm run build` first. If Playwright's browser isn't installed, run `npx playwright install chromium`. |
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
1. Copy the photograph into `public/studio/photos/`, e.g. `public/studio/photos/studio-desk.jpg`. Resize to around 2400px on the long edge and remove location metadata.
2. Add a record to `studioPhotos` in `src/data/studio-views.ts`:
   ```ts
   {
     id: "studio-desk",
     title: "Presenter desk",
     description: "View from the presenter's chair.",
     kind: "photo",
     src: "/studio/photos/studio-desk.jpg",
     width: 2400,   // the image's real pixel size
     height: 1600,
     alt: "Presenter desk with mixing console and screens",
     illustrative: false,
   }
   ```
   As soon as at least one photo exists, the illustrative layout is no longer shown.
3. Add hotspots in `src/data/hotspots.ts`, measuring rectangles in image pixels:
   ```ts
   {
     id: "studio-desk-green-button",
     viewId: "studio-desk",
     equipmentId: "green-next-button",
     region: regionFromPixels({ width: 2400, height: 1600 }, { left: 1810, top: 1120, right: 1930, bottom: 1220 }),
     placeholder: false,
   }
   ```
   One equipment record can have hotspots in several photographs.
4. Run `npm test` — the content-integrity test catches unknown IDs and regions outside the image.

## Limitations (RT-001)
- No real studio photographs yet; hotspot positions are placeholders on an illustrative drawing.
- Troubleshooter uses keyword matching and scripted flows, not AI.
- No engineer-verified information or procedures; technical-support contact details not yet provided.
- No authentication, editing or persistence; conversation and selection reset on page reload.
- Not deployed.

See `PHASE_STATUS.md` for details and `ROADMAP.md` for next steps.
