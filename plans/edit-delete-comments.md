# Edit / delete comments

## Why

Today the comments view is read + reply-only. Once a comment is posted, it can't be revised or removed without leaving ghui. Editing typos, fixing markdown that didn't render right, or deleting an accidental drive-by are all common after-the-fact actions and the missing affordance is felt immediately.

## What we'd ship

1. **Edit own comment** — `e` on a selected comment that the viewer authored opens the comment editor pre-filled with the existing body. Submit replaces the body in place.
   - Top-level (issue) comments: `PATCH /repos/{owner}/{repo}/issues/comments/{id}` with `{ body }`.
   - Review thread comments: `PATCH /repos/{owner}/{repo}/pulls/comments/{id}` with `{ body }`.
   - Disabled with a flash hint when the selected comment isn't the viewer's.
2. **Delete own comment** — `x` opens a confirm modal ("Delete comment? `[y]es` / `[esc]` cancel"); on confirm:
   - Top-level: `DELETE /repos/{owner}/{repo}/issues/comments/{id}`.
   - Review thread: `DELETE /repos/{owner}/{repo}/pulls/comments/{id}`.
   - Optimistic remove from the local cache; restore on error.
3. **Visible authorship cue** — already shown via author name; nothing extra needed for v1, but consider a subtle `(you)` glyph next to the viewer's own author label so the edit/delete affordance feels obvious.

## GitHub API mapping

| Action | Endpoint |
|---|---|
| Edit issue comment | `PATCH /repos/{r}/issues/comments/{id}` |
| Delete issue comment | `DELETE /repos/{r}/issues/comments/{id}` |
| Edit review-thread comment | `PATCH /repos/{r}/pulls/comments/{id}` |
| Delete review-thread comment | `DELETE /repos/{r}/pulls/comments/{id}` |

The `{id}` here is the REST integer id — same one the new `restCommentId` extractor returns.

Permission gating: GitHub returns 403 for edit/delete of others' comments unless the viewer has repo write. We could fetch `viewerCanUpdate` / `viewerCanDelete` per-comment via GraphQL but that doubles the query cost; instead, gate locally on `comment.author === viewerLogin` (which we already track) and let GitHub be the second line of defence.

## Architecture sketch

- New `GitHubService` methods:
  - `editPullRequestIssueComment(repo, commentId, body): Effect<PullRequestComment, GitHubError>`
  - `editReviewComment(repo, commentId, body): Effect<PullRequestComment, GitHubError>`
  - `deletePullRequestIssueComment(repo, commentId): Effect<void, CommandError>`
  - `deleteReviewComment(repo, commentId): Effect<void, CommandError>`
- Atoms wrap each.
- `CommentModalTarget` grows an `"edit"` variant: `{ kind: "edit"; commentId: string; commentTag: "comment" | "review-comment" }`.
  - Open modal with body pre-filled, target = edit.
  - Submit dispatches to `editPullRequestIssueComment` or `editReviewComment` based on `commentTag`.
- New `DeleteCommentModal` (or reuse the existing `CloseModal` shape) for the confirm. Modal carries `{ commentId, commentTag }`. Submit calls the right delete and removes from cache.
- Keymap additions in `commentsView.ts`:
  - `e` → edit selected (gated on `selectedOrderedComment.author === viewer && !isPlaceholder`).
  - `x` → delete selected (same gate). Mirrors the existing `x` "destroy thing under cursor" key in detail/list views (close PR), which also routes through a confirm modal.
- `openReplyToSelectedComment` already uses `selectedOrderedComment`; the edit/delete handlers use the same lookup.

## Optimistic + revert

- **Edit**: replace the comment in the cache with the new body immediately; on success, replace again with the server-returned object (so updated_at and any normalization land); on failure, restore the previous version. Track the previous body so we can revert.
- **Delete**: filter out of the cache immediately; on failure, splice back at its original index. Track the original index for restoration.

## Open questions

1. Do we want **markdown preview** of the editor body? Probably not for v1 — the existing comment editor is a plain-text one and consistency wins.
2. Should `e` also work on the user's own optimistic comments that haven't synced yet (id starts with `local:`)? Probably not — they're transient. Disable with a flash.
3. Should deleting a comment that has nested replies (review thread root) be blocked? GitHub's API allows it (orphans the replies). We'll mirror.
4. **Undo window?** Skip — confirm modal is the only safety net.

## Out of scope (for v1)

- Edit history / who-changed-what.
- Bulk delete.
- Editing review summary comments (the body of a review event itself, not its inline comments).

## Status

Shipped. `e` edits a viewer-authored synced comment in place; `x` opens a confirm modal that deletes it. Both flows are optimistic with a same-index restore on failure. Diff-thread cache and the per-PR comments cache are kept in sync.

Out-of-scope items from v1 (markdown preview, edits on optimistic `local:` comments, blocking deletes of thread roots, edit history, bulk delete, editing review summary bodies) remain as written above and are not tracked in this plan after shipping.
