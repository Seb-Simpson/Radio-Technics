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
- **Reply understanding** (`src/lib/troubleshooter/understand.ts`) splits messages into clauses, applies self-corrections (sorry/actually/I mean…), reads stance across clauses (affirm/negate/uncertain/conflict), and extracts claims about sound (`audio`: present/absent) with negation. Flow options declare what they assert (`answer` for this exact question, `audio`). An option may only be chosen if consistent with BOTH stance and observations; otherwise ask again and record nothing. Never go back to first-clause or first-match logic.
- **One answer path (RT-002D-R1)**: an answer is created ONLY when the presenter presses an option displayed for the ACTIVE question instance (`UserInput.option` carries `instanceId`; `respond` refuses any other instance). Typed text — including "yes", "no", exact labels and paraphrases — never records or confirms anything; it may only produce a `check` suggestion ("It sounds like … Is that correct?") showing the real answer buttons. Refused inputs return `rejected`, change nothing and are never saved. New answer buttons are armed after `ACTIVATION_GUARD.ms` (aria-disabled until then); double-click detail and key repeat are blocked. Corrections use the `correct-select`/`correct` steps: originals are kept with `supersededBy`.
- **Observation / interpretation (RT-002D)**: the presenter's words are kept verbatim (`observations`); `claims.ts` reads what STATEMENTS say about each question's subject (sound, meter movement, worked earlier, found) only to choose a suggestion. Options declare their claim (`audio` or `asserts`) and a `restate`. Claims about another subject and corrections of WHICH equipment is meant never answer the current question. Answers carry provenance (`questionId`, `optionId`, `source`).
- **Safety before routing**: `safety.ts` (`classifyBroadcast`) reads every message independently of the question and options: current-confirmed / current-possible / historical / hypothetical / denied / resumed / none. Recovery counts only when it is about the broadcast ("back on air"), never local monitoring. `handleText` applies it to the incident model (`incident.status`: none / possible / confirmed / reported-resumed, with a never-erased `entries` history; plus `urgent`, `confirmedOffAir`, `possibleSilence`) before handling help requests, procedure questions or answers. The "We're off air / urgent broadcast problem" button (every page) and "Broadcasting has resumed" work without language understanding. The whole input is classified; over-long input is refused, never truncated. Urgency only ever increases; a support request or change of subject never clears it. A proposed answer that leads to the urgent outcome escalates (as possible) immediately, before confirmation. Never move this after routing.
- **The troubleshooting engine** (`src/lib/troubleshooter/engine.ts`) is pure: `(state, input, context) → (state, commands)`. Keep it free of React, network and time. A future AI should plug in by producing the same `Interpretation`/command shapes.
- **Application state**: `WorkspaceProvider` (selection, highlight, active view, focus requests) and `TroubleshooterProvider` (conversation) wrap the app in `src/app/layout.tsx`, so state survives navigation. Sessions persist in `sessionStorage` via `src/lib/session/storage.ts` as **validated input events only**; the conversation is rebuilt by replaying them through the engine (`replayEvents`), so stored data can never supply answers, urgency or message IDs. A button press is replayed only if it was on screen. Bump `ENGINE_VERSION` when engine behaviour changes. Browser storage is not tamper-proof; see the limitation in `storage.ts`.
- **Selection**: the workspace tracks `selectedEquipmentId` and, separately, `selectedHotspotId` (validated against the equipment). Several hotspots may share one equipment record; the panel shows the chosen hotspot's note.
- **Sessions** expire two hours after the last USER action (`TroubleshooterProvider` `clock` prop). Saves must never stamp "now"; expiry is enforced before processing input, on an interval and on focus.
- **Chat scrolling** has ONE owner (the messages effect in `Troubleshooter.tsx`): one scroll per conversation update, after layout. Don't add other scrollIntoView/scrollTo calls for messages; focus moves use `preventScroll`.
- **Short screens**: use the `tall:` variant (min-height 720px) for fixed-height panels and sticky headers; below it, content must flow and scroll.
- **Responsive layout**: below 1280px the Studio Explorer uses a bottom sheet (`EquipmentSheet`); below 1024px the shell uses a compact header and menu. Don't pin elements over interactive content on phones (axe target-size / focus-not-obscured).
- **Hotspots** use fractional regions (0–1) of the image, so they stay aligned at any size or zoom. Use `regionFromPixels` to convert from pixel measurements.
- Server components must not import plain values from `"use client"` modules — put shared constants in non-client modules (see `src/lib/knowledge/labels.ts`).
- **Authority levels**: `verified` > `manufacturer-documented` > `station-reported` > `draft`. Articles have `kind` (`informational` / `approved-procedure`); an approved procedure must be verified with review metadata. Manufacturer sources record `retrievedOn` (null = not read) and must not be cited as manufacturer-documented until read. See `docs/ENGINEER_REVIEW.md`.
- **Knowledge search** (`src/lib/knowledge/search-engine.ts` + `src/data/search-vocabulary.ts`) is local and deterministic (`isAI: false`). Results act through validated workspace commands only. Selection is used only for vague questions. Keep urgent silence handling first.
- **RT-004** AI output is IDENTIFIERS only (`clarification` question ID, retrieved `articles` IDs, approved `procedure` ID + version, `fallback` ID); every word shown comes from local templates or approved knowledge-base content. Never accept model prose or a model's safety declaration, and never add a prose filter in its place. Parse with own-key checks only (no `in`/index lookups on untrusted names). See `docs/RT-004-AI-ARCHITECTURE.md`.
- Run `validateContent()` (unit-tested, also shown on /admin) after changing any data file.

## Safety requirements (non-negotiable)
- Do not invent model numbers, cable connections, settings, specifications or procedures. Record unknowns in `requiresVerification` and `EQUIPMENT.md`.
- Only the station engineer can make something `verified`, and it must carry a `review` record (reviewer, real date, source). `validateContent()` enforces this; never weaken it.
- Details read from photographs are observations: record them as `draft` with a `source`, never as confirmed facts or instructions.
- Typed text must never reset a conversation. Clearing only happens through the confirmed **End session** action.
- Questions about restarting/unplugging equipment get the safe "no approved instructions" reply; never add recovery procedures without verification.
- Possible silence on air must stay a priority path (see `understand.ts` signals and `outcome-urgent`).
- Only statements record facts: questions, hypotheticals and strong uncertainty never become observations or answers (`understand.ts` clause modality). Keep `offAir` "confirmed" vs "possible" apart (`confirmedOffAir`); both escalate, only stated fact is summarised as confirmed. Politeness ("sorry", "hang on") is not a correction. A yes/no word never overrides the rest of the sentence (RT-QA-002B).
- Photos must be imported with `scripts/import-photo.mjs` (strips metadata; `--blur` for names on screens, `--redact` for anything that must be unreadable such as phone numbers).
- Review records and provenance must be meaningful (no TBC/n/a placeholders). Validation cannot prove genuine approval; never claim it does.
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
- E2E tests in `tests/e2e` run at 1440, 820, 390, 375 and 320px and include axe checks (`accessibility.spec.ts`), touch/mobile (`mobile.spec.ts`), sessions, viewer regressions and the hotspot editor. The Playwright web server sets `RT_ENABLE_HOTSPOT_EDITOR=1`.
- Playwright reuses a running server on :3100. Stop any old `next start` before running e2e after a rebuild, or tests hit stale JavaScript.
- Node-environment suites (e.g. `photo-pipeline.test.ts`) must keep working: `tests/setup.ts` guards `window`. Check the **Test Files** count, not just Tests, when reading results.
- Add a test for every new flow node behaviour, command type or content rule.

## Git
- Work on a feature branch; never push directly to `main`.
- The repository owner has authorised pushing feature branches and opening a pull request after each completed change. Run `npm run check` (and `npm run test:e2e` for UI changes) before pushing. Merging remains the owner's decision.
- History was rewritten once (RT-002B) to remove an unredacted photo; if a local clone predates it, re-clone rather than merging old history back in.
- Don't commit build output (`.next`, `test-results`).
