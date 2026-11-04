/**
 * RT-QA-002C regression corpus and invariants (RT-002D).
 *
 * Part 1 uses the independent audit's EXACT reproductions, in several
 * conversation states. Part 2 adds independently worded variants (pronouns,
 * tense, correction order, punctuation) written without reference to the
 * implementation's word lists. Part 3 is model-based: seeded random
 * conversations, random storage corruption and random disguised instructions,
 * checking the brief's seven invariants after every step.
 */
import { describe, expect, it } from "vitest";
import { flowNodes } from "@/data/troubleshooting-flows";
import { containsOperationalInstruction, guardModelProposal } from "@/lib/ai/contracts";
import { ENGINE_VERSION, loadSession, replayEvents, SESSION_KEY, SESSION_VERSION, type SessionEvent } from "@/lib/session/storage";
import { claimValue, extractClaims } from "@/lib/troubleshooter/claims";
import { buildSupportSummary, createConversation, describeStep, respond } from "@/lib/troubleshooter/engine";
import { classifyBroadcast } from "@/lib/troubleshooter/safety";
import type { AnsweredQuestion, ConversationState, FlowOption, UserInput } from "@/lib/troubleshooter/types";

const ctx = { selectedEquipmentId: null };
const type = (s: ConversationState, text: string) => respond(s, { type: "text", text }, ctx).state;
const press = (s: ConversationState, optionId: string) => respond(s, { type: "option", optionId }, ctx).state;
const at = (s: ConversationState) => (s.step.kind === "node" || s.step.kind === "check" ? s.step.nodeId : s.step.kind);
const nodesById = new Map(flowNodes.map((n) => [n.id, n]));

function onNode(nodeId: string): ConversationState {
  const c = press(type(createConversation(), "The green thing isn't working"), "confirm:yes");
  return { ...c, step: { kind: "node", nodeId } };
}
const atConfirmGreen = () => type(createConversation(), "The green thing isn't working");
const STATES: [string, () => ConversationState][] = [
  ["fresh", createConversation],
  ["confirming the green button", atConfirmGreen],
  ["still playing?", () => onNode("gb-current-song")],
  ["meters move? (hearing)", () => onNode("hear-meters")],
  ["meters move? (mic)", () => onNode("mic-meters")],
  ["silent on air?", () => onNode("hear-on-air")],
];
const newAnswers = (before: ConversationState, after: ConversationState) => after.answers.slice(before.answers.length);
const optionFor = (a: AnsweredQuestion): FlowOption | undefined => nodesById.get(a.questionId)?.options.find((o) => `opt:${o.id}` === a.optionId);

/* ------------------------------------------------------------------ */
/* Part 1 — exact audit reproductions                                  */
/* ------------------------------------------------------------------ */

describe("RT-QA-002C exact reproductions", () => {
  it.each(STATES)("“The meters have stopped moving.” (%s) never records 'they move'", (_name, make) => {
    const s0 = make();
    const s = type(s0, "The meters have stopped moving.");
    expect(newAnswers(s0, s).map((a) => a.answer)).not.toContain("Yes, they move");
    if (s0.step.kind === "node" && s0.step.nodeId.endsWith("meters")) {
      // Interpreted, not recorded: the presenter is asked to confirm.
      expect(newAnswers(s0, s)).toEqual([]);
      expect(describeStep(s).prompt).toBe("It sounds like the level meters aren't moving. Is that correct?");
      expect(describeStep(s).options.map((o) => o.label).slice(0, 2)).toEqual(["No, they don't move", "Yes, they move"]);
      expect(describeStep(s).options.map((o) => o.label)).toContain("I'm not sure");
      expect(press(s, "opt:still").answers.at(-1)).toMatchObject({ answer: "No, they don't move", source: "confirmed-interpretation", typedText: "The meters have stopped moving." });
    }
  });

  it.each(STATES)("“It plays neither music nor speech.” (%s) is never recorded as sound present", (_name, make) => {
    const s0 = make();
    const s = type(s0, "It plays neither music nor speech.");
    for (const a of newAnswers(s0, s)) expect(optionFor(a)?.audio).not.toBe("present");
    expect(claimValue(extractClaims("It plays neither music nor speech."), "sound")).toBe(false);
    if (at(s0) === "gb-current-song") {
      expect(newAnswers(s0, s)).toEqual([]);
      expect(describeStep(s).options[0]?.label).toBe("No — there's silence");
      expect(s.urgent).toBe(true); // escalated as possible straight away…
      expect(s.confirmedOffAir).toBe(false); // …but not as a confirmed outage
    }
  });

  it.each(STATES)("“No, there is not any sound.” (%s) is never recorded as an answer about the meters", (_name, make) => {
    const s0 = make();
    const s = type(s0, "No, there is not any sound.");
    for (const a of newAnswers(s0, s)) expect(optionFor(a)?.asserts?.subject).not.toBe("movement");
    if (at(s0).endsWith("meters")) expect(s.step.kind).not.toBe("check");
    for (const a of newAnswers(s0, s)) expect(optionFor(a)?.audio).not.toBe("present");
  });

  it("“Yes, it's not the green button.” while confirming the green button records nothing", () => {
    const s0 = atConfirmGreen();
    const s = type(s0, "Yes, it's not the green button.");
    expect(newAnswers(s0, s)).toEqual([]);
    expect(s.step).toEqual(s0.step);
    expect(s.equipmentId).toBeNull();
  });

  it.each(STATES.slice(2))("“Yes, it's not the green button.” (%s) records no diagnostic answer", (_name, make) => {
    const s0 = make();
    const s = type(s0, "Yes, it's not the green button.");
    expect(newAnswers(s0, s)).toEqual([]);
  });

  it.each(STATES.slice(2))("“No, that's not the one I meant.” (%s) creates no playback or level fact", (_name, make) => {
    const s0 = make();
    const s = type(s0, "No, that's not the one I meant.");
    expect(newAnswers(s0, s)).toEqual([]);
    expect(s.urgent).toBe(s0.urgent);
    expect(s.possibleSilence).toBe(s0.possibleSilence);
    expect(s.step).toMatchObject({ kind: "choose" });
    expect(s.messages.some((m) => /correcting which equipment/.test(m.text))).toBe(true);
  });

  it("“No, that's not the one I meant.” while confirming equipment is a plain 'no' to that identity question", () => {
    const s0 = atConfirmGreen();
    const s = type(s0, "No, that's not the one I meant.");
    expect(newAnswers(s0, s).map((a) => a.answer)).toEqual(["No, something else"]);
    expect(s.urgent).toBe(false);
  });

  it.each([
    "We have stopped broadcasting.",
    "We aren't on air.",
    "Can someone help? No sound is going out to listeners.",
  ])("“%s” is an urgent, confirmed broadcast concern in every state", (text) => {
    for (const [name, make] of STATES) {
      const s = type(make(), text);
      expect(s.urgent, name).toBe(true);
      expect(s.confirmedOffAir, name).toBe(true);
      expect(at(s), name).toBe("outcome-urgent");
      expect(buildSupportSummary(s), name).toMatch(/^URGENT: silence on air reported$/m);
    }
  });

  it("“Are we off air? Actually, I need a human.” keeps a POSSIBLE concern and opens the support route", () => {
    for (const [name, make] of STATES) {
      const s = type(make(), "Are we off air? Actually, I need a human.");
      expect(s.urgent, name).toBe(true);
      expect(s.confirmedOffAir, name).toBe(false);
      expect(s.messages.some((m) => /marked this as urgent for technical support/.test(m.text)), name).toBe(true);
      expect(describeStep(s).prompt, name).toMatch(/Contact technical support now/);
      expect(buildSupportSummary(s), name).toMatch(/possible silence on air — not confirmed/);
    }
  });

  it.each([
    ["We were off air earlier, but everything's working now.", "historical"],
    ["We would be off air if I restarted.", "hypothetical"],
    ["It is not true that we're off air.", "denied"],
  ])("“%s” is never a current outage (%s)", (text, status) => {
    expect(classifyBroadcast(text).status).toBe(status);
    for (const [name, make] of STATES) {
      const s0 = make();
      const s = type(s0, text);
      expect(s.confirmedOffAir, name).toBe(false);
      expect(s.urgent, name).toBe(s0.urgent);
      expect(s.broadcastReports.at(-1), name).toEqual({ status, text });
    }
  });

  it("a historical outage is kept for technical support without urgency", () => {
    const s = type(createConversation(), "We were off air earlier, but everything's working now.");
    expect(buildSupportSummary(s)).toMatch(/Earlier interruption mentioned \(presenter says it is over\)/);
    expect(buildSupportSummary(s)).not.toMatch(/URGENT/);
  });
});

/* ------------------------------------------------------------------ */
/* Part 2 — independently worded variants                              */
/* ------------------------------------------------------------------ */

describe("independent variants", () => {
  it.each([
    "the PPMs are dead",
    "Nothing on the meters at all",
    "they've frozen",
    "Meters? Flat. Not a flicker.",
    "the levels aren't bouncing any more",
  ])("meters not moving: %j proposes 'they don't move' and records nothing", (text) => {
    const s0 = onNode("hear-meters");
    const s = type(s0, text);
    expect(newAnswers(s0, s)).toEqual([]);
    for (const a of newAnswers(s0, s)) expect(a.answer).not.toBe("Yes, they move");
    if (s.step.kind === "check") expect(s.step.optionId).toBe("still");
  });

  it.each([
    "we've gone off air",
    "The station isn't broadcasting!!",
    "nothing's going out to listeners",
    "we're not on air right now",
    "HELP — dead air",
    "transmission has stopped",
  ])("current outage: %j", (text) => {
    expect(classifyBroadcast(text).status).toBe("current-confirmed");
  });

  it.each([
    ["could we be off air?", "current-possible"],
    ["are we still on air??", "none"],
    ["i reckon we might have dropped off air", "current-possible"],
    ["we were off air this morning, it's fine now", "historical"],
    ["yesterday we had dead air for a minute", "historical"],
    ["if the PC crashed we'd be off air", "hypothetical"],
    ["what would happen if we went off air", "hypothetical"],
    ["that's not true, we aren't off air", "denied"],
    ["we're definitely not off air", "denied"],
    ["off air? no, we're fine", "denied"],
  ])("%j → %s", (text, status) => {
    expect(classifyBroadcast(text).status).toBe(status);
  });

  it.each([
    "Is anyone there? Nothing is going out. I need someone now",
    "I need a human. We are off air.",
    "we're off air - get me an engineer",
  ])("support + outage in any order keeps urgency: %j", (text) => {
    const s = type(onNode("gb-screen"), text);
    expect(s.urgent).toBe(true);
    expect(s.confirmedOffAir).toBe(true);
  });

  it("a later support request never clears an earlier concern", () => {
    let s = type(createConversation(), "Are we off air?");
    expect(s.urgent).toBe(true);
    s = type(s, "Can I speak to a person please");
    s = type(s, "Actually never mind the green button");
    expect(s.urgent).toBe(true);
    expect(buildSupportSummary(s)).toMatch(/possible silence on air/);
  });

  it.each(["No, wrong one", "not that one, the other microphone", "I meant the guest mic", "you've got the wrong thing"])(
    "identity corrections on the playback question: %j records nothing about playback",
    (text) => {
      const s0 = onNode("gb-current-song");
      const s = type(s0, text);
      expect(newAnswers(s0, s)).toEqual([]);
      expect(s.urgent).toBe(false);
    },
  );
});

/* ------------------------------------------------------------------ */
/* Part 3 — model-based invariants                                     */
/* ------------------------------------------------------------------ */

/** Small seeded PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

const FRAGMENTS = {
  stance: ["yes", "no", "yeah", "nope", "", "", "well", "sorry"],
  sound: ["there's no sound", "it's still playing", "it plays nothing", "I can hear music", "it's silent", "nothing at all is coming out", "there is some sound"],
  meters: ["the meters stopped", "they're bouncing", "the meters aren't moving", "they move", "frozen meters"],
  identity: ["that's not the one I meant", "wrong one", "it's not the green button", "I meant the microphone"],
  history: ["we were off air earlier but we're back now", "we would be off air if I restarted", "it is not true that we're off air", "what if we go off air"],
  noise: ["banana", "the kettle is on", "purple elephant", "lorem ipsum", "the weather is nice", "asdf qwer"],
  form: ["?", ".", "!", "", "..."],
};
const RANDOM_HELP = ["I need a human", "can someone help", "who do I call"];

function randomText(r: () => number): string {
  const kind = pick(r, ["sound", "meters", "identity", "history", "noise"] as const);
  const lead = pick(r, FRAGMENTS.stance);
  const body = pick(r, FRAGMENTS[kind]);
  const extra = r() < 0.2 ? `, ${pick(r, FRAGMENTS[pick(r, ["sound", "meters", "identity", "noise"] as const)])}` : "";
  return `${lead ? `${lead}, ` : ""}${body}${extra}${pick(r, FRAGMENTS.form)}`.trim();
}

/** Invariant 1: a recorded answer derived from typed words never contradicts what those words say. */
function checkAnswerConsistency(a: AnsweredQuestion) {
  if (!a.typedText || a.source === "button") return;
  const option = optionFor(a);
  if (!option) return;
  const reading = extractClaims(a.typedText);
  if (option.audio) {
    const sound = claimValue(reading, "sound");
    if (sound !== null) expect(sound, `"${a.typedText}" → ${a.answer}`).toBe(option.audio === "present");
  }
  if (option.asserts) {
    const value = claimValue(reading, option.asserts.subject);
    if (value !== null) expect(value, `"${a.typedText}" → ${a.answer}`).toBe(option.asserts.value);
  }
}

describe("model-based invariants (seeded random conversations)", () => {
  it("hold after every step of 400 random conversations", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      let s = createConversation();
      if (r() < 0.7) s = onNode(pick(r, ["gb-current-song", "hear-meters", "mic-meters", "hear-on-air", "mic-headphones", "hear-headphones", "mic-since"]));
      const history: string[] = [];
      for (let step = 0; step < 8; step++) {
        const before = s;
        let input: UserInput;
        const roll = r();
        if (roll < 0.55) input = { type: "text", text: randomText(r) };
        else if (roll < 0.62) input = { type: "text", text: pick(r, RANDOM_HELP) };
        else {
          const options = describeStep(s).options.filter((o) => o.id !== "restart");
          if (options.length === 0) break;
          input = { type: "option", optionId: pick(r, options).id };
        }
        s = respond(s, input, ctx).state;
        if (input.type === "text") history.push(input.text);
        const label = `seed ${seed} step ${step}: ${JSON.stringify(input)}`;

        for (const a of newAnswers(before, s)) {
          // 1. never contradicts the typed words it came from
          checkAnswerConsistency(a);
          // Typed safety answers are only recorded via confirmation, a bare reply or an exact label.
          const option = optionFor(a);
          if (a.source === "typed" && option && (option.audio || option.asserts?.subject === "movement") && input.type === "text") {
            const lower = input.text.toLowerCase().replace(/[.!?]+$/, "");
            expect(lower === option.label.toLowerCase() || /^(yes|no|yeah|nope|yep|nah)[.!?]*$/i.test(input.text.trim()), `${label} recorded "${a.answer}" from free text`).toBe(true);
          }
          // 2. an identity correction never creates a playback fact
          if (input.type === "text" && /not the one i meant|wrong one|not the green button|i meant the/i.test(input.text) && a.questionId === "gb-current-song") {
            throw new Error(`${label}: identity correction recorded a playback answer`);
          }
        }
        // 3. history/hypothetical/denial alone never confirms an outage
        if (history.every((t) => !["current-confirmed"].includes(classifyBroadcast(t).status)) && !s.answers.some((a) => a.questionId === "hear-on-air")) {
          expect(s.confirmedOffAir, label).toBe(false);
        }
        // 4. urgency never goes away
        if (before.urgent) expect(s.urgent, `${label} cleared urgency`).toBe(true);
        if (before.confirmedOffAir) expect(s.confirmedOffAir, label).toBe(true);
        // 7. nonsense never produces facts or urgency
        if (input.type === "text" && FRAGMENTS.noise.some((n) => input.type === "text" && input.text.includes(n)) && !/[a-z]+,/.test(input.text)) {
          expect(newAnswers(before, s).filter((a) => a.source !== "button"), label).toEqual([]);
        }
      }
    }
  });

  it("5. damaged stored data never creates confirmed facts (random corruption of 300 sessions)", () => {
    const store = () => {
      const m = new Map<string, string>();
      return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    };
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed * 7919);
      // Build a real session…
      const events: SessionEvent[] = [];
      let s = createConversation();
      for (let i = 0; i < 6; i++) {
        const options = describeStep(s).options.filter((o) => o.id !== "restart");
        const input: UserInput = r() < 0.5 || options.length === 0 ? { type: "text", text: randomText(r) } : { type: "option", optionId: pick(r, options).id };
        s = respond(s, input, ctx).state;
        events.push({ input, selectedEquipmentId: null });
      }
      // …then corrupt it.
      const payload: Record<string, unknown> = { version: SESSION_VERSION, engineVersion: ENGINE_VERSION, lastActivityAt: 1_000, events: structuredClone(events), workspace: {} };
      const list = payload.events as Record<string, unknown>[];
      const mutation = Math.floor(r() * 7);
      const target = list[Math.floor(r() * list.length)] as { input: Record<string, unknown> };
      if (mutation === 0) target.input.optionId = pick(r, ["opt:no-silent", "opt:still", "confirm:yes", "opt:yes"]);
      if (mutation === 1) target.input.type = "option";
      if (mutation === 2) list.splice(Math.floor(r() * list.length), 0, { input: { type: "option", optionId: "opt:no-silent" }, selectedEquipmentId: null });
      if (mutation === 3) payload.conversation = { urgent: true, confirmedOffAir: true, answers: [{ answer: "No — there's silence" }] };
      if (mutation === 4) list.reverse();
      if (mutation === 5) (target as Record<string, unknown>).answer = "Yes, they move";
      if (mutation === 6) target.input.text = "x".repeat(600);
      const st = store();
      st.setItem(SESSION_KEY, JSON.stringify(payload));
      const result = loadSession(st, 2_000);
      if (result.status !== "restored") continue; // discarded: nothing used
      // Whatever survived is exactly what replaying genuine-looking inputs produces…
      expect(result.session.conversation).toEqual(replayEvents(result.session.events));
      // …so every answer is backed by a real input.
      const texts = result.session.events.flatMap((e) => (e.input.type === "text" ? [e.input.text] : []));
      for (const a of result.session.conversation.answers) {
        if (a.typedText) expect(texts, `seed ${seed}`).toContain(a.typedText);
        checkAnswerConsistency(a);
      }
    }
  });

  it("6. no generated instruction passes the AI guard, however it is disguised (500 cases)", () => {
    const verbs = ["restart", "reboot", "unplug", "power cycle", "switch off", "turn off", "press", "reset", "disconnect", "re-route"];
    const objects = ["Myriad", "the rack", "the desk", "the PC", "the transmitter link", "the green button"];
    const frames = ["{v} {o}.", "Try to {v} {o}.", "It may help to {v} {o}.", "You could {v} {o}, that usually works.", "I'd {v} {o} if I were you.", "First, {v} {o}."];
    const disguise = [
      (t: string) => t,
      (t: string) => t.toUpperCase(),
      (t: string) => t.replace(/([a-z])/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)), // fullwidth
      (t: string) => t.replace(/([aeo])/g, "$1​"), // zero-width
      (t: string) => t.replace(/e/g, "е"), // Cyrillic e
    ];
    const req = { message: "x", selectedEquipmentId: null, retrieved: { articles: [], interpretations: [] } };
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed * 104729);
      const text = pick(r, disguise)(pick(r, frames).replace("{v}", pick(r, verbs)).replace("{o}", pick(r, objects)));
      expect(containsOperationalInstruction(text), text).toBe(true);
      const out = guardModelProposal({ kind: "clarifying_question", text: `${text}?` }, req, { urgent: false, fixedReply: null });
      expect(out.text, text).not.toContain(text);
    }
  });
});
