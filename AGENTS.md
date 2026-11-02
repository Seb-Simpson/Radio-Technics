# AGENTS.md — shared instructions for coding agents

Applies to every coding agent (Claude Code, Codex, others). Claude-specific notes are in `CLAUDE.md`.

## Project in one paragraph
Radio Technics is a Next.js 16 / React 19 / TypeScript (strict) / Tailwind CSS 4 application for a single radio studio. It has a photo-based Studio Explorer with equipment hotspots, a prototype troubleshooting chat (scripted, deterministic — not AI yet), a Knowledge Centre and a read-only Administration page. There is no backend, database or authentication in this phase.

## Run and test
```bash
npm install
npm run dev            # development server on :3000
npm run typecheck
npm test               # Vitest
npm run build
npm run test:e2e       # Playwright; run after `npm run build`
npm run check          # typecheck + unit tests + build
```
All of these must pass before you hand work back. Report failures honestly, with output.

## Code ownership conventions
| Area | Location | Notes |
| --- | --- | --- |
| Domain types | `src/types/` | Change deliberately; many modules depend on them. |
| Content data | `src/data/` | Station information. Follow the "unverified advice" rules below. |
| Content access & validation | `src/lib/content/` | `validateContent()` must return no issues. |
| Workspace commands & state | `src/lib/workspace/` | Security boundary between troubleshooting logic and UI. |
| Troubleshooting engine | `src/lib/troubleshooter/` | Pure functions. No React, I/O or randomness in `engine.ts`/`interpret.ts`. |
| Knowledge search | `src/lib/knowledge/` | |
| UI components | `src/components/{shell,ui,studio,troubleshooter,knowledge,dashboard}` | Reuse `ui/` primitives. |
| Routes | `src/app/` | Thin pages composing components. |
| Tests | `tests/unit`, `tests/e2e` | Keep alongside behaviour changes. |

Keep changes focused. Don't reformat or restructure unrelated files. Don't add dependencies without a clear need; prefer free, open-source libraries; never add paid services or require API keys without explicit approval.

## Rules for avoiding unverified technical advice
1. Never invent model numbers, wiring, signal routing, settings, specifications or step-by-step procedures — not in data, UI copy, tests, or documentation.
2. Mark every fact with a `VerificationStatus`: `verified` (engineer confirmed, with `lastReviewed` date), `station-reported`, or `draft`. Default to `draft`.
3. If you need a fact that isn't recorded, add it as a question in the equipment record's `requiresVerification` and in `EQUIPMENT.md` instead of guessing.
4. Troubleshooting flows may ask questions and collect information. They must end by offering technical support, and must not prescribe a fix unless an engineer-verified procedure exists.
5. Generic safety cautions (e.g. "don't unplug cables you're unsure about while on air") are acceptable; station-specific instructions are not, until verified.
6. Never present illustrative images or diagrams as the real studio; never imply the app is connected to, or can control, real equipment.
7. Any AI integration must emit structured commands that are validated against the allow-list and real content IDs before use.

## Adding studio photographs
See README → "Adding studio photographs".
