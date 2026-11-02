# Phase Status

## RT-001 — Foundation

**Status:** Complete, except real-photograph integration (photos not yet supplied).
**Branch:** `claude/rt-001-foundation`

### Completed
- Next.js 16 (App Router), React 19, strict TypeScript, Tailwind CSS 4, Lucide icons. Self-hosted fonts (no network needed at build).
- Persistent app shell: sidebar on large screens, scrollable top navigation on smaller screens, skip link, prototype labelling.
- **Dashboard:** troubleshoot / explore actions, common-problem shortcuts that start conversations, equipment shortcuts by category that open the explorer on that item, setup progress computed from real project data.
- **Studio Explorer:** zoom (buttons, wheel, pinch, keyboard), pan (drag, touch, arrow keys), reset; hotspots positioned as image fractions so they stay aligned at any size; hover, focus, selected and highlighted states; zoom-to-equipment on highlight; equipment list as an accessible alternative; empty state when no views exist; error state when a photo file fails to load.
- **Equipment panel:** name, description, function, known information, reported problems, related guides, open engineer questions — each fact with a verification badge.
- **Troubleshooter:** deterministic interpreter + pure engine; scenarios 1–3 from the brief; ambiguity clarification (microphones, Myriad vs green button, monitor speakers vs screens); unknown equipment handling; cable caution; possible-silence urgent outcome; universal responses on every question; support summary with copy; works with the explorer selection; embedded studio on wide screens.
- **Workspace integration:** allow-listed, validated `WorkspaceCommand`s (`select_equipment`, `highlight_equipment`, `open_studio_explorer`, `show_view`, `clear_selection`) executed through `WorkspaceProvider`. Invalid commands and unknown IDs are rejected.
- **Knowledge Centre:** 8 articles (guides, troubleshooting, help topics), search with ranking, type and verification filters, article pages with per-section status and "show in studio" links.
- **Administration:** read-only tables for equipment, articles and studio views, plus a live content-integrity check.
- Documentation: `PROJECT_BRIEF.md`, `ROADMAP.md`, `EQUIPMENT.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, this file.

### Tests performed (all run and passing at time of writing)
| Check | Command | Result |
| --- | --- | --- |
| TypeScript (strict) | `npm run typecheck` | Pass |
| Unit & component tests | `npm test` | 80 / 80 pass (7 files) |
| Production build | `npm run build` | Pass (15 static pages) |
| End-to-end (Chromium) | `npm run test:e2e` | 24 / 24 pass — 8 tests × desktop 1440px, tablet 820px, phone 390px |

Coverage of the RT-001 requirements:
1. Build succeeds — `npm run build`.
2. TypeScript passes — `npm run typecheck` (also run by the build).
3. Navigation works — `navigation.test.tsx`, e2e "main navigation" (all widths, no console errors, no horizontal scroll).
4. Equipment records load — `content.test.ts` (unique IDs, required fields, integrity).
5. Selection updates the panel — `studio-explorer.test.tsx`, e2e "selecting a hotspot".
6. Responses advance — `troubleshooter-engine.test.ts`, `troubleshooter-ui.test.tsx`.
7. Ambiguity triggers clarification — interpreter and scenario tests.
8. Unknown equipment handled safely — engine, command-validation, panel and viewer tests.
9. Highlight actions identify valid equipment — `workspace.test.ts`, "only ever emits valid workspace commands", e2e "Show me where".
10. Missing photographs handled — illustrative fallback, empty-state and failed-image tests.

Also: an exhaustive "no dead ends" test walks every reachable conversation step.

### Outstanding issues
- **Studio photographs not supplied.** The explorer shows an illustrative drawing with placeholder hotspots. Real image integration and hotspot placement remain outstanding.
- No engineer-verified information; technical-support contact details unknown.
- State (conversation, selection) is in memory only and resets on reload.
- Automated accessibility audit (axe) not yet added; manual keyboard and screen-reader labelling done.
- On phones the troubleshooter's "Show me where" navigates to the Studio Explorer (a "Back to troubleshooter" button returns) rather than showing both side by side.

### Next development tasks (RT-002)
1. Add the ten photographs; create view records; place real hotspots with the engineer.
2. Build a dev-only hotspot placement helper.
3. Engineer review session using `EQUIPMENT.md` questions; update statuses.
4. Add axe accessibility checks to the e2e suite and a CI workflow running `npm run check` + e2e.
5. Persist conversation/selection in `sessionStorage` so a reload mid-problem doesn't lose context.
