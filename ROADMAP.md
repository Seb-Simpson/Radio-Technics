# Roadmap

Phases are indicative. Each phase should finish with passing automated checks and an updated `PHASE_STATUS.md`.

## RT-001 — Foundation ✅ (this phase)
Next.js app shell, Studio Explorer with zoom/pan and hotspots (illustrative layout until photos arrive), equipment panel, scripted troubleshooter, validated workspace commands, Knowledge Centre, read-only Administration, documentation and tests.

## RT-002 — Real studio photographs
- Add the ten photographs to `public/studio/photos/` (optimised, EXIF location data stripped).
- Create a `StudioView` record per photograph and place real hotspots (one equipment record may appear in several photos).
- Build a development-only hotspot placement helper (click-and-drag to output fractional coordinates) to speed this up.
- Walk through the photos with the station engineer: confirm equipment identities and fill in `requiresVerification` answers.
- Remove the illustrative layout from the default view once real photos are present (it is already only shown when no photos exist).

## RT-003 — Verified knowledge base
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

## Testing strategy (ongoing)
- Unit tests for content integrity, interpreter, engine, command validation.
- Component tests for interactive UI.
- Playwright end-to-end tests at desktop, tablet and phone widths.
- Accessibility checks (axe) to be added in RT-002.
