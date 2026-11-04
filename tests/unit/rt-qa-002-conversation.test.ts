/**
 * RT-QA-002 Priority 1 regressions: question-aware interpretation,
 * urgency independent of routing, and human-support recognition.
 * Includes alternative phrasings not present in the audit report.
 */
import { describe, expect, it } from "vitest";
import { flowNodes } from "@/data/troubleshooting-flows";
import { buildSupportSummary, createConversation, describeStep, respond } from "@/lib/troubleshooter/engine";
import type { ConversationState } from "@/lib/troubleshooter/types";
import { understand } from "@/lib/troubleshooter/understand";

const ctx = { selectedEquipmentId: null };
const type = (s: ConversationState, text: string) => respond(s, { type: "text", text }, ctx).state;
const press = (s: ConversationState, optionId: string) => respond(s, { type: "option", optionId }, ctx).state;
const at = (s: ConversationState) => (s.step.kind === "node" ? s.step.nodeId : s.step.kind);
const answersTo = (s: ConversationState, question: string) => s.answers.filter((a) => a.question === question);

/** Put the conversation on a given flow node, as if the user had navigated there. */
function onNode(nodeId: string): ConversationState {
  const base = type(createConversation(), "The green thing isn't working");
  const confirmed = press(base, "confirm:yes");
  return { ...confirmed, step: { kind: "node", nodeId } };
}
const prompt = (nodeId: string) => describeStep(onNode(nodeId)).prompt;

describe("1. question-aware answers", () => {
  it.each([
    // Audit phrases
    ["gb-current-song", "No, there is no sound", "No — there's silence"],
    ["gb-current-song", "No, nothing is playing", "No — there's silence"],
    ["gb-current-song", "Yes, no, sorry it is not playing", "No — there's silence"],
    // Alternative phrasings
    ["gb-current-song", "yes it is. actually no, it stopped", "No — there's silence"],
    ["gb-current-song", "There's nothing coming out", "No — there's silence"],
    ["gb-current-song", "It's not playing any more", "No — there's silence"],
    ["gb-current-song", "No wait, sorry, yes it is still playing", "Yes, it's still playing"],
    ["gb-current-song", "Yep, still playing", "Yes, it's still playing"],
    ["gb-current-song", "No, it's no longer playing", "No — there's silence"],
    ["hear-headphones", "No, there is no sound", "Nothing at all"],
    ["hear-headphones", "I can hear some things", "Some sounds, but not everything"],
    ["hear-on-air", "Yes, it's gone quiet", "Yes, it might be silent"],
    ["hear-on-air", "No, there's sound, but the mic is missing", "No, there is sound but something is missing"],
    ["mic-headphones", "Nope, I can't hear anything", "No, I can't hear anything"],
  ])("on %s: %j → %s", (nodeId, text, expected) => {
    // RT-002D: these are safety-relevant questions, so the typed reply is
    // interpreted and PROPOSED, never recorded until the presenter confirms it.
    const s = type(onNode(nodeId), text);
    expect(answersTo(s, prompt(nodeId))).toEqual([]);
    expect(s.step).toMatchObject({ kind: "check", nodeId });
    const proposed = describeStep(s).options[0]!;
    expect(proposed.label).toBe(expected);
    const confirmed = press(s, proposed.id);
    const recorded = answersTo(confirmed, prompt(nodeId));
    expect(recorded.map((a) => a.answer)).toEqual([expected]);
    expect(recorded[0]).toMatchObject({ source: "confirmed-interpretation", typedText: text });
  });

  it.each([
    // The yes/no and the observation disagree for this question.
    ["hear-on-air", "No, there is no sound"],
    ["hear-on-air", "No, nothing is playing"],
    ["gb-current-song", "Yes, but there's no sound"],
    ["gb-current-song", "Yes it's not playing"],
    ["hear-headphones", "Yes, no sound though"],
    // Yes and no without a correction.
    ["gb-current-song", "Yes, no"],
    ["gb-find-screen", "yes and no"],
    // Sound both present and absent.
    ["gb-current-song", "It's playing but it's silent"],
  ])("on %s: %j asks for clarification and records nothing", (nodeId, text) => {
    const before = onNode(nodeId);
    const s = type(before, text);
    expect(answersTo(s, prompt(nodeId))).toEqual([]);
    expect(s.observations.at(-1)?.text).toBe(text);
    const lastAssistant = [...s.messages].reverse().find((m) => m.role === "assistant")!.text;
    expect(lastAssistant).toMatch(/\?/); // a question is being asked again
  });

  it("never records a confirmed answer that contradicts the user's observation (all sound questions)", () => {
    const absentReplies = ["no sound", "yes, there's no sound", "no, nothing's playing", "yes it is silent", "it stopped", "yes. sorry, it's not playing", "nothing is coming out"];
    const presentReplies = ["it's playing", "yes it's still playing", "no, it's not silent", "there is sound", "no, I can hear it", "it's coming through"];
    const soundNodes = flowNodes.filter((n) => n.kind === "question" && n.options.some((o) => o.audio));
    expect(soundNodes.length).toBeGreaterThanOrEqual(5);
    for (const node of soundNodes) {
      for (const [replies, forbidden] of [
        [absentReplies, "present"],
        [presentReplies, "absent"],
      ] as const) {
        for (const reply of replies) {
          const s = type(onNode(node.id), reply);
          for (const a of answersTo(s, prompt(node.id))) {
            const option = node.options.find((o) => o.label === a.answer);
            expect(option?.audio, `${node.id} ← ${JSON.stringify(reply)} recorded "${a.answer}"`).not.toBe(forbidden);
          }
        }
      }
    }
  });

  it.each([
    ["Yes, no, sorry it is not playing", "none", "absent", true],
    ["yes. actually no", "negate", null, true],
    ["No — I mean yes", "affirm", null, true],
    ["Yes, no", "conflict", null, false],
    ["No, there is no sound", "negate", "absent", false],
    ["no sound at all", "none", "absent", false],
    ["It's not silent", "none", "present", false],
    ["Well, um, no", "negate", null, false],
  ])("understand(%j): stance %s, audio %s, corrected %s", (text, stance, audio, corrected) => {
    const u = understand(text);
    expect(u.stance).toBe(stance);
    expect(u.audio).toBe(audio);
    expect(u.corrected).toBe(corrected);
  });

  it("confirmation questions handle self-correction and conflict", () => {
    const start = type(createConversation(), "The green thing isn't working");
    expect(type(start, "Yes — sorry, no, it's something else").step).toMatchObject({ kind: "choose" });
    expect(type(start, "no, actually yes").step).toMatchObject({ kind: "node", nodeId: "gb-screen" });
    const conflicted = type(start, "yes no");
    expect(conflicted.step).toEqual(start.step);
    expect(conflicted.answers).toEqual(start.answers);
  });
});

describe("2. urgency is classified before routing and stays attached", () => {
  it("an answer that reports clear off-air silence goes straight to the urgent state", () => {
    const s = type(onNode("hear-on-air"), "Yes, nothing is going out");
    expect(at(s)).toBe("outcome-urgent");
    expect(s.urgent).toBe(true);
  });

  it.each([
    "Can someone help me? We're off air.",
    "Should I restart the computer? We're off air.",
    "Get an engineer, we're off air",
    "help! dead air",
    "Is it OK to reboot the PC? Nothing is going out.",
    "I need a human, the station is silent",
  ])("%j → urgent state", (text) => {
    const s = type(onNode("gb-screen"), text);
    expect(s.urgent).toBe(true);
    expect(at(s)).toBe("outcome-urgent");
    expect(describeStep(s).urgent).toBe(true);
    expect(buildSupportSummary(s)).toMatch(/^URGENT: silence on air reported$/m);
  });

  it("the procedure question in an urgent message is still answered safely", () => {
    const s = type(onNode("gb-screen"), "Should I restart the computer? We're off air.");
    expect(s.messages.some((m) => /don't restart, unplug or reset/.test(m.text))).toBe(true);
    expect(describeStep(s).prompt).not.toMatch(/\brestart the\b|\bpress the\b/i);
  });

  it("urgency survives later support requests and corrections", () => {
    let s = type(onNode("gb-screen"), "we're off air");
    s = type(s, "Can I speak to a person?");
    expect(s.step.kind).toBe("support");
    expect(s.urgent).toBe(true);
    expect(describeStep(s).urgent).toBe(true);
    expect(describeStep(s).prompt).toMatch(/^This is urgent/);
    s = type(s, "sorry, we're back on air now");
    expect(s.urgent).toBe(true);
    expect(buildSupportSummary(s)).toContain("“sorry, we're back on air now”");
  });

  it("possible silence is kept, distinguished from confirmed silence, and clarified", () => {
    let s = type(onNode("gb-screen"), "Can someone help? It's gone silent");
    expect(s.step.kind).toBe("support");
    expect(s.urgent).toBe(false);
    expect(s.possibleSilence).toBe(true);
    expect(buildSupportSummary(s)).toMatch(/Possible silence reported \(not confirmed\)/);

    s = type(onNode("gb-screen"), "Should I restart it? Nothing is playing");
    expect(at(s)).toBe("hear-on-air");
    expect(s.possibleSilence).toBe(true);
    expect(s.messages.some((m) => /don't restart, unplug or reset/.test(m.text))).toBe(true);
  });

  it("'we're not off air' is not an emergency", () => {
    const s = type(onNode("gb-screen"), "We're not off air, the button just does nothing");
    expect(s.urgent).toBe(false);
  });
});

describe("3. human-support recognition", () => {
  it.each([
    "I need a human.",
    "Can I get a person?",
    "Can someone help me?",
    "I need to speak to the engineer.",
    "Please get technical support.",
    "I'd like to talk to a person",
    "Could somebody come and help?",
    "Is there anyone who can help?",
    "Fetch the engineer please",
    "Can I speak with technical support?",
    "help!",
    "Get me a technician",
  ])("%j → support", (text) => {
    expect(understand(text).helpRequest).toBe(true);
    expect(type(onNode("gb-screen"), text).step.kind).toBe("support");
  });

  it.each([
    "The engineer fixed the desk last week",
    "Our engineer is called Dave",
    "I don't need an engineer",
    "No need to call anyone, it's working",
    "Can you help me find the microphone?",
    "The mic stand is the support for it",
  ])("%j is not a request for a person", (text) => {
    expect(understand(text).helpRequest).toBe(false);
  });

  it("support stays honest about missing contact details", () => {
    const s = type(onNode("gb-screen"), "I need a human");
    expect(describeStep(s).prompt).toMatch(/have not been configured/);
    expect(describeStep(s).prompt).not.toMatch(/\d{3}/);
  });
});
