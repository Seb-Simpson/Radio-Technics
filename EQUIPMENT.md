# Studio Equipment

> **Source of truth:** `src/data/equipment.ts` (records) and `src/data/hotspots.ts` (where each item appears in the photographs). Update these files and this document together.
>
> Status key — **Station reported**: told to us by station staff, not yet confirmed by the engineer. **Unverified**: a general description by the development team, or a label read from a station photograph. **Engineer verified**: none yet.

Nothing in this document has been verified by the station engineer. Labels visible in the photographs are recorded as observations only. They are not treated as confirmed facts and have not been turned into instructions.

## Documentation read

Manufacturer pages read on 2026-11-26 (publisher: Broadcast Radio; product: Myriad 6). They are summarised in our own words and never copied. Reading them does not authorise any repair or recovery step, and none of them describes fault-finding.

| Source ID | Page | Status |
| --- | --- | --- |
| `myriad-6-support` | https://www.broadcastradio.com/myriad-6-playout-support | Read. Landing page only; points to the help portal. |
| `myriad-6-dashboard` | https://help.broadcastradio.com/support/solutions/articles/101000549663-understanding-the-dashboard-in-myriad-playout-6 | Read. |
| `myriad-6-playing-media` | https://help.broadcastradio.com/support/solutions/articles/101000549648-playing-media-items-in-myriad-playout-6 | Read. |
| `myriad-6-log-icons` | https://help.broadcastradio.com/support/solutions/articles/101000534883-myriad-playout-myriad-anywhere-pro-log-icons | Read. Covers Playout and Anywhere Pro; icon images are not described in its text, so colours other than Go (green circle), Stop (red square) and Sweeper (yellow plus) are not recorded. |
| `myriad-6-item-types` | https://help.broadcastradio.com/support/solutions/articles/101000549542-understanding-media-item-types-and-display-in-myriad | Read. |
| `myriad-6-media-players` | https://help.broadcastradio.com/support/solutions/articles/101000549652-using-media-players-in-myriad-playout-6 | Read (found by searching the help portal). |
| `myriad-6-endings-sweepers` | https://help.broadcastradio.com/support/solutions/articles/101000549606-understanding-media-item-types-endings-and-sweepers-in-myriad-playout-6 | Read (found by searching the help portal). |

Not read: help-portal search hits that are not about Myriad 6 playout basics (Myriad 7, Cloud, MIDI controllers, BR Live) and the Glossary and "Number of items to cue" pages, which were not needed yet. No page failed or needed a login.

Not stated by any page read: what the dashboard looks like when nothing is playing or when playout has failed, and the on-screen colours of the dashboard background. The station engineer still needs to confirm how this studio is set up.

## Equipment

| ID | Equipment | Function | Status | Seen in photographs |
| --- | --- | --- | --- | --- |
| `mixing-console` | Main broadcast mixing console | Combines and controls studio sound sources | Unverified | Mixing console, Myriad screen, Eight-fader panel |
| `presenter-microphone` | Presenter microphone | Picks up the presenter's voice | Unverified | Microphone (assumed to be the presenter's) |
| `guest-microphones` | Guest microphones | Pick up guests' voices | Unverified | — (console channels Guest 1–3 visible) |
| `myriad-playout` | Myriad playout software | Plays the station's songs and other audio. **Myriad 6, live-assist mode** | Station reported | Myriad screen, Microphone |
| `green-next-button` | Green Myriad button | **Advances Myriad to the next song** | Station reported | Green button |
| `zoom-camera` | Zoom call camera | **Used for Zoom video calls** | Station reported | Video camera |
| `headphone-monitoring` | Headphone monitoring | Lets presenters and guests hear the studio | Unverified | Mixing console (HEADPHONES knob), Green button (edge of photo) |
| `studio-monitor-speakers` | Studio monitor speakers | Play studio audio in the room | Unverified | Monitor speaker, Monitor speaker (wider view) |
| `audio-level-meters` | Audio level meters | Show whether sound is present and how loud | Unverified | Level meters, Mixing console, Myriad screen |
| `equipment-rack` | Technical equipment rack | Houses technical equipment | Unverified | Equipment rack |
| `studio-computers` | Studio computer equipment | Run studio software, including Myriad | Unverified | — (no dedicated hotspot) |

The *existence* of each item is station reported.

## What the photographs show (unverified observations)

- **Console:** labelled *Axia iQ*. Channel displays read Guest 1, Guest 2, Guest 3, Myriad A 1–A 4. Meter displays read PROGRAM 1 and MONITOR. There are knobs labelled MONITORS and HEADPHONES and a control labelled GUEST HPH. A label reads *"Please leave all Myriad faders up at end of show"*.
- **Eight-fader panel:** displays read LLMic1/DI, LLMic2, Ext In 1, PC/Phone2, CD1, CD2, Studio B, Sustain. Its relationship to the main console is unknown.
- **Myriad:** window title *Myriad Playout v6 by Broadcast Radio*; four players; play-mode buttons Standby, Live, AutoFade. A logged-in user name was blurred on import.
- **Green button:** black box with a large green push button and a small hole above it (possibly an indicator light).
- **Camera:** label reads *HD 1080P WEBCAM X1*. Manufacturer and model unknown.
- **Speakers:** labelled *MS16 Monitor Speaker* with a Behringer logo; wall-mounted. Two photos — possibly the same speaker.
- **Meters:** separate unit labelled *Canford Dual PPM*, meters A and B, with peak lights.
- **Microphones:** a microphone with a MIX 92.6 foam windshield in a shock mount; microphone arms carry numbered markers 1, 2 and 3.
- **Rack:** units labelled *Axia QOR.16 Integrated Console Engine* and *X-NODE 2 (The Telos Alliance)*; a 14-switch power panel labelled DESK PSU, CD 1, CD 2, MYRIAD MONITOR, PRESENTER MONITOR, MIC LIVE, KVM 4 WAY, MON SPKR LEFT, MON SPKR RIGHT, MINI DISK, GUEST MONITOR, H/P AMP. A sticker showed a phone number; it has been **redacted** from the served photo and is not shown in the app until the station confirms it.
- **Screens:** a label reads *"Please do not switch off screens"*.

## Questions for the station engineer

### Mixing console
- Confirm the console model (the photograph shows an Axia iQ label).
- Which channel/fader is assigned to each source (presenter mic, guest mics, Myriad, other inputs)?
- What does the "Please leave all Myriad faders up at end of show" label mean for presenters during a show?
- How does the separate eight-fader panel relate to the main console, and what are its channels for?
- Are there controls presenters should never change?

### Microphones
- How many guest microphones are there (the console shows Guest 1–3)?
- Which numbered microphone arm belongs to which console channel?
- Which microphone is the presenter's? (The "Microphone" photo is assumed to show it.)
- Make and model of each microphone; do they need a separate on/off or mute control?

### Myriad
- Confirm the installed version (the screen shows Myriad Playout v6) and which computer runs it.
- What does live-assist mode mean for presenters here, and are the other modes on screen (Standby, AutoFade) ever used?
- Can presenters also advance to the next song from the Myriad screen? If so, how?

### Green button
- How is the button connected to Myriad (wiring and trigger mechanism)?
- What does it do in each Myriad play mode?
- What happens if it is pressed more than once?
- Is the small hole above the button an indicator light, and what does it show?

### Zoom call camera
- Which computer is it connected to, and who sets up Zoom calls?
- May presenters adjust the camera's position?

### Headphones
- How many headphone outputs are there and where?
- Which control sets each headphone's volume? Is there a separate headphone amplifier (the rack has a switch labelled H/P AMP)?
- What does the GUEST HPH control do?

### Studio speakers
- Confirm the model (photos show Behringer MS16) and how many there are.
- Do the speakers mute automatically when a microphone is live?
- Which control sets the speaker volume?

### Level meters
- Which audio does each meter show (Canford meters A and B; console PROGRAM 1 and MONITOR)?
- What level should presenters aim for?

### Equipment rack
- Confirm what each unit in the rack does.
- Should presenters ever use the switches on the power panel?
- Is the phone number on the rack sticker the right number for presenters to call?

### Studio computers
- How many computers are there and what is each used for?
- May presenters restart any computer, and how?

### General
- Technical-support contact details, including out-of-hours arrangements.
- Is there an existing emergency procedure for silence on air?
- Please confirm or correct each hotspot's identification in the Studio Explorer (each shows "In this photo: … Unverified").
