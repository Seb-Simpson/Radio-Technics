# RT-002C — RT-QA-002B remediation report

**Branch:** `fix/rt-002c-qa002b`, from `main` at `2ae5b26` (the audited baseline). Not merged, not deployed. PR #4 (RT-003) was not modified; a local trial merge of PR #4 onto this branch merged without conflicts and passed typecheck and all 496 unit tests.

**Source of reproductions:** the RT-QA-002B report itself was not available to the development team. It isn't in the repository, in any issue, or in the PR comments. With the owner's agreement, the team wrote its own reproductions for every finding listed in the RT-002C brief. They are labelled as such in the tests. Each one was run against the baseline build before fixing (evidence below).

## Commits
| Commit | Priority | Summary |
| --- | --- | --- |
| `8f9400c` | P1 (1–5) + item 12 | Clause modality, confirmed vs possible off-air, polite words aren't corrections, yes/no prefix vs rest of sentence; defensive restore validation |
| `33b275c` | P2 (6–9) | Unclipped chat composer, resize keeps the chosen hotspot visible, exact focus return, no focus races |
| `6b900cb` | P3 (10–11) | Support-phrase recognition, re-selection renews activity, photo-exposure investigation |
| (docs commit) | — | This report, `PHASE_STATUS.md`, `CLAUDE.md` |

## Priority 1 — Conversational safety

### Causes
- Every clause was treated as a statement, so "Are we off air?", "What if we go off air?", "I think we might be off air" and "Do they move?" were read as facts.
- "Sorry", "hang on", "wait" and similar always started a self-correction, even when nothing followed. The text after the marker was empty, so the off-air report vanished.
- Negation looked back only two words, so "I don't think we're off air" counted as a confirmed report.
- An answer was chosen from the yes/no word alone unless the option declared `audio`. "Yes, they don't move" therefore picked "Yes, they move".
- The session had a single `urgent` flag, so the summary said "URGENT: silence on air reported" even when the presenter only said "maybe".

### Fixes (`understand.ts`, `engine.ts`)
- **Clause modality.** Each clause is classed as `assertive`, `hedged`, `uncertain`, `question`, `hypothetical` or `negated-belief`. Only assertive and hedged clauses can give a yes/no stance, an observation about sound, or an answer-phrase match (`Understanding.assertive`). Questions and uncertain clauses about silence still raise *possible* silence, which is checked rather than recorded.
- **Off-air.** `offAir` is `confirmed` (stated as fact) or `possible` (asked, hedged, uncertain, or partly corrected). Both are escalated to the urgent outcome, which keeps escalation conservative. A new session field, `confirmedOffAir`, records which one it was. The conversation says "I've recorded this as possible silence on air, not confirmed"; the support step and the summary also say "not confirmed". A later confirmation upgrades a possible report, and nothing ever downgrades one. Hypotheticals get a short explanation and record nothing; denials record nothing.
- **Politeness.** "sorry", "sorry about that", "hang on (a sec)", "bear with me", "please", "thanks" and similar are not corrections. A correction removes an off-air report only if it explicitly takes it back: "no we're not", "false alarm", "my mistake, we're still on air", or a negated off-air phrase. A correction about something else ("I mean the headphones are silent") keeps the escalation but marks the report as unconfirmed.
- **Yes/no prefix (item 4).** An answer is never recorded when either of these holds:
  - The message uses another option's phrase against the stance ("No, they're moving").
  - A "yes" comes with a subject–verb denial ("Yes, it wasn't working earlier", "Yes, I can't find it").

  When confirming equipment, "Yes, it's the guest mic" now asks which item was meant instead of confirming the wrong one.
- RT-002B protections are unchanged:
  - Safety is still classified before routing.
  - Typed text never resets a conversation.
  - Questions about restarting get the safe reply.
  - Existing RT-QA-001 and RT-QA-002 tests pass unchanged, and the confirmed summary line keeps its exact wording.

### Before → after (selected; full lists in the tests)
| Input (where) | Baseline `2ae5b26` | Now |
| --- | --- | --- |
| "We're off air, sorry" (new) | not urgent, asks which equipment | urgent, confirmed |
| "We're off air. Hang on." (new) | not urgent | urgent, confirmed |
| "Yes it's off air, sorry" (on-air check) | re-asked, not urgent | urgent, confirmed |
| "Are we off air?" (new) | urgent, **summarised as confirmed** | urgent, summarised "possible … not confirmed" |
| "I think we might be off air" (new) | urgent, confirmed | urgent, possible |
| "I don't think we're off air" (new) | **urgent, confirmed** | not urgent |
| "What if we go off air?" (new) | **urgent, confirmed** | explanation; nothing recorded |
| "Maybe" (on-air check) | urgent; summary "silence on air reported" | urgent; summary "possible … not confirmed" |
| "Is it silent?" (on-air check) | recorded "Yes, it might be silent" (confirmed) | nothing recorded, re-asked |
| "Do they move?" (meters) | recorded "Yes, they move" | nothing recorded |
| "Yes, they don't move" (meters) | recorded "Yes, they move" | nothing recorded, re-asked |
| "No, they're moving" (meters) | recorded "No, they don't move" | nothing recorded, re-asked |
| "Yes, it wasn't working earlier" | recorded "Yes, it was working earlier" | nothing recorded, re-asked |
| "Maybe I can hear other sounds" | recorded "Yes, I can hear other sounds" (confirmed) | recorded "I'm not sure" (uncertain) |
| "Yes, it's the guest mic" (confirming presenter mic) | (route-dependent) could confirm the wrong item | asks which of the two |

Running `tests/unit/rt-qa-002b-conversation.test.ts` against the baseline: **37 failed, 9 passed** (46). The 9 that passed are controls (consistent replies that must keep working) and guards. Some baseline failures in the "denial" cases come only from the new `offAir` field being missing, not from wrong behaviour. "We're not off air" was already handled correctly at the baseline.

## Priority 2 — UI reliability

### Causes
- **Item 6.** On screens at least 1280px wide and 720px tall, the chat panel has a fixed height (`100dvh − 13rem`, so 560px at 768 and 512px at 720) and clips its overflow. Only the log could shrink. A restored urgent conversation (urgent banner, restored notice, selection chip, support summary and options) pushed the reply box out of the panel. Below 720px the page flows, but after sending, the reply box ended up below the fold.
- **Item 7.** On resize, the viewer kept the *first* hotspot of the selected equipment visible, not the selected hotspot. It also reacted only when the fitted image changed size, not when the visible area did.
- **Item 8.** Closing details refocused `[data-equipment-id=…]`, which is the first region for that equipment. It did so a frame later, regardless of where focus had gone in the meantime. A hotspot's delayed "reveal" scroll could also act on a stale element.

### Fixes
- **Chat panel.** The header, notices and reply box keep their size. Notices scroll if they take more than 35% of the panel. The answers and summary area shrinks and scrolls, and the log keeps at least 6rem. In the flowing layout, the reply box is scrolled back into view after sending or after a validation error.
- **Photo viewer.** It re-fits when either the stage or the viewport changes, and keeps the selected hotspot (`selectedHotspotId`) visible. "Show me where" prefers the selected hotspot.
- **Focus.** Each hotspot carries `data-hotspot-id`. Closing details returns focus to the exact region the user chose, but only if focus has been lost (it's on `body` or on a removed element); it never overrides focus the user has moved. A delayed reveal runs only if its element still has focus.

### Browser evidence (`tests/e2e/rt-qa-002b.spec.ts`)
Against the baseline build, **9 of 14 failed**:
- the composer at 1440×768, 721 and 720 ("textarea visible");
- 719 after sending;
- resize at 400% (fails at 1280×720);
- both focus-race tests (phone sheet and desktop panel);
- two reload checks.

Two baseline "passes" were false (they compared a missing attribute: `null === null`). Those tests now compare the actual focused element. After the fixes, all 14 pass.

## Priority 3 — Security and robustness
- **Item 10, photo exposure.** Details are in `docs/SECURITY-PHOTO-EXPOSURE.md`. `refs/pull/2/head` (`a5773d5`) **still reaches the unredacted photo** (blob `a0580e4…`). Every other remote ref was checked and does not reach it. The repository is private. Vercel previews built before the rewrite could also serve it; this was not verified, because the environment can't reach vercel.app. GitHub Support and Vercel steps are documented. **The history is not clean on GitHub.**
- **Item 11.** More ways of asking for a person are now recognised; 18 phrases that were missed at the baseline are listed in the tests. Declines and statements that only mention an engineer, or say "I need it", still don't count. Re-selecting the same equipment now renews and saves the activity time (`selectionSeq`).
- **Item 12.** Restored session data is now validated more strictly:
  - Stored values over 1,000,000 characters are discarded before parsing.
  - Message IDs must be `m<n>` with n ≤ `seq`, and `seq` must be a safe integer of at most 1,000,000.
  - `typedText` is allowed only on typed answers.
  - `confirmedOffAir` must be a boolean and requires `urgent`; sessions saved before RT-002C are read as unconfirmed.
  - Workspace IDs are checked against real equipment, views, and a hotspot belonging to that equipment.
  - `__proto__` keys can't pollute objects, and a storage that throws is treated as empty.

## Full results (final code, all run)
| Check | Result |
| --- | --- |
| `npm run check` (typecheck + unit + build) | pass; **17 files, 423 tests** |
| `npm run test:e2e`, three complete runs | each **197 passed, 0 failed, 0 flaky**; 113 skipped by design (project-scoped `test.skip` for tests that set their own viewport, or touch-only/desktop-only tests; 310 total) |
| Accessibility (axe, `accessibility.spec.ts`, 5 widths) | included above, all pass |
| PR #4 compatibility (local trial merge, not pushed) | no conflicts; typecheck pass; 20 files / 496 unit tests pass |

## Residual risks and limitations
- The reproductions are the team's own, not the auditor's exact examples. If the report becomes available, its phrases should be added to the regression files as they are.
- Reply understanding is still rule-based. Unusual phrasings can still be misread, but the defaults are conservative: unclear replies are re-asked, and possible silence is escalated.
- Possible off-air reports go straight to the urgent outcome, which may sometimes over-escalate. This was chosen deliberately for safety.
- The photograph remains exposed through `refs/pull/2/head` until GitHub Support acts, and possibly through Vercel previews. The local clone in the development container still holds the rewrite's `refs/original/*` backup refs, and the scratchpad holds a pre-rewrite bundle. Both are temporary, and their earlier removal was not permitted in this session.
- Browser tests run in Chromium only; nothing has been tested yet on physical iPhones or Android phones.
