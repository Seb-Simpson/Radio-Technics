# RT-004 — AI troubleshooter architecture (plan, not built)

Radio Technics does **not** use an AI model today. Search is a local keyword engine (`src/lib/knowledge/search-engine.ts`, `isAI: false`) and the troubleshooter is scripted. This document fixes the boundaries a future language model must work inside. Nothing here calls a paid service.

## Principles
1. **The model proposes; deterministic code decides.** Model output is untrusted input.
2. **Safety runs without the model.** Broadcast interruptions (current or possible, via `classifyBroadcast` in `safety.ts`), "should I restart/unplug…?" and requests for a person are classified *before* any model call and answered from fixed text (`preModelSafety` in `src/lib/ai/contracts.ts`). If the AI service is slow or down, these paths behave exactly as now.
3. **Only real content.** The model may cite only articles the local retriever returned for this request; unknown or unretrieved IDs are dropped.
4. **Only validated commands.** Model-proposed UI changes are `WorkspaceCommand`s and must pass `validateWorkspaceCommands` (allow-listed type, real IDs). No new command types that touch equipment, run code or navigate to arbitrary URLs.
5. **No unverified instructions — and no self-authorisation (RT-002D).** A model may return only `clarifying_question`, `article_suggestion` or `approved_procedure`. There is no "this is safe" flag; any unexpected field (e.g. `givesInstructions: false`) rejects the whole proposal. Model text is folded (Unicode compatibility forms, invisible characters, look-alike letters, spaced-out spellings) and rejected if it contains any operational instruction, however hedged. Procedure steps are **never** model text: an `approved_procedure` names an article ID, and the steps are rendered from the knowledge base only if trusted application data marks that article `approved-procedure`, `verified`, with a `review` record and every section verified. None exist yet, so every procedure reference currently fails. Manufacturer documentation never counts as approval.
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
            │     model returns : ModelProposal — clarifying_question | article_suggestion | approved_procedure
            └─ guardModelProposal(proposal, request, pre, trustedLookup)  ← deterministic
                  ├─ strict schema (unknown kinds/fields → safe reply)
                  ├─ reject operational instructions in model text (after folding disguises)
                  ├─ drop unretrieved/unknown articles; validateWorkspaceCommands
                  ├─ approved_procedure → steps rendered from trusted knowledge-base data only
                  └─ return GuardedReply { kind, text, articles, procedure, commands, rejected[] }
```
The scripted engine (`engine.ts`) stays as the fallback and keeps owning session state, observations and the support summary.

## What exists now (RT-003, redesigned RT-002D)
- `src/lib/ai/contracts.ts` — `AssistantRequest`, `ModelProposal`, `preModelSafety`, `guardModelProposal`, `containsOperationalInstruction`, `isApprovedProcedure`. Adversarial tests in `tests/unit/ai-contracts.test.ts` and `tests/unit/rt-qa-002c-corpus.test.ts` (false safety declarations, disguised instructions, invented/unapproved procedures, 500 generated disguises).
- Limitation: the instruction detector is deliberately strict, so a harmless clarifying question that mentions an operating verb ("Did you press the green button?") is replaced with a neutral question. That trade-off favours safety.
- `KnowledgeRetriever` interface in `search-engine.ts`; an LLM-backed retriever must return the same `SearchResponse` shape.

## Still to decide (owner / engineer)
- Provider, data-handling terms and cost; whether conversations may be logged for engineer review (with consent).
- Evaluation set: real presenter phrasings with expected safe outcomes, run before any model is enabled.
