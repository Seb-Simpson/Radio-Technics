# RT-002D — Diagnostic safety architecture & final reliability hardening

**Branch:** `fix/rt-002d-diagnostic-safety`, from `main` at `79eb0b0` (RT-002C and RT-003 merged). Not merged, not deployed.
**Audit:** RT-QA-002C (71/100, FAIL). The audit's exact reproductions are used verbatim in `tests/unit/rt-qa-002c-corpus.test.ts`.

> **What was verified, and by whom.** Everything below was tested by the development team only: automated unit and browser tests in Chromium, with emulated phones. None of it has been independently re-audited, and nothing was tested on a physical device. The audit phrases are the auditor's; the variants and invariants were written by the development team.

## 1. Architectural changes and why
Earlier fixes added keyword rules to an engine that scored free text directly against answers, and each audit found new phrasings that slipped through. RT-002D changes the structure instead. There are now five separate layers:

| Layer | Where | Rule |
| --- | --- | --- |
| What the presenter said | `observations` (verbatim) | Never rewritten; always in the support summary |
| What the system inferred | `claims.ts`, `interpretForNode` | A tentative interpretation, read from statements only. It names a candidate answer or nothing, and never records |
| What the presenter confirmed | `applyChoice` (the only place answers are recorded) | Only a button, an exact typed label, a bare yes/no/not sure, or a confirmed interpretation. Free text on safety-relevant questions (broadcast, playback, sound, levels) becomes a **check step**: "It sounds like the level meters aren't moving. Is that correct?", with the real answer buttons and "I'm not sure" |
| Possible broadcast problem | `safety.ts` (`classifyBroadcast`) | Runs on every message, independently of the question and options: current-confirmed / current-possible / historical / hypothetical / denied / none. Urgency only increases. A support request or change of subject never clears it |
| Authorised actions | `contracts.ts` (RT-004 guard), flows | No operating instructions unless an engineer-approved, verified procedure exists in trusted data. None exist yet |

Supporting changes:
- **Question-specific answer schemas.** Each option declares its claim (`audio`, or `asserts: { subject, value }`) and a `restate` used in confirmations. `validateContent()` checks them.
- **Cross-question protection.** Claims about another subject don't answer the current question. A yes/no that *agrees* with such a claim ("No, there's no sound" on the meters question) is attributed to that claim. Corrections of *which equipment* is meant ("No, that's not the one I meant") go to an equipment question and never become a playback or level answer.
- **Event-based sessions.** Only validated inputs are stored, and the conversation is rebuilt by replaying them through the pure engine. A button press is replayed only if it was on screen at that point. So stored data cannot fabricate answers, urgency, message IDs or ordering. Anything that can't be replayed is discarded, with a notice.
- **One scroll owner** in the chat (see section 5).
- `text.ts` holds the shared normalisation and clause helpers, moved out of `understand.ts`. `understand.ts` now gets sound claims from `claims.ts` and off-air status from `safety.ts`, so there is a single source for each.

## 2–3. Each audit finding: before and after
"Before" is `79eb0b0`, probed in six conversation states (full output kept in the development session).

| Reproduction | Before | After |
| --- | --- | --- |
| "The meters have stopped moving." (meter questions) | recorded **"Yes, they move"** | check step: "It sounds like the level meters aren't moving. Is that correct?"; nothing recorded until confirmed |
| "It plays neither music nor speech." (still playing?) | recorded **"Yes, it's still playing"** | proposes "No — there's silence"; escalated at once as *possible* silence; recorded only on confirmation |
| "No, there is not any sound." (meter questions) | recorded **"No, they don't move"** | nothing recorded; noted as a separate observation about sound |
| "Yes, it's not the green button." (confirming the green button) | recorded **"Yes, that's it"** and started its flow | nothing recorded; asked again |
| "No, that's not the one I meant." (still playing?) | recorded **silence**, urgent | nothing recorded, no urgency; asks which equipment was meant |
| "We have stopped broadcasting." | not urgent | urgent, confirmed, in every state |
| "We aren't on air." | not urgent | urgent, confirmed |
| "Can someone help? No sound is going out to listeners." | support, **not urgent** | urgent, confirmed; the help request is acknowledged |
| "Are we off air? Actually, I need a human." | support, **concern lost** | urgent as *possible*; support route; summary says "not confirmed" |
| "We were off air earlier, but everything's working now." | **urgent, confirmed** | historical: no urgency; noted for support |
| "We would be off air if I restarted." | **urgent, confirmed** | hypothetical: no urgency |
| "It is not true that we're off air." | **urgent, confirmed** | denied: no urgency |
| Damaged session data | could fabricate answers and urgency | stored state is never read; inputs are replayed |
| `guardModelProposal` with `givesInstructions: false` | accepted unverified instructions | the field is rejected outright; instructions are rejected however they're phrased |
| Scroll at 1440×500 | reply box pushed out of view | stable (9 of 17 browser cases failed on the old code; all pass now) |

Presentation:
- Confirmed: "Urgent: a broadcast interruption has been reported."
- Possible: "Possible broadcast interruption — not yet confirmed."

No recovery procedure was added.

## 4. Regression tests introduced
- `tests/unit/rt-qa-002c-corpus.test.ts`:
  - the exact audit reproductions in six conversation states;
  - independent variants (wording, pronouns, tense, correction order, punctuation, support and outage in either order);
  - **model-based invariants**: 400 seeded random conversations checked after every step, 300 randomly corrupted sessions, and 500 generated disguised instructions.
- `tests/unit/ai-contracts.test.ts`: adversarial tests of the AI boundary, including false safety declarations; full-width, zero-width, Cyrillic, spaced-out and dotted spellings; unknown, unapproved and fixture-approved procedures; and model-supplied steps.
- `tests/unit/session.test.tsx` and `rt-qa-002b-robustness.test.tsx`, rewritten for the event model:
  - invisible buttons, smuggled fields, invented input types, oversized or empty text and too many events are all rejected;
  - stored urgency, answers, sequence numbers and IDs are ignored;
  - message IDs are canonical (`m1…mN`).
- `tests/unit/content-validation.test.ts`: the answer-schema rules.
- `tests/e2e/rt-qa-002c-scroll.spec.ts`: 1440×500, 719, 720, 768 and 900, plus 390×844, 375×667 and 320×568. Each size runs with and without reduced motion, through long and restored conversations, waiting for scrolling and animation to settle; focus doesn't move the page.
- `tests/e2e/rt-qa-002c-diagnostic.spec.ts` runs at all 5 widths and covers:
  - the confirmation step, with axe checks and no horizontal overflow;
  - the confirmed and possible banners;
  - past and hypothetical outages;
  - tampered-session discard.

**Existing tests adapted, and why.** These tests asserted the behaviour the brief now forbids: free text recorded directly as an answer to a safety-relevant question. They now assert the same interpretation, plus that nothing is recorded until confirmation:
- the RT-QA-002 "question-aware answers" table;
- 6 RT-QA-001 cases;
- 3 RT-QA-002B cases;
- 1 engine scenario, where equipment typed into the list is now confirmed first;
- 1 UI banner wording, changed by the brief.

The RT-QA-001 cases about silence still assert immediate urgency. No test was skipped or deleted except the old state-parsing tests, whose subject (`parseConversation`) no longer exists. Their intent is covered more strictly by the replay tests.

## 5. Results (all run on the final code)
| Check | Result |
| --- | --- |
| `npm ci` | ok, 0 vulnerabilities |
| `npm run check` (typecheck + unit + build) | pass — 21 files, 605 tests |
| `npm run test:e2e`, three complete runs | runs 1–3: 274 passed, 0 failed, 0 flaky each |
| Skipped | 181 per run, all by design: project-scoped `test.skip` for tests that set their own window size (desktop project only), or touch-only tests (not desktop). 274 + 181 = 455 listed |
| Accessibility (axe) | included in the runs above at 1440, 820, 390, 375 and 320 px, including the new confirmation step |

## 6. Security and session integrity
- Session storage holds inputs only. On restore:
  - the version and engine version must match;
  - the activity time can't be in the future, and the two-hour idle expiry still applies;
  - every event's shape and references are checked, and unknown keys are rejected;
  - option IDs must look like real option IDs and must have been on screen at that point of the replay;
  - the replay itself must accept every input.

  Otherwise the session is discarded, with a notice.
- **Limitation:** browser storage can't prove authenticity. Someone with access to the browser could forge *inputs*, but a forged input can only do what typing or clicking could have done; it can't create answers or flags directly.
- **Photo exposure:** unchanged; see `docs/SECURITY-PHOTO-EXPOSURE.md`. It still depends on GitHub Support and Vercel actions by the owner.

## 7. Readiness for RT-004
The guard no longer trusts any model declaration:
- The schema is strict.
- Instructions are rejected after folding disguised text.
- Procedure steps come only from trusted, verified knowledge-base data. None exist yet.
- Fixed replies for broadcast concerns, restart questions and requests for a person run before any model call.

No AI provider is connected.

## 8. Commits
`bded2e3` (architecture, safety, event sessions) · `04cd0c5` (AI guard) · `1ceca26` (scroll owner, corpus, browser tests) · docs commit.

## 9. Known limitations
- Interpretation is still rule-based. It can fail to recognise unusual wording. The architecture makes that safe rather than wrong: the result is "nothing recorded, please choose", never a fabricated answer. But it can mean more clarifying questions.
- Descriptive replies to safety questions now need one extra confirmation tap. This was chosen deliberately.
- Possible broadcast concerns escalate straight to the urgent outcome, which may sometimes over-escalate.
- The AI instruction detector is deliberately strict and may reject harmless wording.
- On small phones, when the new question and the reply box don't both fit, the question is shown and the reply box is one Tab or scroll away.
- Not independently re-audited; not tested on physical devices.
