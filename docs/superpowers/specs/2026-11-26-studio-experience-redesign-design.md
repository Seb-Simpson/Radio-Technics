# Studio experience redesign — design

**Date:** 2026-11-26 · **Status:** awaiting owner approval · **Branch:** `feat/studio-experience-redesign` (from `feat/github-pages-static`, PR #7, which sits on PR #6)

## Intent
Make Radio Technics much easier and faster to use, especially for a presenter under pressure, and much better at teaching someone the studio — without inventing facts. Three parts, built in this order (agreed with the owner):

1. **Real answers from the manuals** — Myriad 6 "how do I…?" answers and explanations of the hardware, from the manufacturers' own documentation.
2. **Design overhaul** — mid-show home screen, card-style questions inside the chat, calmer safety design, phone tab bar, visual polish.
3. **A Studio Explorer that teaches** — guided tour, numbered pins, browse by area, full-screen viewer, "Where is it?" search, clearer equipment cards.

Later, not in this work: the 360° panorama (needs a photo the owner can't take yet) and AI (RT-004; the chat stays because AI will plug into it).

## Goals
- Someone mid-show reaches the right help in one or two taps.
- Someone new can learn the studio by being shown around it.
- Answers say what the manufacturer documents, in plain English, with a link to the source.
- Every existing safety guarantee still holds (see Constraints).

## Non-goals
- No new equipment facts, wiring, settings or procedures that aren't in a source.
- No 3D room, floor plan or guessed layout (we don't know where things sit; the rules forbid presenting a guessed layout as the real studio).
- No AI provider, no accounts, no server — the site must still build as static files for GitHub Pages.

## Anti-goals (would make this a failure even if it "works")
- A manual-derived "how to" shown as if it were an approved station procedure.
- The urgent broadcast control becoming hard to find, or depending on language understanding.
- Anything pinned on phones that covers buttons or the focused element.
- A prettier app that is slower to use mid-show.

## Constraints (from CLAUDE.md and earlier audits — unchanged)
- Content stays data, linked by ID. Answers are recorded only by pressing a displayed option of the active question instance; typed text only suggests.
- Safety classification runs before routing; urgency only increases; the off-air control works on every page without language understanding.
- Manufacturer documentation is labelled `manufacturer-documented`, records `retrievedOn`, cites the source URL, is written in original words (no copying), and **never** authorises operating equipment; `approved-procedure` still requires engineer verification and a review record. Manuals are linked, not re-hosted (copyright; the site is public).
- Accessibility: axe clean at 1440, 820, 390, 375, 320 px; visible focus; real labels; reduced motion respected; focus never obscured.
- Static export (`npm run build:pages`) keeps working.

## Approaches considered
**Order.** (a) Manuals → design → explorer [chosen by the owner: the manuals could be read now and they make the biggest difference to usefulness]; (b) design first [rejected: new screens would be built around today's thin content]; (c) everything at once [rejected: too large to review and test safely].

**Troubleshooter shape.** (a) Keep the chat and render each assistant question as a card with large answer buttons inside it [chosen: keeps the chat for future AI, gives big targets]; (b) replace the chat with a step-by-step wizard [rejected: the owner wants the chatbot]; (c) leave as is [rejected].

**Immersion without new photos.** (a) Guided tour + numbered pins + areas + full-screen viewer over the real photos [chosen]; (b) illustrative 3D/floor plan [rejected: invented layout]; (c) photogrammetry/360 [deferred: needs new capture].

## Part 1 — Real answers from the manuals
- Read the Myriad 6 help-centre articles relevant to presenters (dashboard, playing items, Live Assist, players, stop chains, Go/next item, current/next item display) and the publicly available Axia/Telos and Behringer documentation for the equipment we can name: Axia iQ console (label), Axia QOR.16 engine, Telos X-NODE 2, Behringer MS16 (model to be confirmed by the station). Only pages that are actually reachable and readable are used; anything else stays an open question.
- For each article section summarised: status `manufacturer-documented`, a source with `url`, `retrievedOn`, publisher; original wording; a visible label "From the Myriad 6 manual" (or the maker's name) and a link to the original. Where the station's setup may differ (e.g. what the green button does, which stop chains are used), say so and keep the open question.
- New/updated articles answer common presenter questions ("How do I play the next song?", "What do the colours on the Myriad screen mean?", "What do the PROGRAM 1 and MONITOR meters show?"). Hardware articles explain what controls and indicators are; they do not give fault-recovery steps.
- Troubleshooting flows may link to these articles as information ("Here's what the Myriad manual says about…"), never as an instruction to change anything; outcomes still direct people to technical support.
- `validateContent()` and the search vocabulary are extended to cover the new content; the Knowledge Centre shows the source and label.

## Part 2 — Design overhaul
- **Mid-show home screen.** The Dashboard leads with "What's wrong?" and five or six large tiles mapped to existing topics (`topic-next-song`, `topic-microphone`, `topic-cant-hear`, `topic-not-responding`, `topic-cable`) plus "Something else" (opens the troubleshooter). A "Continue your conversation" card appears when a session exists. "Learn the studio" (tour) and "Guides" sit below. The setup-progress statistics move to the Admin page.
- **Card-style questions in the chat.** The conversation stays. The current question is shown as a card (question, optional help, large answer buttons, "I'm not sure", "Show me where", "I need technical support"); earlier turns stay above as a compact history. Suggestions from typed text appear as the same card with the proposition highlighted. The composer stays.
- **Calmer safety design.** The full-width red urgent row on every page becomes a compact, always-visible "Off air?" control in the app header (desktop and phone), opening the same urgent flow with one press — its accessible name stays "We're off air / urgent broadcast problem". Full red appears only when an incident is open (banner + "Broadcasting has resumed"). Restored/selected/prototype notices fold into one status line with details on demand.
- **Phone tab bar.** Below 1024 px: a bottom tab bar (Home, Studio, Help, Guides). Page content gets bottom padding and `scroll-padding-bottom` equal to the bar so nothing is covered and focus is never obscured; the Studio equipment sheet sits above the bar.
- **Polish.** Clearer type scale and spacing, fewer badges (verification status shown as one small label with details on tap), consistent cards and buttons via existing tokens, and a light theme following the system setting with a manual toggle (dark stays the default).

## Part 3 — A Studio Explorer that teaches
- **Numbered pins** on every hotspot (visible, labelled, minimum target size), replacing the near-invisible regions; selection behaviour, keyboard order and hotspot identity unchanged.
- **Guided tour.** "Show me around the studio": steps through tour stops in a fixed order, zooming to each hotspot with a short caption drawn from the equipment record (by ID, not copied text), "n of N", Next/Back/Exit, keyboard and reduced-motion support. Tour order lives in a data file referencing hotspot IDs and is validated.
- **Browse by area.** Photos grouped into Desk, Screens, Rack, Speakers & monitoring (a new `area` field on each studio view, assigned from what each photo shows; draft, editable).
- **Full-screen viewer** on phones: swipe between photos, thumbnail strip, existing zoom/pan kept.
- **"Where is it?" search** on the Studio page: type an equipment name or alias → opens the photo, zooms and highlights; equipment shown in more than one photo lists "Also seen in…".
- **Equipment cards** with the same three parts every time: *What it is* (existing description/function), *What you'll see* (existing known information and indicators), *Leave alone unless told* (only station-reported notes such as "Please leave all Myriad faders up at end of show" and the general caution about cables and power; nothing invented). Manual links appear when Part 1 adds them.

## Delivery
Three phases, each a branch + PR with `npm run check`, full `npm run test:e2e` (axe at five widths), a static-build smoke test, and screenshots. New flows, data fields and validation rules get tests. Existing tests keep passing unless a change in this design explicitly alters what they check; any such change is listed in the PR.

## Left to the builder
Exact visual details (spacing values, icon choices, animation timing within reduced-motion rules), the tour's caption wording drawn from existing records, which Myriad articles are worth summarising after reading them, and the area assignment of each photo (listed in the PR for the owner to check).
