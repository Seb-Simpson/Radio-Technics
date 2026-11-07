# RT-004 — AI troubleshooter architecture (plan, not built)

Radio Technics does **not** use an AI model today. Search is a local keyword engine (`src/lib/knowledge/search-engine.ts`, `isAI: false`) and the troubleshooter is scripted. This document fixes the boundaries a future language model must work inside. Nothing here calls a paid service.

## Principles
1. **The model proposes; deterministic code decides.** Model output is untrusted input.
2. **Safety runs without the model.** Broadcast interruptions (current or possible, via `classifyBroadcast` in `safety.ts`), "should I restart/unplug…?" and requests for a person are classified *before* any model call and answered from fixed text (`preModelSafety` in `src/lib/ai/contracts.ts`). If the AI service is slow or down, these paths behave exactly as now.
3. **Only real content.** The model may cite only articles the local retriever returned for this request; unknown or unretrieved IDs are dropped.
4. **Only validated commands.** Model-proposed UI changes are `WorkspaceCommand`s and must pass `validateWorkspaceCommands` (allow-listed type, real IDs). No new command types that touch equipment, run code or navigate to arbitrary URLs.
5. **No model prose at all (RT-002D-R1).** RT-QA-002D showed a word-list filter over model text let 37 of 42 new operational instructions through, so the filter was removed rather than extended. A model may return only identifiers: `{kind:"clarification", questionId}` (a locally written question), `{kind:"articles", articleIds}` (retrieved for this request), `{kind:"procedure", procedureId, procedureVersion}` or `{kind:"fallback", fallbackId}` (a locally written safe reply). Every word the presenter sees is rendered from local templates or approved knowledge-base content. Unknown kinds, unknown or inherited keys (`constructor`, `toString`, `__proto__`…), wrong types and non-plain objects are rejected before any field is read; the guard never throws. A procedure is used only if trusted data says it is an approved procedure, verified, with a valid approval record (meaningful reviewer and source, real past date), every section verified, applicable to the selected equipment, retrieved for this request, and at the exact proposed version. None exist yet. Manufacturer documentation never counts as approval.
6. **Honest labelling.** The UI shows "AI" only when `KnowledgeRetriever.isAI` is true, and still says the app has no live connection to the studio.
7. **Credentials stay on the server.** A Next.js route handler reads the provider key from an environment variable; no key, model name or prompt is shipped to the browser. Choosing and paying for a provider needs the owner's approval.

## Request flow
```
presenter text
  └─ preModelSafety(text)            ← deterministic (understand.ts)
       ├─ broadcast concern / procedure / person → fixed reply, no model call
       └─ otherwise
            ├─ localKnowledgeRetriever.search(text, selection)   ← real articles only
            ├─ POST /api/assistant  (server route, holds credentials)
            │     model receives: message, selected equipment ID, retrieved article text
            │     model returns : ModelProposal — identifiers only: clarification | articles | procedure | fallback
            └─ guardModelProposal(proposal, request, pre, trustedLookup)  ← deterministic
                  ├─ parseProposal: strict own-key schema (unknown kinds/fields → safe reply)
                  ├─ text = local template / article title / fixed reply — never model text
                  ├─ drop unretrieved/unknown articles; validateWorkspaceCommands
                  ├─ procedure → every approval condition checked; steps from the knowledge base only
                  └─ return GuardedReply { kind, text, articles, procedure, commands, rejected[] }
```
The scripted engine (`engine.ts`) stays as the fallback and keeps owning session state, observations and the support summary.

## What exists now (RT-003; redesigned RT-002D and RT-002D-R1)
- `src/lib/ai/contracts.ts` — `AssistantRequest`, `ModelProposal`, `parseProposal`, `preModelSafety`, `guardModelProposal`, `procedureProblems`, `procedureVersion`, `CLARIFICATION_QUESTIONS`, `FALLBACK_REPLIES`. Adversarial tests in `tests/unit/ai-contracts.test.ts` and `tests/unit/rt-qa-002c-corpus.test.ts` (prose in any field, hostile keys, exotic objects, every procedure condition, 500 random proposals).
- Limitation: a model can only choose among the locally written questions and replies, so its usefulness is limited until more are written (by people, reviewed like any content).

## Still to decide (owner / engineer)
- Provider, data-handling terms and cost; whether conversations may be logged for engineer review (with consent).
- Evaluation set: real presenter phrasings with expected safe outcomes, run before any model is enabled.
