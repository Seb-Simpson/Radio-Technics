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

## Official Myriad documentation
Three Broadcast Radio help pages are listed as sources (Myriad Playout 6 support, Dashboard, currently-playing). They have **not yet been read**: the development environment's network policy blocked `www.broadcastradio.com` and `help.broadcastradio.com`. Myriad articles are therefore drafts with open questions. Once the hosts are allowed, read the pages, write original summaries, set `retrievedOn`, and mark summarised sections `manufacturer-documented`.
