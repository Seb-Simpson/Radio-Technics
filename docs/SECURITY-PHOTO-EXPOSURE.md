# Residual exposure of the unredacted rack photograph (RT-QA-002B item 10)

**Status: NOT fully remediated.** The unredacted photograph is still reachable on GitHub through a pull-request ref. Rewriting the branches (RT-002B) did not remove it everywhere. Do not describe the history as clean until the steps below are done and re-verified.

The image contents are not reproduced here. Only object IDs are recorded.

## What was checked (2026-11-02, RT-002C)
| Item | Value |
| --- | --- |
| File | `public/studio/photos/equipment-rack.jpg` |
| Redacted blob (current `main`) | `758caff2122dfb548f2553198445b75d56bfc58c` |
| Unredacted blob | `a0580e461c653cdd22fa5cd1ffe4896c5767e8bb` |
| Commit that added it | `825f01b` "feat(studio): real studio photographs…" (pre-rewrite) |
| Repository visibility | **private** (confirmed through the GitHub integration) |

Every ref advertised by `git ls-remote origin` was fetched into a throw-away bare repository (since deleted) and searched for the unredacted blob:

| Remote ref | Points to | Contains the unredacted blob? |
| --- | --- | --- |
| `refs/heads/main` | `2ae5b26` | no |
| `refs/heads/claude/rt-001-foundation` | `282c10a` | no |
| `refs/heads/claude/rt-002-stabilisation` | `f18cdd0` | no |
| `refs/heads/claude/rt-002b-audit-fixes` | `b5957bc` | no |
| `refs/heads/claude/rt-003-knowledge-base` | `726a45a` | no |
| `refs/pull/1/head` | `282c10a` | no |
| **`refs/pull/2/head`** | **`a5773d5`** (pre-rewrite RT-002 head) | **yes** |
| `refs/pull/3/head` | `b5957bc` | no |
| `refs/pull/4/head`, `refs/pull/4/merge` | `726a45a`, `3b94820` | no |

`refs/pull/*` refs are read-only and are managed by GitHub. Repository owners can't delete or force-update them, so a rewrite can't remove them.

## Who can reach it
- Anyone with read access to this private repository: through PR #2's "Commits"/"Files changed" views, by fetching `refs/pull/2/head`, or by opening commit `a5773d5` or `825f01b` directly.
- **Vercel preview deployments (not verified).** PR #2 received a Vercel preview (`radio-technics-git-claude-rt-002-stabilisation-…vercel.app`, deployment created 2026-11-02 13:47 UTC, before the rewrite). Builds from pre-rewrite commits are likely to serve the unredacted file at `/studio/photos/equipment-rack.jpg`. Whether those builds are public depends on the project's Vercel Deployment Protection settings. The development environment can't reach `vercel.app`, so this was **not checked**, and the image was deliberately not requested.
- Any clone or fetch made before the rewrite.
- The development session's own container: the local clone still holds `refs/original/*` backup refs from the rewrite, and the scratchpad holds a pre-rewrite backup bundle. Both are temporary and are deleted when the container is reclaimed. Removing them earlier was not permitted in this session; the owner can authorise it.

## What the owner needs to do
1. **GitHub Support.** Open a request at https://support.github.com/request (category: removing sensitive data). Include:
   - repository `Seb-Simpson/Radio-Technics` (private);
   - the file path and unredacted blob `a0580e461c653cdd22fa5cd1ffe4896c5767e8bb`;
   - the commits that reference it: `825f01b` (added) and `a5773d5` (head of `refs/pull/2/head`);
   - the affected pull request, **#2**, and a request to dereference or remove its head ref and purge cached views and unreachable objects (garbage collection);
   - confirmation that all branches have already been rewritten and force-pushed (RT-002B).

   GitHub's guide: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
2. **Vercel.** In the project's Deployments list, delete every deployment built from a commit before the rewrite (all deployments from 2026-11-02 earlier than the RT-002B force push), or at least those for `claude/rt-002-stabilisation` and PR #2. Confirm that Deployment Protection (Vercel Authentication) is enabled for preview deployments.
3. **Clones.** Anyone who cloned before the rewrite should delete the clone and clone again.
4. **Re-verify.** Run `git ls-remote origin` and check that `refs/pull/2/head` is gone or no longer reaches blob `a0580e4…`. The check above can be repeated in a throw-away bare repository: fetch every ref, then test each ref's history for the blob.

## What this branch does not change
No history was rewritten in RT-002C, and PR #4 was left untouched.
