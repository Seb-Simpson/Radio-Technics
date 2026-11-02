# CLAUDE.md — Radio Technics

Instructions for Claude Code sessions working on this repository. Read `AGENTS.md` too; it holds the rules shared with other agents.

## What this is
A Next.js (App Router) + TypeScript + Tailwind v4 app that helps radio presenters understand studio equipment and troubleshoot problems. Phase status lives in `PHASE_STATUS.md`; the plan is in `ROADMAP.md`.

## Commands
```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit (strict)
npm test             # Vitest unit + component tests
npm run build        # production build
npm run test:e2e     # Playwright (needs `npm run build` first; starts `next start` on :3100)
npm run check        # typecheck + test + build
```
Run `npm run check` before every commit, and `npm run test:e2e` after UI changes. Never report a check as passing unless you ran it.

## Architecture rules
- **Content is data.** Equipment (`src/data/equipment.ts`), studio views (`studio-views.ts`), hotspots (`hotspots.ts`), articles (`articles.ts`) and troubleshooting flows (`troubleshooting-flows.ts`) are structured records linked **by ID**. Never copy equipment text into components or hotspots.
- **Shared types** live in `src/types/index.ts` (domain) and `src/lib/troubleshooter/types.ts` (conversation).
- **Lookups** go through `src/lib/content/*` and `src/lib/knowledge/search.ts`, which return `undefined` for unknown IDs — always handle that.
- **Workspace commands** (`src/lib/workspace/commands.ts`) are the only way troubleshooting logic may change the UI. Every command passes `validateWorkspaceCommand` (allow-listed type + real IDs). Do not add command types that touch real equipment, run code, or navigate to arbitrary URLs.
- **The troubleshooting engine** (`src/lib/troubleshooter/engine.ts`) is pure: `(state, input, context) → (state, commands)`. Keep it free of React, network and time. A future AI should plug in by producing the same `Interpretation`/command shapes.
- **Application state**: `WorkspaceProvider` (selection, highlight, active view, focus requests) and `TroubleshooterProvider` (conversation) wrap the app in `src/app/layout.tsx`, so state survives navigation.
- **Hotspots** use fractional regions (0–1) of the image, so they stay aligned at any size or zoom. Use `regionFromPixels` to convert from pixel measurements.
- Server components must not import plain values from `"use client"` modules — put shared constants in non-client modules (see `src/lib/knowledge/labels.ts`).
- Run `validateContent()` (unit-tested, also shown on /admin) after changing any data file.

## Safety requirements (non-negotiable)
- Do not invent model numbers, cable connections, settings, specifications or procedures. Record unknowns in `requiresVerification` and `EQUIPMENT.md`.
- Only the station engineer can make something `verified`; set `lastReviewed` when that happens.
- Troubleshooting flows gather information; they must not prescribe fixes unless a verified procedure exists.
- Every question node needs `unsureNext`; every path must end in an outcome offering technical support. The "no dead ends" test enforces this.
- The app must never claim a live connection to the studio or present the troubleshooter as a live AI while it is scripted.
- Never present the illustrative layout or any stock image as the real studio.

## UI conventions
- Dark charcoal/slate surfaces with restrained teal (`signal-*`) accents; amber (`caution-*`) for unverified/warnings; red (`alert-*`) only for urgent states. Tokens are in `src/app/globals.css`.
- Plain English, one question at a time, visible focus states, real labels for every control, respect `prefers-reduced-motion`.
- No placeholder statistics, fake status indicators or non-functional controls. Unbuilt features get an honest, labelled placeholder.
- Use `buttonStyles()` for buttons/links; Lucide icons with `aria-hidden`.

## Testing expectations
- Unit tests in `tests/unit` (Vitest + Testing Library, jsdom). `tests/setup.ts` mocks `next/navigation` and `matchMedia` (`media.wide` toggles the troubleshooter's embedded studio).
- E2E tests in `tests/e2e` run at desktop (1440), tablet (820) and narrow (390) widths.
- Add a test for every new flow node behaviour, command type or content rule.

## Git
- Work on a feature branch; do not push to `main` or open PRs unless asked.
- Don't commit build output (`.next`, `test-results`).
