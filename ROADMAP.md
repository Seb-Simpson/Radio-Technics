# Roadmap

Phases are indicative. Each phase should finish with passing automated checks and an updated `PHASE_STATUS.md`.

## RT-001 — Foundation ✅
Next.js app shell, Studio Explorer, equipment panel, scripted troubleshooter, validated workspace commands, Knowledge Centre, read-only Administration, documentation and tests.

## RT-002 — Stabilisation, studio photos and mobile ✅
RT-QA-001 fixes (reply understanding, no accidental resets, preserved observations, support requests, silence escalation, viewer resize and keyboard, accessibility, validation), real photographs with hotspots, photo import pipeline, developer hotspot editor, session persistence, phone/tablet layouts, install foundation.

## RT-003 — Knowledge base & intelligent search foundation ✅ (this phase)
Authority levels incl. manufacturer documentation, structured articles with sources, symptoms, diagnostic and unresolved questions, glossary, version history; local presenter-vocabulary search with intents, ambiguity and selection context; engineer review queue; RT-004 AI contract and deterministic guards.

## RT-003c — Engineer review and verified knowledge
- Read the official Myriad 6 pages (allow broadcastradio.com hosts) and add original manufacturer-documented summaries.
- Walk through the photos and `EQUIPMENT.md` with the station engineer; confirm hotspot identities and answer the open questions.
- Record confirmations as `review` records; add verified procedures only once approved.
- Add the station's technical-support contact details (and confirm the number seen on the rack sticker).
- Test on real iPhones and Android phones in the studio.
- Move content from TypeScript files to a content store while keeping the same types.

## RT-003b — Knowledge base expansion
- Engineer review workflow: mark facts, sections and articles as `verified` with a review date.
- Add verified procedures (only once approved) and the station's technical-support contact details.
- Move content from TypeScript files to a content store (e.g. Markdown/MDX in the repo, or a small database) while keeping the same types.

## RT-004 — AI troubleshooter
- Replace the keyword interpreter with an LLM call behind a server route. The model returns the **same structured shapes** already used: an `Interpretation`, the next question, and `WorkspaceCommand`s.
- All model output is validated with `validateWorkspaceCommand` and content-ID checks before reaching the UI; unknown IDs are rejected.
- Ground answers in verified station documentation only (retrieval over Knowledge Centre content); the model must say when no verified procedure exists.
- Keep the scripted flows as a fallback when the AI service is unavailable.
- Log conversations (with consent) for engineer review.

## RT-005 — Administration, authentication and deployment
- Authentication and role-based permissions (presenter / engineer / admin).
- Editing equipment records, hotspots and articles through the Administration page.
- Audit trail of who verified what.
- Deployment to an approved host, with CI running typecheck, unit tests, build and Playwright tests.

## Offline strategy (planned, not built)
- A service worker caches only the app shell and **engineer-approved emergency instructions** (e.g. what to do about silence on air), versioned so outdated instructions are replaced.
- Conversations are never cached by the service worker; they stay in tab-scoped session storage.
- The app must show clearly when it is offline and which instructions are cached.

## Testing strategy (ongoing)
- Unit tests for content integrity, interpreter, engine, command validation.
- Component tests for interactive UI.
- Playwright end-to-end tests at desktop, tablet and phone widths.
- Accessibility checks (axe) at five widths — added in RT-002.
- Real-device testing on iPhone and Android — pending.
