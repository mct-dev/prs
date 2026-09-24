# Queued PR reviews

## Why

Today, every inline diff comment posts immediately as a single-comment review. GitHub's web UI lets you stage multiple comments under a single pending review, then submit them together with a verdict (Approve / Comment / Request changes). That's the dominant review workflow on the platform — ghui should support it.

## What we'd ship

1. **Per-comment choice in the diff comment modal** — when saving an inline comment, the user picks:
   - `enter` — comment immediately (current behaviour)
   - `shift+enter` — add to pending review
   The default can be remembered per-session.
2. **Visible pending state in the diff view**:
   - A pending count in the diff pane header ("`3 pending`").
   - Pending anchors marked distinctly in the diff gutter (e.g. a different color or a `▎` bar) so they're scannable.
   - A dedicated key (`shift+P`?) opens a "Pending review" pane that lists the queued comments — author / path:line / body preview, with shortcuts to navigate to each one in the diff.
3. **Submit / discard flow**:
   - The existing submit-review modal (`shift+R`) extends to show the pending count and the queued comments.
   - User picks Approve / Comment / Request changes + optional summary body, presses enter to submit.
   - A separate `shift+D` key (inside the pending pane) discards the entire draft.

## GitHub API mapping

GitHub keeps pending reviews server-side, scoped per-PR per-user. The API:

- `POST /repos/{owner}/{repo}/pulls/{n}/reviews` with `event: "PENDING"` (or just no `event`) creates a draft review — returns its id.
- `POST /repos/{owner}/{repo}/pulls/{n}/reviews/{review_id}/comments` adds a comment to that draft. Body shape matches `/pulls/{n}/comments` (path, line, side, body, optionally start_line/start_side).
- `POST /repos/{owner}/{repo}/pulls/{n}/reviews/{review_id}/events` with `event: APPROVE | REQUEST_CHANGES | COMMENT` and an optional `body` submits the review.
- `DELETE /repos/{owner}/{repo}/pulls/{n}/reviews/{review_id}` discards the pending review.
- `GET /repos/{owner}/{repo}/pulls/{n}/reviews?state=PENDING` (or filter `gh api …reviews | jq 'select(.state=="PENDING")'`) finds the existing draft so we can resume.

Because GitHub stores the draft, cross-session resume is free — open the same PR again and we just refetch the pending review and its comments.

## Architecture sketch

- New `GitHubService` methods:
  - `findPendingReview(repo, prNumber): Effect<{ id, comments } | null, GitHubError>`
  - `createPendingReview(repo, prNumber): Effect<{ id }, GitHubError>` (only when none exists)
  - `addPendingReviewComment(reviewId, input): Effect<PullRequestReviewComment, GitHubError>`
  - `submitPendingReview(reviewId, event, body?): Effect<void, GitHubError>`
  - `discardPendingReview(reviewId): Effect<void, GitHubError>`
- New atom: `pendingReviewByPrAtom: Record<prKey, { reviewId: string; comments: readonly PullRequestReviewComment[] } | null>` (keepAlive).
- On entering the diff view, if a pending review exists for this PR, hydrate the atom.
- `submitDiffComment` grows a `mode: "post" | "queue"` parameter:
  - `"post"` → existing path.
  - `"queue"` → ensure-pending-review-exists, then add the comment to it; insert into local pending list.
- Submit-review modal (existing) reads the pending list and includes it in the submission flow.

## Open questions

1. **Queue-by-default vs post-by-default.** The cost of "always queue" is that single drive-by comments require an extra step to submit. The cost of "always post" is the current state — no batching. Lean: keyboard distinguishes (`enter` vs `shift+enter`); session-level toggle for users who know they're doing a full review.
2. **What to call the pane.** "Pending review" matches GitHub's verbiage. "Queue" is shorter but ambiguous.
3. **Discard guardrails.** Discarding a pending review is destructive (loses all queued comments). Add a confirm modal.
4. **Local-only vs server-mirrored draft.** Server-mirrored is simpler (no offline drafting, no conflicts). Going with that.
5. **Order of comments.** GitHub doesn't specify order in the submitted review; comments are linked to file/line, so order in the queue is mostly bookkeeping.

## Out of scope (for v1)

- Editing a queued comment before submission (just delete + re-add).
- Suggestions blocks.
- Reviewing your own draft from another machine in the middle of writing — fine to handle as "refresh sees the server's state."
- Multi-reviewer queues (we only ever have one viewer's draft per PR per session).

## Status

Not started. Captured in `plans/queued-reviews.md`. Pick this up after the SQLite cache work.
