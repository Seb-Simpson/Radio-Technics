# RT-004 — AI troubleshooter architecture (plan, not built)

Radio Technics does **not** use an AI model today. Search is a local keyword engine (`src/lib/knowledge/search-engine.ts`, `isAI: false`) and the troubleshooter is scripted. This document fixes the boundaries a future language model must work inside. Nothing here calls a paid service.

## Principles
1. **The model proposes; deterministic code decides.** Model output is untrusted input.
2. **Safety runs without the model.** Silence on air and "should I restart/unplug…?" are classified by `understand()` *before* any model call and answered from fixed text (`preModelSafety` in `src/lib/ai/contracts.ts`). If the AI service is slow or down, these paths behave exactly as now.
3. **Only real content.** The model may cite only articles the local retriever returned for this request; unknown or unretrieved IDs are dropped.
4. **Only validated commands.** Model-proposed UI changes are `WorkspaceCommand`s and must pass `validateWorkspaceCommands` (allow-listed type, real IDs). No new command types that touch equipment, run code or navigate to arbitrary URLs.
5. **No unverified instructions.** A reply that tells the presenter to operate equipment is replaced with the safe "no approved instructions" reply unless it cites an article with `kind: "approved-procedure"`, `status: "verified"` and a `review` record. If the model doesn't say whether it is instructing, it is treated as instructing. Manufacturer documentation never counts as approval.
6. **Honest labelling.** The UI shows "AI" only when `KnowledgeRetriever.isAI` is true, and still says the app has no live connection to the studio.
7. **Credentials stay on the server.** A Next.js route handler reads the provider key from an environment variable; no key, model name or prompt is shipped to the browser. Choosing and paying for a provider needs the owner's approval.

## Request flow
```
presenter text
  └─ preModelSafety(text)            ← deterministic (understand.ts)
       ├─ urgent / procedure → fixed reply, no model call
       └─ otherwise
            ├─ localKnowledgeRetriever.search(text, selection)   ← real articles only
            ├─ POST /api/assistant  (server route, holds credentials)
            │     model receives: message, selected equipment ID, retrieved article text
            │     model returns : ModelProposal { reply, citedArticleIds, commands, givesInstructions }
            └─ guardModelProposal(proposal, request, pre)  ← deterministic
                  ├─ drop unretrieved/unknown citations
                  ├─ validateWorkspaceCommands
                  ├─ replace unapproved instructions with PROCEDURE_REPLY
                  └─ return GuardedReply { reply, citedArticles, commands, rejected[] }
```
The scripted engine (`engine.ts`) stays as the fallback and keeps owning session state, observations and the support summary.

## What exists now (RT-003)
- `src/lib/ai/contracts.ts` — `AssistantRequest`, `ModelProposal`, `preModelSafety`, `guardModelProposal`, tested in `tests/unit/ai-contracts.test.ts` (urgent bypass, restart questions, invented commands and citations rejected, unapproved instructions replaced, malformed output never throws).
- `KnowledgeRetriever` interface in `search-engine.ts`; an LLM-backed retriever must return the same `SearchResponse` shape.

## Still to decide (owner / engineer)
- Provider, data-handling terms and cost; whether conversations may be logged for engineer review (with consent).
- Evaluation set: real presenter phrasings with expected safe outcomes, run before any model is enabled.
