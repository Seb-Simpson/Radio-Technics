# Radio Technics — Project Brief

## Product vision

Radio Technics helps radio presenters understand their studio and resolve common technical problems quickly and calmly, without needing technical knowledge. It combines:

1. **Interactive Studio Explorer** — a visual recreation of the real studio built from photographs. Presenters select equipment to learn what it does, what commonly goes wrong, and where to find help.
2. **Intelligent Troubleshooter** — an assistant that understands vague or inaccurate descriptions ("the green thing isn't working"), asks one simple question at a time, and can point at equipment in the Studio Explorer.

The assistant explains and guides. It **never operates real broadcast equipment**.

## Intended users

| User | Needs |
| --- | --- |
| Presenters (primary) | Fast, plain-English help, often under live-broadcast pressure. Limited technical knowledge. |
| Guests / volunteers | Understanding which microphone or headphones to use. |
| Station engineer | A place to record verified equipment information and procedures; a summary of reported problems. |
| Station management | Confidence that advice given is accurate and approved. |

## Key functionality

- Persistent app shell: Dashboard, Studio Explorer, Troubleshooter, Knowledge Centre, Administration.
- Photograph viewer with zoom, pan, touch, keyboard control and clickable equipment hotspots.
- Equipment detail panel: description, function, known information, reported problems, related guides and open questions for the engineer — each fact labelled with its verification status.
- Troubleshooter that clarifies ambiguity, offers "I'm not sure", "Show me where" and "I need technical support" on every question, and produces a summary for technical support.
- Validated, structured workspace commands so the troubleshooter (and later an AI) can highlight equipment without being able to run arbitrary actions.
- Knowledge Centre with search and per-article and per-section verification status.

## Known station details

- One studio with a fixed set of equipment.
- Ten studio photographs have been collected. **None have been added to the project yet.**
- Equipment identified so far: main broadcast mixing console; presenter and guest microphones; Myriad radio playout software; a standalone green physical button that advances Myriad to the next song; a Zoom video camera; headphone monitoring; studio monitor speakers; audio level meters; a technical equipment rack; associated studio computer equipment.
- The green button's reported function is advancing Myriad to the next song. Its wiring, trigger mechanism and behaviour in each playout mode are **unknown**.

See [EQUIPMENT.md](EQUIPMENT.md) for detail and open questions.

## Constraints

- **No invented technical information.** Model numbers, connections, settings and procedures must come from the station engineer. Unconfirmed information is labelled as such.
- No paid services or API keys in Phase 001.
- No authentication, database or microservices yet; architecture must make these easy to add later.
- Plain English, one question at a time, no dead ends, accessible to keyboard and screen-reader users, respects reduced motion.
- Must remain useful on desktop and tablet; usable on phones.
