# Engineer review guide

Radio Technics labels everything with how far it can be trusted. Only the station engineer can raise content to **Engineer approved**.

| Level | `status` | Meaning | Can it instruct presenters? |
| --- | --- | --- | --- |
| Engineer approved | `verified` | Confirmed by the station engineer; carries a `review` record (reviewer, real date, source). | Only articles with `kind: "approved-procedure"` |
| Manufacturer documentation | `manufacturer-documented` | Summarised from an official source that has actually been read (`retrievedOn` set). General product behaviour. | **No** — never a station procedure |
| Station reported | `station-reported` | Told to us by station staff, with a source. | No |
| Unverified draft | `draft` | Written by the development team or read from a photo. | No |

`validateContent()` (unit-tested, shown on /admin) enforces: approved procedures must be `verified` with review metadata and all sections verified; manufacturer-documented content must cite a manufacturer source that was read; no placeholder reviewers or sources ("TBC", "n/a"). Validation checks the shape of a record — it cannot prove that an approval really happened.

## Where to find outstanding questions
- **/admin → Review queue**: open questions by equipment and by article, manufacturer sources not yet read, unconfirmed photo identifications.
- Each article's **"Unresolved — waiting for the station engineer"** section.
- `EQUIPMENT.md`.

## Approving something
1. Engineer confirms the fact or procedure (in person or in writing).
2. A developer edits the record in `src/data/`: set `status: "verified"`, add `review: { reviewer, date, source }`, add a `revisions` entry, and remove the answered open question.
3. For a procedure, set `kind: "approved-procedure"` only after every section is verified.
4. Run `npm run check`. There is no in-app editing yet (RT-005).

## Manufacturer documentation read (2026-11-26)
Everything below was read on 2026-11-26 and summarised in our own words. None of it describes a fix, a restart or a recovery step, and none of it says how this station has set anything up. Each page is listed in `src/data/sources.ts` and `EQUIPMENT.md` ("Documentation read").

| Product | What was read | Kind |
| --- | --- | --- |
| Myriad 6 | Playout support landing page; Dashboard; Playing Media Items; Log Icons; Media Item Types and Display; Using Media Players; Media Item Types, Endings and Sweepers | Help pages (manual) |
| Axia iQ | iQ Broadcast Console page | Product page (not the manual) |
| Axia QOR.16 | QOR.16 Integrated Console Engine page | Product page (not the manual) |
| Telos xNode2 | "Introducing the xNode2" and "In-Depth" chapters | Manual chapters |
| Behringer MS16 | MS16 page | Product page (not the manual) |

Short answers on these articles are labelled "From the ... manual" (or "product page") with a link to the original. Troubleshooter outcomes now point to the same short answers ("What the manual says"). This is information only: the outcome still tells the presenter to contact technical support, and the links are never shown on the urgent outcome or while a broadcast interruption is open.

## What still needs the station engineer
- **Green button or Go:** the manual describes Myriad's own Go control. Is the green button the same thing, or something else wired to Myriad? Until answered, Radio Technics does not say they are the same.
- **Stop chains:** are stop chains in use in this studio's logs, and how should a presenter tell a deliberate stop from a fault?
- **MS16:** the product page describes a small powered stereo speaker pair. The photograph label and the wall mounting do not obviously match it. Confirm the model, how many there are, and what is connected.
- **QOR.16 and the iQ console:** Axia lists the QOR.16 for other consoles and names a different engine for the iQ. Is the QOR.16 in the rack the one serving the console labelled iQ?
- **xNode2 variant:** the rack label says only X-NODE 2. The manual covers five models (analog, AES3, microphone, GPIO, mixed signal). Which one is it?
- **Normal and fault indicators:** what the Myriad dashboard, the QOR.16 display, the xNode2 screen and the iQ displays look like normally, and when something is wrong.
- **Unread PDFs:** the Axia iQ User Manual and Quick Start Guide, the QOR.16 manual, the rest of the xNode2 manual, and the Behringer MS16 Quick Start Guide and User Manual were not read (the MS16 ones are on a site we could not reach). Please supply them or confirm they can be read.
- Nothing above has been engineer-verified. Short answers are manufacturer-documented at best; station-specific statements stay drafts or station-reported.

## Myriad documentation (earlier note)
Earlier, the Broadcast Radio help pages could not be reached and Myriad articles were drafts. They have now been read (see above); the articles remain drafts until the engineer confirms how this studio uses Myriad.
