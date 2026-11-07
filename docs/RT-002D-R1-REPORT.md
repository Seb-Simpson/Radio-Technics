# RT-002D-R1 — Safety enforcement remediation (RT-QA-002D)

**Branch:** `fix/rt-002d-diagnostic-safety` (PR #6), continuing from the audited commit `c44406a`. Not merged, not deployed.

> **Not independently audited.** Everything here was tested by the development team only: automated unit tests and Chromium browser tests with emulated phones. Nothing was tested on a physical device. The full RT-QA-002D report was not supplied with the brief, so the audit reproductions are the sentences and findings quoted in the brief. Each one was reproduced on `c44406a` before any change.

## Approach
I chose a smaller, enforceable rule over a cleverer parser. Language understanding may *suggest*; only a deliberate press of a displayed option, on the question currently on screen, can *decide*. Safety has explicit controls that don't depend on understanding anything. The AI boundary accepts identifiers, never prose.

## Each finding: before (`c44406a`) and after
| Finding | Before | After |
| --- | --- | --- |
| "It was working last week, but not today." (worked earlier?) | recorded **"Yes, it was working earlier"** | nothing recorded. A suggestion is shown with all answer buttons; the presenter must press one |
| "I found it impossible to see the Myriad screen." | recorded **"Yes, I've found it"** | nothing recorded; suggestion + buttons |
| Typed "yes" on a meters question | recorded "Yes, they move" | nothing recorded; suggestion + buttons |
| "yes they do" against pending "they don't move" | **confirmed "No, they don't move"** | nothing recorded; "press the answer that matches" |
| "I can" against pending "I can't hear anything" | **confirmed "No, I can't hear anything"** | nothing recorded |
| Button from an earlier question instance | only rejected if the ID was missing on the new question | refused by question instance; refused inputs never saved or replayed |
| Fast double-click / repeated taps / held Enter | could answer the next question in the same position | 2nd click of a double-click ignored; new buttons armed after 300 ms; key repeat blocked. Browser-tested at 5 widths |
| "We are off air, not back on air yet." | **historical** (no urgency) | confirmed incident |
| "We are off air. The headphones are working now." | **historical** | confirmed: local recovery never resolves a station outage |
| "I can hear it here, but the listeners can't." | **none** | confirmed (listener-side failure) |
| "Aren't we off air?" | **denied** | possible (a question is never confirmed or denied) |
| "I'm not saying we're off air." | **confirmed** | possible |
| "The transmitter has failed and nobody can receive us." | **none** | confirmed |
| "We cannot broadcast at all right now." | **none** | confirmed |
| Missed phrase → no escalation | possible | conservative net: broadcast word + trouble word in a clause → possible; plus an always-available urgent button |
| "My first answer was wrong." | ignored | correction workflow; the original is marked superseded |
| AI proposal `{kind:"toString"}` / `{kind:"constructor"}` | **guard threw** | rejected, never throws (own-key parsing) |
| AI operational prose without obvious verbs ("give the power lead a firm reseat") | **passed** | model prose no longer accepted at all |
| 534-character message with "we are off air" at the end | **truncated; not urgent** | refused with a clear reason (limit 500); nothing used |
| Knowledge Centre urgent search → troubleshooter | concern lost | handed over (re-checked; *possible* only; never an answer) |

## Architectural changes and rationale
1. **One answer path.**
   - `applyChoice` (reached only from `handleOption`) is the only place answers are created.
   - Every `option` input carries `instanceId`. `respond` refuses one that doesn't match the active question instance, or whose option isn't displayed.
   - Typed text can only lead to a `check` suggestion. The suggestion shows the exact proposition and every real answer.
   - Answers record `questionId`, `optionId`, `instanceId`, the exact pressed label, and the words a suggestion was based on.
2. **Refused inputs.** `EngineResult.rejected`, with the state unchanged. The provider doesn't save them. Session replay treats any refused or stale input as tampering and discards the session.
3. **Incident model.**
   - `incident.status`: none / possible / confirmed / reported-resumed.
   - `incident.entries`: an append-only history with kind (current / historical / hypothetical / denied / resumed), certainty, scope (listeners), source (text / button / knowledge-handoff / answer) and verbatim evidence.
   - Urgency is never cleared. "Resumed" is shown as the presenter's report, not independently verified.
4. **Safety classifier.** `safety.ts`:
   - Recovery counts only when it's about the broadcast, and negated recovery is ignored.
   - Negative questions are possible; distant negation is possible.
   - Adds transmitter, listener-side and "cannot broadcast" failures.
   - A conservative possible-incident net catches missed phrases.
5. **Explicit controls.**
   - "We're off air / urgent broadcast problem" appears on every page (in the page flow; never pinned over content).
   - "Broadcasting has resumed" appears in the urgent banner.
   - The on-air check offers "No, it's only in the studio". "No sound" questions already ask whether it's listeners or the studio.
6. **Corrections.**
   - Reached through "Change an earlier answer" or typed phrases such as "My first answer was wrong".
   - The steps are `correct-select` then `correct`.
   - The new answer has `corrects`; the original gets `supersededBy`.
   - The flow continues from the corrected answer.
   - The summary separates current answers from superseded ones.
7. **AI contract.** Identifiers only; all text is trusted local content. See `docs/RT-004-AI-ARCHITECTURE.md`.
8. **Input limits.** The whole input is classified. Input over 500 characters is refused, never truncated, in both the troubleshooter and Knowledge Centre search. The composer no longer uses `maxLength`, which silently truncated pasted text.

## Exact acceptance boundaries
- **Answers.** An answer exists only if the presenter pressed option O, O was displayed for question instance N, and N was active. Nothing else creates one: not text, not replay of a stale press, not stored data.
- **Typed text** can:
  - add an observation;
  - raise incident urgency, never lower it;
  - open the support step;
  - show a suggestion, or the correction or equipment questions;
  - move the conversation to a different question.

  It cannot record or confirm an answer.
- **Broadcast reports.**
  - Confirmed: stated as present fact, or the off-air button.
  - Possible: asked, hedged, uncertain, partly corrected, from a Knowledge Centre hand-off, caught by the conservative net, a pending silence suggestion, or reaching the urgent outcome through answers.
  - Historical, hypothetical and denied: recorded, never urgent.
  - Resumed: the presenter's report, never verification.
- **Model output.** Accepted only as one of four identifier shapes with exactly the allowed own keys. Any other shape gives a fixed safe reply.

## Tests
**Added:**
- `tests/unit/rt-qa-002d.test.tsx`: hand-authored expectations for every finding, multi-turn conversations, question instances, switching equipment, incident sentences, local recovery after an outage, historical/hypothetical/denied/resumed, explicit controls, corrections, hand-off, input limits and composer refusal.
- `tests/unit/ai-contracts.test.ts`, rewritten for the identifier-only contract: hostile keys, exotic objects, prose in fields, and every procedure condition.
- `tests/e2e/rt-qa-002d.spec.ts`, at 5 widths: real double-click, three raw clicks on one spot, held Enter, saved events after refused presses, correction with a real reload, urgent and resumed controls with axe, Knowledge Centre hand-off, and over-long input.

**Modified, and why:**
- `rt-qa-002c-corpus.test.ts`:
  - Its model-based invariants used `extractClaims`, `claimValue` and `classifyBroadcast` as oracles. That is forbidden now, so they were replaced with structural checks: answers only from displayed presses on the active instance, and hand-labelled vocabulary with no confirmed outages.
  - Its AI disguise test became "no model words ever reach the presenter".
  - Two expectations changed with the new rules: the check prompt wording, and typed "not the one I meant" no longer records "No".
- `rt-qa-001-regressions`, `rt-qa-002-conversation`, `rt-qa-002b-conversation`, `troubleshooter-engine`: these required typed text to record or act as an answer, which the brief forbids. They now assert that nothing is recorded from the text, and the button then records it. Immediate urgency is still asserted for silence.
- Refused inputs no longer add a notice message: tests assert `rejected` and an unchanged state.
- `session.test.tsx`: option events carry `instanceId`, plus a new stale-instance tampering case.
- `navigation.test.tsx`: renders with providers, because the shell now contains the urgent button.
- `rt-qa-002c-scroll.spec.ts`: when the reply box has focus, it must stay visible (WCAG 2.4.11).
- `tests/setup.ts` sets the 300 ms activation guard to 0 for unit tests; the browser tests exercise the real guard.

No test was skipped or deleted to get a green result.

## Results (final code)
| Check | Result |
| --- | --- |
| `npm ci` | ok, 0 vulnerabilities |
| `npm run check` | typecheck and build pass; 22 files, 666 unit tests passed |
| `npm run test:e2e`, three complete runs | each: **309 passed, 0 failed, 0 flaky**; 181 skipped by design (project-scoped `test.skip`: tests that set their own window size run on the desktop project only; touch-only tests skip desktop). 309 + 181 = 490 listed |
| Accessibility (axe) | included in the runs above at 1440, 820, 390, 375 and 320 px, including the urgent banner and controls |

## Remaining safety limitations
- Interpretation is still rule-based, so suggestions can be wrong. "It was working last week, but not today" still *suggests* "it was working earlier". The architecture makes that safe: nothing is recorded until the presenter presses an answer, and they see exactly what it says. It may cost a tap.
- The conservative net may over-escalate some sentences to *possible*. It never confirms anything.
- The 300 ms arming delay is a heuristic. A deliberate press within 300 ms of a new question is ignored, and the button is marked unavailable during that time.
- Browser storage can't prove authenticity. A forged input can only do what a press or typing could have done.
- "Broadcasting has resumed" is the presenter's report; Radio Technics can't verify it.
- The photo-exposure issue (`refs/pull/2/head`) still needs action from the owner.
