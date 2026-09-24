# Diff Rendering And Highlighting

## Why

Large PR diffs currently mount every file's `<diff>` renderable in `PullRequestDiffPane`. That keeps the implementation small, but it makes startup, scrolling, and layout toggles scale with total patch size instead of the visible viewport.

We looked at hunk, which solves a similar terminal diff problem elegantly. The useful idea is not to copy the whole system at once, but to borrow the architecture: parse once into a semantic row model, measure geometry separately from rendering, window offscreen sections, and eventually own enough rendering to support both syntax highlighting and intra-line word-diff highlighting.

## What We'd Ship

- Keep PR diff scrolling responsive when a PR has many files or very long patches.
- Preserve sticky file headers, comment-line selection, split/unified view, whitespace filtering, and wrap behavior.
- Add syntax highlighting that remains consistent across unified and split layouts.
- Add word-diff highlighting for changed spans inside modified lines, layered on top of syntax highlighting.
- Render only visible and near-visible file sections while preserving total scroll height with placeholders.
- Precompute enough section geometry to keep keyboard/comment navigation deterministic even when offscreen files are not mounted.
- Defer or prefetch expensive highlighting around the active viewport instead of blocking initial paint for the full diff.

## API / Architecture Mapping

- `src/ui/diff.ts`: evolve raw patch helpers into a semantic diff model that can represent files, hunks, unified rows, split rows, line numbers, and word-level changed spans.
- `src/ui/diff.ts`: keep the current patch splitting and whitespace minimization path until a replacement parser proves it preserves GitHub patch behavior and comment anchors.
- `src/ui/diff.ts`: move render-height and comment-anchor calculations onto the same row model used for rendering so selection, scrolling, and comments cannot drift from visuals.
- `src/ui/PullRequestDiffPane.tsx`: replace all-files rendering with visible-section rendering plus placeholder rows that match measured file heights.
- `src/ui/PullRequestDiffPane.tsx`: derive sticky-header ownership from file-section geometry with binary search instead of mounted renderable positions.
- `src/ui/PullRequestDiffPane.tsx`: build a viewport halo from scroll top/height and render only intersecting file sections plus selected/adjacent sections.
- New diff row renderer: render terminal spans directly when we need syntax and word-diff highlighting that OpenTUI `<diff>` cannot expose.
- New highlight cache: key by file content, theme, language, view mode, and whitespace mode; dedupe in-flight work and prefetch selected/near-visible files.

## Open Questions

- Can OpenTUI `<diff>` support word-level changed-span highlighting, or do we need a custom renderer for that feature?
- Should the first implementation replace only unified mode, or should unified and split move together to avoid duplicated behavior?
- Does ghui need true hunk-level row modeling immediately, or is file-level windowing enough before custom highlighting lands?
- Which parser/highlighter stack should provide the semantic row model, syntax tokens, and word-diff spans?
- How should comment-thread preview and click-to-comment selection behave when the selected anchor belongs to an offscreen placeholder file?

## Out Of Scope (For V1)

- Replacing ghui's diff parser before proving comment-anchor and whitespace-filter behavior match the current implementation.
- Rewriting every diff view at once without an incremental fallback to the current OpenTUI `<diff>` path.
- Inline PR comment authoring inside the diff body.
- Full hunk collapsing/expansion UI.

## Status

Not started. Prior-art exploration complete; implementation should start with the semantic row model and file-section geometry, then use that foundation for viewport windowing and syntax-plus-word-diff highlighting.
