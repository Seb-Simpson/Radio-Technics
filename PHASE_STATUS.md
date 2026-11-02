# Phase Status

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
| `825f01b` | feat | C/C1: ten real photographs, import pipeline, hotspots, hotspot editor |
| `9afc984` | fix | F: stricter content validation, review records for verified content |
| `d1c5816` | feat | G: session persistence with validation, expiry and End session |
| `e3997a1` | feat | D: phone/tablet layouts, touch viewer, bottom sheet, manifest |
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
