# Phase Status

## RT-003 — Knowledge base & intelligent search foundation

**Status:** Implemented and tested. Official Myriad documentation could **not** be read (network policy blocked `www.broadcastradio.com` and `help.broadcastradio.com`); sources are listed as "not yet read" and no manufacturer content was written. Nothing is engineer-verified.
**Branch:** `claude/rt-003-knowledge-base` from `main` at `2ae5b26`. Not merged, not deployed.

### Commits
| Commit | Change |
| --- | --- |
| `aa16775` | Authority levels (`manufacturer-documented`, article `kind`), sources with `retrievedOn`, glossary, 17 structured articles (9 new Myriad/audio), stricter `validateContent()` |
| `2657146` | Local search: normalisation, stemming, synonyms, presenter concepts, 16 intents, ranking, ambiguity, needs-equipment, selection context, urgent-silence handling, `KnowledgeRetriever` interface |
| `fddcdcb` | Knowledge Centre search UI, article page (sources, open questions, related, version history), glossary page, admin review queue, e2e/axe coverage |
| `c1a393b` | RT-004 AI contract and deterministic guards (no model calls) |
| (docs commit) | `docs/RT-004-AI-ARCHITECTURE.md`, `docs/ENGINEER_REVIEW.md`, README/AGENTS/CLAUDE/ROADMAP |

### Articles
Existing (restructured): studio overview, the green next-song button, zoom camera, microphone not heard, next song won't play, can't hear anything, cables, technical support.
New: Live Assist, the Myriad screen (red/green squares → open question), the next item, stop chains, the Go function and the green button (equivalence **not** assumed), what's playing now, playback status, players, audio output problems. All `informational`; none verified or manufacturer-documented.

### Engineer verification required
Every article's "Unresolved" questions (listed together on /admin → Review queue), especially: what the red/green squares mean; whether the green button triggers Myriad's Go function; which stop chains are used; what presenters may do when the next item won't play. Read the three official pages once network access allows.

### Automated results (all run on `c1a393b` + docs)
| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | 18 files, 393 tests passed |
| `npm run build` | pass |
| `npm run test:e2e` | 223 passed (5 widths, incl. axe on /knowledge/kb-myriad-screen and /knowledge/glossary). One earlier full run had a single flake in `studio-regressions.spec.ts:37` at 320px that passed 5/5 on repeat and in the next full run. |

### Limitations
- Search is keyword/vocabulary-based; phrasings outside the vocabulary fall back to plain keyword ranking or "no match". It is not an AI.
- Myriad articles are drafts based on station reports; official docs unread.
- No in-app editing; review is via data files (RT-005).
- Not yet tested on physical phones.

## RT-002B — Independent audit remediation (RT-QA-002)

**Status:** All ten RT-QA-002 findings resolved and covered by regression tests. Real-device and engineer verification remain outside this phase.
**Branch:** `claude/rt-002b-audit-fixes` (from `claude/rt-002-stabilisation` at the audited commit, `a5773d5` before the history rewrite, now `f18cdd0`). Not merged, not deployed.

### Commits
| Commit | Finding(s) |
| --- | --- |
| `48c0876` | P1 — question-aware replies, urgency before routing, human-support recognition |
| `faffe85` | P2 — rack photo phone number redacted |
| `8a475b5` | P3 — idle expiry enforced in an open tab |
| `b469584` | P4 — focus never obscured; short desktop heights |
| `5a38857` | P5 — early image failures, per-hotspot identity, meaningful provenance |
| `f7434eb` | Content: Myriad 6 live-assist mode recorded as station-reported |
| (docs commit) | Documentation |

### Findings, causes and fixes (each reproduced before fixing)
| # | Finding | Underlying cause | Resolution |
| --- | --- | --- | --- |
| 1 | "No, there is no sound" recorded as sound present; "Yes, no, sorry it is not playing" recorded as still playing | Stance came only from the first clause and was matched to an option's yes/no label without checking what that option asserts; corrections ignored | Clause splitting (incl. unpunctuated "yes no"), self-correction markers, stance across clauses with explicit conflict, claims about sound with negation. Options declare `answer` + `audio`; a reply selects an option only if consistent with both, otherwise the question is asked again and nothing is recorded |
| 2 | "Can someone help me? We're off air." lost urgency; "Should I restart the computer? We're off air." missed the emergency | Help/procedure routing ran before silence was checked | Safety classified first and attached to the session (`urgent` / `possibleSilence`); confirmed off-air → urgent state even with a help or procedure request (both still answered); possible silence → summary flag, banner and on-air question |
| 3 | Natural help requests missed; "The engineer fixed the desk" triggered support | Keyword match on "engineer"/"support" | Request form + person/support target, with declines and assistant-directed "can you help…" excluded |
| 4 | Phone number legible on the rack photo | Import removed metadata only | Opaque redaction re-imported from the original; verified flat at full served resolution (pixel deviation 1.0 vs 60.0 before) |
| 5 | Open tab never expired; messages renewed it | Expiry only checked on load; saves stamped "now" | Activity clock updated only by user actions; expiry enforced before input, every 30 s and on focus; expired data cleared and the new message not processed; injectable `clock` |
| 6 | Focus hidden under the sheet / outside a zoomed viewer | Nothing revealed focused hotspots or accounted for overlays | Viewer pans focused hotspots into view; page keeps focus clear of the sticky header and sheet; sheet focus continuity, Escape/Close return focus, no trap |
| 7 | Chat input clipped at 1440×500 | Fixed viewport-based height with clipping on all wide screens | Fixed-height layout only on screens ≥720px tall (`tall:`); otherwise content flows. Height offset corrected for 1440×900 |
| 8 | Immediate 404 left a broken image with live hotspots | `onError` attached after hydration; early errors missed | Mount/view-change check for an already-failed image, plus `onError` |
| 9 | Different rack hotspots showed the same note and all highlighted | Selection tracked equipment only | Separate, validated `selectedHotspotId`; only the chosen region is selected and its own note is shown |
| 10 | "TBC"/"n/a" accepted as review sources | Source only length-checked | Placeholder rejection and minimum content for sources and reviewers, including station-reported sources; admin page states validation cannot prove genuine approval |

### Privacy note
The app has **not** been deployed. With the owner's authorisation, Git history was rewritten so that every commit on `main`, `claude/rt-002-stabilisation` and `claude/rt-002b-audit-fixes` contains only the redacted rack photo; the unredacted image is no longer reachable from any branch. Only commits from the first photo commit onwards were rewritten (earlier commits, including GitHub-signed ones, keep their hashes); GitHub's signature on the PR #2 merge commit could not be preserved.

Remaining exposure outside our control: GitHub keeps pull-request refs (`refs/pull/2/head`) and may cache old commits until garbage collection; anyone who cloned or fetched before the rewrite still has the old image. Full removal from GitHub's servers requires a request to GitHub Support. A pre-rewrite backup bundle was kept only in the session scratchpad, not in the repository.

### Automated results (final commit, all run)
| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | **320 / 320** tests, **15 / 15** files |
| `npm run build` | Pass |
| `npm run test:e2e` (incl. axe) | **183 passed, 57 skipped by design** (240 total; skips are tests that set their own viewport or are touch/desktop specific) |

Sizes covered: 320, 375, 390, 820, 1440 px; 1440×500, 1440×495, 1440×900; browser zoom 200% and 400% emulated as 720×450 and 360×225 CSS px. Accessibility (axe WCAG 2.0–2.2 A/AA) runs on every page at five widths.

**Not done / manual only:** no physical iPhone/Android testing; browser zoom was emulated by CSS viewport size rather than the browser's zoom control; no screen-reader testing with VoiceOver/NVDA.

### Re-audit instructions (RT-QA-002 repeat)
```bash
git fetch origin claude/rt-002b-audit-fixes && git checkout claude/rt-002b-audit-fixes
npm ci
npm run check
# stop anything on :3100 first
npm run test:e2e
```
Key test files: `tests/unit/rt-qa-002-conversation.test.ts`, `tests/unit/session-expiry.test.tsx`, `tests/unit/rt-qa-002-studio.test.tsx`, `tests/unit/photo-pipeline.test.ts`, `tests/e2e/focus-layout.spec.ts`, `tests/e2e/studio-regressions.spec.ts`, `tests/e2e/session.spec.ts`.

Manual checks:
1. Troubleshooter: "The green thing isn't working" → *Yes, that's it* → *Nothing changed*, then try "No, there is no sound", "Yes, no, sorry it is not playing", "yes it is. actually no, it stopped" (→ urgent) and "Yes, but there's no sound" (→ asks again, nothing recorded). Use *I can't hear anything* → *Listeners say…* to reach the on-air question and try "No, there is no sound" (→ asks again).
2. From any step: "Can someone help me? We're off air." and "Should I restart the computer? We're off air." → urgent state and red banner; then "I need a human" → support stays urgent.
3. Help: "I need a human", "Can I get a person?" → support; "The engineer fixed the desk last week" → not support.
4. Open `/studio/photos/equipment-rack.jpg` at full size: the yellow sticker is a blank block.
5. Expiry: in DevTools, run the app, send a message, then override `Date.now` to +2h01m (or wait for the Playwright clock test) → conversation cleared, notice shown, message not sent.
6. 375px, select *Audio level meters*, Tab through hotspots: none hidden under the sheet; Escape closes and returns focus.
7. 1440×500: the chat input is reachable and usable.
8. Block `mixing-console.jpg` (DevTools request blocking) and reload `/studio`: fallback message, no hotspots.
9. Equipment rack: each of the three regions shows its own note and only it is highlighted.
10. In `src/data/equipment.ts` mark a fact `verified` with `review.source: "TBC"` → `npm test` fails.

---


## RT-002 — Reliability, studio integration and mobile foundation

**Status:** Complete for this phase. Engineer verification and real-device testing are outstanding (they need the station).
**Branch:** `claude/rt-002-stabilisation` (from `main` at `3b106a6`). Not merged.

### Commits
| Commit | Type | Scope |
| --- | --- | --- |
| `f9a33cd` | fix | A1–A5: structured reply understanding, no accidental resets, preserved observations, support requests, silence escalation |
| `ea659ce` | fix | B1–B2: viewer resize constraints, keyboard activation after drag |
| `dd0d7b2` | fix | E: contrast, chat/article semantics, focus order, target size, axe suite |
| `c3241d2` | content | C2: camera is for Zoom calls; unverified observations from photos |
| `15018cc` | feat | C/C1: ten real photographs, import pipeline, hotspots, hotspot editor |
| `b56ae25` | fix | F: stricter content validation, review records for verified content |
| `6ad812c` | feat | G: session persistence with validation, expiry and End session |
| `bd4deed` | feat | D: phone/tablet layouts, touch viewer, bottom sheet, manifest |
| (docs commit) | docs | Documentation for RT-002 |

### RT-QA-001 findings: before and after
The audit report itself was not available in the repository; findings were taken from the RT-002 brief and each was reproduced before fixing.

| Finding | Before (reproduced) | After |
| --- | --- | --- |
| A1 Negation | "No, it is silent." matched `"it is"` in the YES list → recorded *"Yes, it's still playing"*, no escalation. "Yes, but there's no sound" recorded *yes* | `understand.ts` derives stance from the first clause, with contractions expanded and negated observations ignored. Options declare their meaning, and replies can't map to an option their stance contradicts. "No, it is silent" → urgent; contradictions → clarifying question; "No, it's not silent…" does not escalate |
| A2 Resets | "Should I restart the computer?" contained *restart* → conversation wiped. Dashboard topics also silently replaced a conversation | Typed text never resets. Procedure questions get a safe "no approved instructions" reply. Clearing only via **End session** with an inline confirmation. Dashboard topics continue the current conversation |
| A3 Observations | Typed text stored as "Problem described" and an unmatched mid-flow reply ("the screen flickers") hijacked the flow onto *studio computer* | Every typed message is kept verbatim as an observation, separate from answers (with source *button/typed* and certainty). Unmatched replies are noted and the question is re-asked. The summary shows the presenter's own words and marks uncertain answers |
| A4 Support | "Can I speak to someone?" not understood; "Yes, I need help" recorded *yes* | Help requests anywhere go to the support step, which states that contact details have not been configured. No numbers invented |
| A5 Silence | Only exact option phrases triggered urgency | Clear on-air silence ("dead air", "off air", "nothing going out") → urgent immediately. Possible silence or "don't know whether we're on air" → one short on-air question. The urgent state avoids restart/press advice and stays flagged in the summary |
| B1 Resize | Zoom + pan on desktop then resize to mobile could leave the image off-screen | Pan is rescaled and re-clamped on every stage size change, the selected item is recentred if needed, and the rendered transform is always clamped. Regression test fails on the old code |
| B2 Keyboard after drag | Drag set a click-suppression flag cleared only on the next pointer-down, so Enter/Space did nothing | One-shot suppression; keyboard activation (`detail === 0`) is never suppressed. Regression test fails on the old code |
| E Contrast | Secondary text 4.29:1 | `ink-400` ≥ 4.5:1 on every surface |
| E Chat semantics | `<ol role="log">` invalidated list items; log not keyboard-scrollable | `role="log"` on a focusable wrapper around a valid list |
| E Article ARIA | `aria-labelledby="s-What it does"` (three missing IDs) | Index-based IDs; an ID-reference integrity check runs on every page |
| E (also found) | First Tab skipped the skip link (`scrollIntoView` moved the focus starting point); hotspot label didn't match its accessible name; menu `aria-controls` pointed at a missing element | All fixed and covered by tests |
| F Validation | Only cross-references checked; `verified` needed just a date | NaN/Infinity/out-of-bounds geometry rejected. `verified` needs a review record (named reviewer, real non-future date, source); verified articles can't have unverified sections; station-reported facts need a source; photo paths, alt text, signals and yes/no meanings checked |

### Studio photographs
- **Integrated:** all ten photographs supplied by the station, imported with `scripts/import-photo.mjs` (orientation applied, all metadata removed and verified, logged-in name on the Myriad screen blurred).
- **Hotspots:** 18 hotspots across the ten photos, placed by the development team from the photos and visually checked at desktop and phone sizes and at zoom. **Every identification is marked unverified** until the engineer confirms it. *Studio computer equipment* and *guest microphones* have no dedicated hotspot.
- **Editor:** developer-only hotspot editor at `/dev/hotspots` (draw, move, resize, keyboard nudging, exact pixel entry, validation, preview, copyable configuration). 404 in production unless `RT_ENABLE_HOTSPOT_EDITOR=1`.

### Mobile compatibility
- Compact header and menu below 1024px; bottom sheet for equipment below 1280px; page scrolls naturally over the photo until zoomed; pinch and one-finger pan when zoomed; 40px touch targets; safe-area insets; installable manifest.
- **Tested:** Chromium with emulated touch at 320×568, 375×667, 390×844 and 820×1180, plus 1440×900 desktop. Includes a real two-finger pinch sent as CDP touch events.
- **Not tested:** physical iPhones (Safari/WebKit) and Android phones. Synthetic touch tests are not equivalent to real devices. iOS Safari keyboard behaviour in particular needs checking.
- **Offline:** not implemented (no service worker). A planned strategy is in `ROADMAP.md`.

### Tests performed (all run and passing on the final commit)
| Check | Command | Result |
| --- | --- | --- |
| TypeScript (strict) | `npm run typecheck` | Pass |
| Unit & component | `npm test` | **219 / 219** tests in **12 / 12** files |
| Production build | `npm run build` | Pass |
| End-to-end + accessibility | `npm run test:e2e` | **153 passed, 17 skipped by design** (170 total = 34 scenarios × 5 widths). Skips are desktop-only tests (resize, editor) on other widths and touch-only tests on desktop |

Automated accessibility: axe (WCAG 2.0/2.1/2.2 A and AA) on every page and on key interactive states (selection, question, confirmation, urgent outcome), at all five widths, plus ID-reference integrity, focus visibility and reduced motion.

### Known limitations
- No engineer-verified information or procedures; technical-support contacts not configured.
- Hotspot identities unverified; the "Microphone" photo is assumed to show the presenter's microphone.
- Reply understanding is deterministic and English-only; unusual phrasings fall back to clarifying questions.
- Sessions are tab-scoped (closing the tab ends them) and expire after two hours idle.
- No authentication, editing, offline support or deployment.

### Next development tasks (RT-003)
1. Engineer walkthrough: confirm hotspots and answer `EQUIPMENT.md` questions; add `review` records.
2. Real-device testing in the studio (iPhone Safari, Android Chrome), especially keyboard and pinch behaviour.
3. Configure technical-support contact details once confirmed.
4. Verified emergency instructions for silence on air, then the offline strategy for those instructions.
5. CI workflow running `npm run check` and `npm run test:e2e` on every pull request.

---

## Independent QA instructions (for Codex or another reviewer)

```bash
git fetch origin claude/rt-002-stabilisation && git checkout claude/rt-002-stabilisation
npm ci
npm run check            # typecheck + 219 unit tests + build
npm run test:e2e         # stop any server on :3100 first; Playwright starts one with the editor enabled
```

Manual checks:
1. **Negation and silence:** Troubleshooter → "The green thing isn't working" → *Yes, that's it* → *Nothing changed* → type **"No, it is silent."** Expect the urgent outcome, and the summary shows *No — there's silence (typed reply)* plus your exact words.
2. **Contradiction:** same path, type **"Yes, but there's no sound"**. Expect a clarifying question, not a recorded "yes".
3. **No reset:** mid-conversation type **"Should I restart the computer?"**. Expect a safe reply; nothing is cleared.
4. **Support:** type **"Can I speak to someone?"**. Expect the support step saying contact details are not configured.
5. **Observations:** "The green button isn't doing anything, and the screen has gone weird." → *Yes* → *Something unexpected happened* → "the screen flickers". The summary keeps both sentences verbatim.
6. **Viewer:** Studio Explorer at 1440px, select the HEADPHONES knob hotspot, zoom in fully, drag to a corner, then narrow the window to 320px. The photo stays visible and the knob stays on screen. Drag the photo, then Tab to a hotspot and press Enter or Space: it selects.
7. **Session:** start a conversation, refresh. It is restored with a notice. *End session* → confirm → refresh: it's gone. Corrupt `sessionStorage["radio-technics.session"]` → refresh → no crash, data discarded.
8. **Mobile (DevTools device mode, 375px):** menu, *Get help*, chat, *Show me where* → highlighted item above the bottom sheet → *Back to conversation*.
9. **Validation:** set any fact's status to `"verified"` in `src/data/equipment.ts` without a `review`. `npm test` fails with a clear message.
10. **Editor:** `npm run dev` → `/dev/hotspots`. In a production build (`npm run build && npm start` without the env var) it returns 404.

## RT-002C — RT-QA-002B remediation

**Status:** Priority 1–3 findings addressed with regression tests; see `docs/RT-002C-REMEDIATION.md` for causes, before/after evidence and full results. The unredacted rack photo is **still reachable through GitHub's `refs/pull/2/head`** and possibly old Vercel previews. The owner needs to contact GitHub Support and Vercel (`docs/SECURITY-PHOTO-EXPOSURE.md`).
**Branch:** `fix/rt-002c-qa002b` from `2ae5b26`. Not merged, not deployed.
