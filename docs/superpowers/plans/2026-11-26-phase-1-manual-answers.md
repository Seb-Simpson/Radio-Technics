# Phase 1 — Real Answers From the Manuals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presenters get short, plain-English answers drawn from the manufacturers' own documentation (Myriad 6 first, then the named hardware), clearly labelled and linked, instead of only "contact technical support".

**Architecture:** Content stays data. Articles gain a `quickAnswer` (one or two sentences shown first, everywhere) and sections become `manufacturer-documented` once their source has actually been read (`retrievedOn` set). The Knowledge Centre, search results, equipment panel and troubleshooter outcomes surface these answers with a visible "From the Myriad 6 manual" label and a link to the original. Nothing from a manual authorises fixing or changing equipment.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Vitest + Testing Library, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-26-studio-experience-redesign-design.md` (Part 1)

## Global Constraints
- Content is data, linked by ID; never copy equipment text into components.
- Manufacturer content: status `manufacturer-documented`; source has `url`, `retrievedOn` (the real date it was read, YYYY-MM-DD), publisher; original wording — no copied sentences; manuals are linked, not re-hosted.
- Manufacturer documentation never authorises operating or fixing equipment. Describe what the product does ("In Live Assist, Myriad waits for the presenter to start the next item"); no fault-recovery steps; `approved-procedure` still requires engineer verification.
- Where the station's setup may differ (green button vs Go, which stop chains are used), say so in the text and keep the open question.
- Visible label on every manufacturer-derived answer: `From the <product> manual` (e.g. "From the Myriad 6 manual"), plus a link "Read the original".
- User friendly (owner): answers lead with one or two plain sentences (≤ 40 words), no jargon without the glossary, large readable type, works one-handed on a phone.
- `validateContent()` returns no issues; `npm run check` and `npm run test:e2e` (axe at 1440, 820, 390, 375, 320) pass; `npm run build:pages` still builds.

## Review Focus
1. A source page that turns out to be unreachable or login-walled → it stays `retrievedOn: null`, nothing cites it as manufacturer-documented, its open question stays (Task 2 test).
2. A quick answer longer than 40 words or with no source → validation fails (Task 1 test).
3. An article whose sections mix station-reported and manufacturer content → each section shows its own label; the page header doesn't claim the whole article is from the manual (Task 4 test).
4. Search for a presenter phrasing like "how do i play the next song" → the quick answer appears in the results without opening the article (Task 5 test).
5. Urgent phrasing in the Knowledge Centre ("we're off air, how do I…") → the urgent alert still comes first, above any manual answer (Task 5 test).

---

### Task 1: `quickAnswer` and manual labels in the data model

**Files:**
- Modify: `src/types/index.ts` (KnowledgeArticle, SourceReference)
- Modify: `src/lib/content/validate.ts`
- Create: `src/lib/knowledge/manual-label.ts`
- Test: `tests/unit/manual-answers.test.ts`

**Interfaces:**
- Produces: `KnowledgeArticle.quickAnswer?: { text: string; status: VerificationStatus; sourceIds: string[] }`; `SourceReference.product?: string` (e.g. "Myriad 6"); `manualLabel(source: SourceReference): string | null` → `"From the Myriad 6 manual"` for a read manufacturer source with `product`, else `null`; `QUICK_ANSWER_MAX_WORDS = 40`.

- [ ] **Step 1: Write failing tests** in `tests/unit/manual-answers.test.ts`:
  - `manualLabel({ kind: "manufacturer", product: "Myriad 6", retrievedOn: "2026-11-26", … })` → `"From the Myriad 6 manual"`; with `retrievedOn: null` → `null`; station source → `null`.
  - `validateContent` reports, for a cloned article: quick answer of 41 words → `/quick answer is longer than 40 words/`; quick answer `manufacturer-documented` citing an unread source → `/cites a manufacturer source that hasn't been read/`; quick answer citing a source not in `sources` → `/quick answer cites unknown source/`; `manufacturer-documented` quick answer on an `approved-procedure` article → error.
  - Real content passes: `validateContent(defaultContent, NOW)` → `[]`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/manual-answers.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the types, `manualLabel`, and the validation rules (reuse the existing section/source checks for status and `retrievedOn`).
- [ ] **Step 4: Run** the test and `npx vitest run tests/unit/content-validation.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(knowledge): quick answers and manual labels in the content model`.

### Task 2: Read the Myriad 6 documentation and register the sources

**Files:**
- Modify: `src/data/sources.ts`
- Modify: `EQUIPMENT.md` (record what was read, and what couldn't be)
- Test: `tests/unit/manual-answers.test.ts` (add)

**Interfaces:**
- Produces: source IDs `myriadSupport`, `myriadDashboard`, `myriadPlaying` (existing, now read) and new `myriadLogIcons` (`…/101000534883-myriad-playout-myriad-anywhere-pro-log-icons`), `myriadItemTypes` (`…/101000549542-understanding-media-item-types-and-display-in-myriad`), plus any Live Assist / stop chain / Go article found by searching help.broadcastradio.com. Each: `kind: "manufacturer"`, `publisher: "Broadcast Radio"`, `product: "Myriad 6"`, `retrievedOn` = the date actually read, no `NOT_YET_READ` note.

- [ ] **Step 1: Read** each page with `curl` (hosts are allowed in this environment) and take notes in the scratchpad: what it says about the dashboard colours, the current/next item, Live Assist, starting the next item, stop chains, the log icons. Note any page that fails or needs a login.
- [ ] **Step 2: Write failing test** `every manufacturer source cited by a manufacturer-documented section or quick answer has retrievedOn and product` and `no read manufacturer source keeps a NOT_YET_READ note`.
- [ ] **Step 3: Update** `src/data/sources.ts` with the read sources (real dates) and leave unreachable ones `retrievedOn: null`; list both in `EQUIPMENT.md` under "Documentation read".
- [ ] **Step 4: Run** `npx vitest run tests/unit/manual-answers.test.ts tests/unit/content-validation.test.ts` — PASS.
- [ ] **Step 5: Commit** `content(sources): Myriad 6 help pages read and registered`.

### Task 3: Myriad answers in the articles

**Files:**
- Modify: `src/data/articles.ts` (the nine `kb-myriad-*` articles, `guide-green-button`, `ts-next-song-wont-play`)
- Modify: `src/data/glossary.ts` (stop chain, Go, Live Assist definitions → manufacturer-documented where the manual defines them)
- Test: `tests/unit/manual-answers.test.ts` (add)

**Interfaces:**
- Consumes: Task 1 `quickAnswer`, Task 2 source IDs.
- Produces: each `kb-myriad-*` article has a `quickAnswer` (≤ 40 words) and at least one `manufacturer-documented` section citing a read source; open questions remain for station-specific behaviour; a `revisions` entry dated the day of the change, author "Development team (from Myriad 6 manual)".

- [ ] **Step 1: Write failing tests:**
  - `every kb-myriad article has a quick answer from a read Myriad source`.
  - `kb-myriad-go-and-button still says the green button and Go are not confirmed to be the same` (text match `/not (yet )?confirmed/i` in a section or open question).
  - `no manufacturer-documented text tells the presenter to restart, unplug, reset or change settings` (regex over manufacturer sections: `/\b(restart|reboot|unplug|reset|power off|change the setting)\b/i` → none).
  - Hand-written spot checks of meaning, e.g. `kb-myriad-live-assist` quick answer mentions that Myriad waits for the presenter (`/wait|presenter starts|manually/i`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Write the content** in original plain English (≤ 40-word quick answers, short sections, glossary terms linked), statuses and `sourceIds` set; keep station-reported sections as they are.
- [ ] **Step 4: Run** the tests and `validateContent` — PASS.
- [ ] **Step 5: Commit** `content(knowledge): Myriad 6 answers from the manual`.

### Task 4: Show quick answers and manual labels everywhere

**Files:**
- Create: `src/components/knowledge/QuickAnswer.tsx` (card: answer text, label chip "From the Myriad 6 manual", "Read the original" link opening in a new tab, verification badge)
- Create: `src/components/knowledge/SourceLabel.tsx` (the chip, used per section)
- Modify: `src/app/knowledge/[articleId]/page.tsx` (QuickAnswer first; SourceLabel on each manufacturer section)
- Modify: `src/components/knowledge/KnowledgeCentre.tsx` (article cards show the quick answer instead of the summary when present)
- Modify: `src/components/studio/EquipmentPanel.tsx` (a "From the manual" list of related articles with quick answers)
- Test: `tests/unit/knowledge.test.tsx` (add)

**Interfaces:**
- Consumes: Task 1 `manualLabel`, `quickAnswer`.
- Produces: `<QuickAnswer article={KnowledgeArticle} />`, `<SourceLabel source={SourceReference} />`.

- [ ] **Step 1: Write failing tests:** article page renders the quick answer text before the first section heading; shows "From the Myriad 6 manual" and a link with the source URL and `target="_blank" rel="noopener noreferrer"`; a station-reported section in the same article shows no manual label (Review Focus 3); the equipment panel for `myriad-playout` lists the Myriad quick answers.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the components with existing tokens and `buttonStyles()`; text at least 15px, answer at 17px on phones; the label is text, not colour alone.
- [ ] **Step 4: Run** unit tests — PASS.
- [ ] **Step 5: Commit** `feat(knowledge-ui): quick answers and manual labels`.

### Task 5: Find the answers by asking naturally

**Files:**
- Modify: `src/data/search-vocabulary.ts` (concepts/intents for "how do I play the next song", "what do the colours mean", "what is live assist", "what does PROGRAM 1 / MONITOR mean", "what are the icons in the log")
- Modify: `src/lib/knowledge/search-engine.ts` (`ArticleResult` gains `quickAnswer`)
- Modify: `src/components/knowledge/KnowledgeCentre.tsx` (top result shows its quick answer inline)
- Test: `tests/unit/knowledge-search.test.ts` (add), `tests/unit/knowledge.test.tsx` (add)

**Interfaces:**
- Consumes: Tasks 1, 3.
- Produces: `ArticleResult.quickAnswer?: string`.

- [ ] **Step 1: Write failing tests:** `searchKnowledge("how do i play the next song", …)` top article is `kb-myriad-next-item` and has a `quickAnswer`; "what do the red squares mean" → `kb-myriad-screen`; UI: typing the first query shows the quick answer text in the results region; "we're off air, how do I play the next song" → urgent alert rendered before any quick answer (Review Focus 5).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the vocabulary and the inline quick answer.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(search): quick answers in search results`.

### Task 6: Hardware explanations from the makers' documentation

**Files:**
- Modify: `src/data/sources.ts`, `src/data/articles.ts`, `src/data/equipment.ts` (`relatedArticleIds`), `EQUIPMENT.md`
- Test: `tests/unit/manual-answers.test.ts` (add)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: for each of Axia iQ (console label), Axia QOR.16, Telos X-NODE 2, Behringer MS16 whose public documentation is reachable and readable: a source (`product` set, real `retrievedOn`) and an informational article explaining what the unit is and what its visible controls/indicators mean, with a quick answer; nothing about fault recovery. Unreachable documentation is recorded as an open question in `EQUIPMENT.md`; models not confirmed by the station (MS16) are stated as "the photo shows …".

- [ ] **Step 1: Find and read** the public product pages/manuals on www.telosalliance.com / docs.telosalliance.com / www.behringer.com; note what's readable.
- [ ] **Step 2: Write failing tests** for each article created: has a quick answer from a read source; no recovery verbs (same regex as Task 3); linked from its equipment record.
- [ ] **Step 3: Write the content.**
- [ ] **Step 4: Run** — PASS, `validateContent` clean.
- [ ] **Step 5: Commit** `content(knowledge): hardware explanations from manufacturer documentation`.

### Task 7: Troubleshooter points to the manual (information only), checks, PR

**Files:**
- Modify: `src/data/troubleshooting-flows.ts` (outcome `help` text references related article IDs) or `src/components/troubleshooter/Troubleshooter.tsx` (outcome shows "What the manual says" links from the conversation's equipment `relatedArticleIds`)
- Create: `tests/e2e/manual-answers.spec.ts`
- Modify: `PHASE_STATUS.md`, `docs/ENGINEER_REVIEW.md` (what was read, what still needs the engineer)
- Test: `tests/unit/troubleshooter-ui.test.tsx` (add)

- [ ] **Step 1: Write failing tests:** at `outcome-report` for the green button, the troubleshooter shows a "What the manual says" link to `kb-myriad-next-item` labelled "From the Myriad 6 manual", and the outcome still says to contact technical support; e2e at all widths: search "how do I play the next song" → quick answer visible → open article → label + "Read the original" link; axe clean; no horizontal overflow.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the outcome links.
- [ ] **Step 4: Verify:** `npm run check`; stop any `next start`, `npm run test:e2e` (full); `NEXT_PUBLIC_BASE_PATH=/Radio-Technics npm run build:pages` builds; screenshots of article page and search at 375 px and 1440 px.
- [ ] **Step 5: Commit, push** the branch, open a PR (base: `feat/github-pages-static` until earlier PRs merge) listing what was read, every source and date, and what still needs the station engineer.
