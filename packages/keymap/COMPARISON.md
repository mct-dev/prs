# Real-app comparison: ghui

Side-by-side translations of actual ghui keyboard layers from `src/App.tsx`
into the `@ghui/keymap` API. Code on the left is *what's shipping today*
(`@opentui/keymap` + a custom `useScopedBindings` wrapper). Code on the right
is the same behavior re-expressed against `@ghui/keymap`.

---

## 1. CloseModal — the smallest case

**Today** (`src/App.tsx`, 11 lines including the local helpers it depends on):

```tsx
// Inside the App component, intermixed with ~80 useState/useAtom hooks
// and references to component-scope `closeActiveModal` + `confirmClosePullRequest`:

useScopedBindings({
  when: closeModalActive,
  bindings: {
    escape: closeActiveModal,
    return: confirmClosePullRequest,
  },
})
```

**With `@ghui/keymap`**:

```ts
// src/keymap/closeModal.ts — separate file, importable, testable
import { command, Keymap } from "@ghui/keymap"

export interface CloseModalCtx {
  readonly closeModal: () => void
  readonly confirmClose: () => void
}

export const closeModalKeymap: Keymap<CloseModalCtx> = Keymap.union(
  command({ id: "modal.cancel",  title: "Cancel",                keys: ["escape"], run: (s) => s.closeModal() }),
  command({ id: "modal.confirm", title: "Close pull request",   keys: ["return"], run: (s) => s.confirmClose() }),
)
```

**Diff in shape:**

| | Today | With `@ghui/keymap` |
|---|---|---|
| Where the bindings live | Inside `App` component body | Importable module, top-level |
| What state they see | All of `App`'s closure | Just `CloseModalCtx` |
| Test without React | No (hook needs mounting) | Yes (just call `pureDispatch`) |
| Importable into a palette | No | Yes (`closeModalKeymap.commands(ctx)`) |

---

## 2. MergeModal — selection state

**Today** (12 lines):

```tsx
const moveMergeSelection = (delta: -1 | 1) => setMergeModal((current) => {
  const max = Math.max(0, availableMergeActions(mergeModal.info).length - 1)
  return { ...current, selectedIndex: Math.max(0, Math.min(max, current.selectedIndex + delta)) }
})
useScopedBindings({
  when: mergeModalActive,
  bindings: {
    escape: closeActiveModal,
    return: () => {
      if (availableMergeActions(mergeModal.info).length > 0) confirmMergeAction()
    },
    up: () => moveMergeSelection(-1),
    k:  () => moveMergeSelection(-1),
    down: () => moveMergeSelection(1),
    j:    () => moveMergeSelection(1),
  },
})
```

**With `@ghui/keymap`**:

```ts
// src/keymap/mergeModal.ts
import { command, Keymap } from "@ghui/keymap"

export interface MergeModalCtx {
  readonly availableActionCount: number
  readonly closeModal: () => void
  readonly confirmMerge: () => void
  readonly moveSelection: (delta: -1 | 1) => void
}

export const mergeModalKeymap: Keymap<MergeModalCtx> = Keymap.union(
  command({ id: "merge.cancel",  title: "Cancel",  keys: ["escape"], run: (s) => s.closeModal() }),
  command({
    id: "merge.confirm",
    title: "Merge",
    keys: ["return"],
    enabled: (s) => s.availableActionCount > 0 ? true : "No merge actions available.",
    run: (s) => s.confirmMerge(),
  }),
  command({ id: "merge.up",   title: "Up",   keys: ["k", "up"],   run: (s) => s.moveSelection(-1) }),
  command({ id: "merge.down", title: "Down", keys: ["j", "down"], run: (s) => s.moveSelection(1) }),
)
```

The "if there are no actions, don't fire" branch becomes a typed `enabled` —
the dispatcher reports `disabled` with reason instead of silently no-oping.

---

## 3. diffFullView with sub-mode — where composition shines

This is where today's design starts hurting. `diffFullView` has *two modes*:
regular scroll mode and `diffCommentMode`. Today they're two flat layers with
mutually-exclusive `when` predicates that both reach into App's closure:

**Today** (~80 lines for both modes, inline in App.tsx):

```tsx
useScopedBindings({
  when: diffFullView && !diffCommentMode,
  bindings: {
    ...scrollBindings(scrollDiffBy, halfPage, scrollDiffTo),
    escape: "diff.close",
    return: "diff.close",
    c: "diff.comment-mode",
    v: "diff.toggle-view",
    w: "diff.toggle-wrap",
    r: "diff.reload",
    "]": "diff.next-file", right: "diff.next-file", l: "diff.next-file",
    "[": "diff.previous-file", left: "diff.previous-file", h: "diff.previous-file",
    o: "pull.open-browser",
  },
})

useScopedBindings({
  when: diffFullView && diffCommentMode,
  bindings: {
    escape: () => setDiffCommentMode(false),
    c: "diff.comment-mode",
    return: () => {
      if (selectedDiffCommentThread.length > 0) openDiffCommentThreadModal()
      else openDiffCommentModal()
    },
    a: "diff.add-comment",
    pageup: () => moveDiffCommentAnchor(-halfPage),
    "ctrl+u": () => moveDiffCommentAnchor(-halfPage),
    pagedown: () => moveDiffCommentAnchor(halfPage),
    // ... 20 more lines ...
  },
})
```

Both layers reference component-local helpers (`scrollDiffBy`,
`moveDiffCommentAnchor`, `openDiffCommentThreadModal`). Both are gated by
inline boolean expressions. The relationship between the two modes is
implicit — you have to know to read both `when` conditions.

**With `@ghui/keymap`**:

```ts
// src/keymap/diff.ts — defined over the diff's own state shape
import { command, Keymap, scrollCommands } from "@ghui/keymap"

export interface DiffCtx {
  readonly hasOpenPullRequest: boolean
  readonly halfPage: number
  readonly scrollBy: (delta: number) => void
  readonly scrollTo: (line: number) => void
  readonly closeDiff: () => void
  readonly enterCommentMode: () => void
  readonly toggleView: () => void
  readonly toggleWrap: () => void
  readonly reload: () => void
  readonly nextFile: () => void
  readonly previousFile: () => void
  readonly openInBrowser: () => void
}

export const diffViewKeymap: Keymap<DiffCtx> = Keymap.union(
  scrollCommands<DiffCtx>((s) => s.scrollBy, (s) => s.scrollTo, (s) => s.halfPage),
  command({ id: "diff.close",         title: "Close",        keys: ["escape", "return"], run: (s) => s.closeDiff() }),
  command({ id: "diff.comment-mode",  title: "Comment mode", keys: ["c"],                run: (s) => s.enterCommentMode() }),
  command({ id: "diff.toggle-view",   title: "Toggle view",  keys: ["v"],                run: (s) => s.toggleView() }),
  command({ id: "diff.toggle-wrap",   title: "Toggle wrap",  keys: ["w"],                run: (s) => s.toggleWrap() }),
  command({ id: "diff.reload",        title: "Reload",       keys: ["r"],                run: (s) => s.reload() }),
  command({ id: "diff.next-file",     title: "Next file",    keys: ["]", "right", "l"],  run: (s) => s.nextFile() }),
  command({ id: "diff.previous-file", title: "Prev file",    keys: ["[", "left",  "h"],  run: (s) => s.previousFile() }),
  command({ id: "diff.open-browser",  title: "Open",         keys: ["o"],                run: (s) => s.openInBrowser() }),
)


// src/keymap/diffComment.ts — the sub-mode's OWN keymap, OWN context
import { command, Keymap } from "@ghui/keymap"

export interface DiffCommentCtx {
  readonly halfPage: number
  readonly hasThread: boolean
  readonly exitCommentMode: () => void
  readonly toggleCommentMode: () => void
  readonly openInlineModal: () => void
  readonly openThreadModal: () => void
  readonly addComment: () => void
  readonly moveAnchor: (delta: number) => void
  readonly selectSide: (side: "LEFT" | "RIGHT") => void
  readonly nextFile: () => void
  readonly previousFile: () => void
}

export const diffCommentKeymap: Keymap<DiffCommentCtx> = Keymap.union(
  command({ id: "diff-comment.exit",         title: "Exit comment mode", keys: ["escape"],                       run: (s) => s.exitCommentMode() }),
  command({ id: "diff-comment.toggle",       title: "Toggle",            keys: ["c"],                            run: (s) => s.toggleCommentMode() }),
  command({
    id: "diff-comment.open",
    title: "Open / reply",
    keys: ["return"],
    run: (s) => s.hasThread ? s.openThreadModal() : s.openInlineModal(),
  }),
  command({ id: "diff-comment.add",          title: "Add comment",       keys: ["a"],                            run: (s) => s.addComment() }),
  command({ id: "diff-comment.up",           title: "Up",                keys: ["k", "up"],                      run: (s) => s.moveAnchor(-1) }),
  command({ id: "diff-comment.down",         title: "Down",              keys: ["j", "down"],                    run: (s) => s.moveAnchor(1) }),
  command({ id: "diff-comment.jump-up",      title: "Jump up",           keys: ["shift+k", "shift+up", "meta+k", "meta+up"], run: (s) => s.moveAnchor(-8) }),
  command({ id: "diff-comment.jump-down",    title: "Jump down",         keys: ["shift+j", "shift+down", "meta+j", "meta+down"], run: (s) => s.moveAnchor(8) }),
  command({ id: "diff-comment.half-up",      title: "Half page up",      keys: ["pageup", "ctrl+u"],             run: (s) => s.moveAnchor(-s.halfPage) }),
  command({ id: "diff-comment.half-down",    title: "Half page down",    keys: ["pagedown", "ctrl+d", "ctrl+v"], run: (s) => s.moveAnchor(s.halfPage) }),
  command({ id: "diff-comment.left-side",    title: "Old side",          keys: ["left", "h"],                    run: (s) => s.selectSide("LEFT") }),
  command({ id: "diff-comment.right-side",   title: "New side",          keys: ["right", "l"],                   run: (s) => s.selectSide("RIGHT") }),
  command({ id: "diff-comment.next-file",    title: "Next file",         keys: ["]"],                            run: (s) => s.nextFile() }),
  command({ id: "diff-comment.prev-file",    title: "Prev file",         keys: ["["],                            run: (s) => s.previousFile() }),
)
```

Now the **App** glues them together with their respective scopes. The two
sub-keymaps don't know about each other or about `AppCtx`:

```ts
// src/keymap/all.ts
import { Keymap } from "@ghui/keymap"
import { diffViewKeymap, type DiffCtx } from "./diff.ts"
import { diffCommentKeymap, type DiffCommentCtx } from "./diffComment.ts"
import type { AppCtx } from "./state.ts"

const projectDiff = (a: AppCtx): DiffCtx | null =>
  a.diffFullView && !a.diffCommentMode ? a.diff : null

const projectDiffComment = (a: AppCtx): DiffCommentCtx | null =>
  a.diffFullView && a.diffCommentMode ? a.diffComment : null

export const appKeymap: Keymap<AppCtx> = Keymap.union(
  diffViewKeymap.contramapMaybe(projectDiff),
  diffCommentKeymap.contramapMaybe(projectDiffComment),
  // ... others ...
)
```

### What the diff bought us

| | Today | With `@ghui/keymap` |
|---|---|---|
| Sub-mode types | None — both layers see all of App | `DiffCtx` and `DiffCommentCtx` are independent |
| Where mode-exclusive logic lives | Inline `when` boolean | At the projection site, isolated |
| Can the diff layer be tested? | Only by mounting App | Yes, with a fake `DiffCtx` and a few `parseKey` calls |
| Adding a new sub-mode | Add another `useScopedBindings` block in App | Add a new file, glue with one line |

---

## 4. The whole `App.tsx` body, before vs. after

### Before (today, in `App.tsx`)

```tsx
// ~80 lines of useState/useAtom/derived selectors
// ~10 useScopedBindings calls, each ~10–30 lines, scattered with helpers
// useKeyboard with text-input fallbacks for 6 modal types
// 200 lines of JSX
```

The keyboard surface is **not visible**. To answer "what does `r` do here?",
you grep for `"r":` across nine separate `useScopedBindings` blocks.

### After

```tsx
// src/App.tsx
import { useKeymap } from "@ghui/keymap/react"
import { appKeymap } from "./keymap/all.ts"
import type { AppCtx } from "./keymap/state.ts"

const App = () => {
  // ... existing useState / useAtom hooks ...

  const ctx: AppCtx = {
    // The state shape is the contract. App.tsx fills it in.
    closeModal: { active: closeModalActive, closeModal: closeActiveModal, confirmClose: confirmClosePullRequest },
    diff: { ... },
    diffComment: { ... },
    // ...
  }

  useKeymap(appKeymap, ctx, subscribeToOpenTuiKeys)

  return <JSX />
}
```

The keyboard surface lives in `src/keymap/`. To answer "what does `r` do?",
read one file. To answer "what's bound globally right now?", call
`appKeymap.commands(ctx)`. To test that `escape` closes the close-modal,
you call `pureDispatch(closeModalKeymap, initialDispatchState, parseKey("escape"), fakeCtx, 0)`
— no React, no opentui, no mocks.

---

## 5. The numbers

For ghui's actual keyboard surface (~12 layers, ~100 bindings):

| Metric | Today | With `@ghui/keymap` (estimated) |
|---|---|---|
| Lines of keyboard code in `App.tsx` | ~370 | ~5 (one `useKeymap` call + a `ctx` object literal) |
| Lines of importable keyboard code | 0 | ~250 (split across 8 files) |
| Tests that mount React | 13 (the scrolling tests) | Could drop to ~3 (just the integration ones) |
| Way to introspect "what's bound now" | Manual grep | `appKeymap.commands(ctx)` |
| State surface used by bindings | All of App's closure | Each binding sees only its narrow context type |

---

## 6. The honest tradeoffs

The library is genuinely better at:

- **Locality**: each layer is a value in its own file with its own types.
- **Testability**: `pureDispatch` is a function; tests are calls.
- **Composition**: sub-modes are sub-keymaps; gluing is a one-liner with `contramapMaybe`.
- **Type safety**: command IDs typed via `meta`; sub-context shapes don't leak.
- **Introspection**: `appKeymap.commands(ctx)` and `snapshot(km, ctx)` give palette/footer/devtools a real API.

The library is genuinely worse at:

- **State plumbing**: each layer's narrow context (`DiffCtx`, `MergeModalCtx`, ...) needs to be assembled by `App.tsx` once per render. That's a ~50-field `ctx: AppCtx` object literal. With Zustand/Atom/Redux, this falls out naturally; with plain `useState` everywhere, it's busywork.
- **First-time friction**: users have to think about *what context this layer sees*. With the current opentui style you just close over component state and move on.
- **No focus-scoping yet**: `contramapMaybe` solves view-scoping; element/Renderable focus would need a target-ref primitive that we don't have.

For ghui specifically, the trades go positive. For a smaller app with fewer
keyboard layers, the plumbing cost might dominate.
