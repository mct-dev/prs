# @ghui/keymap

A small, opinionated keymap library where **bindings are values you compose**,
**state is input**, and **dispatch is a pure function**.

```ts
import { context, scrollCommands } from "@ghui/keymap"

interface DiffState {
	halfPage: number
	scrollBy: (delta: number) => void
	scrollTo: (line: number) => void
	close: () => void
}

const Diff = context<DiffState>()

const diffKeymap = Diff(
	scrollCommands<DiffState>(),
	{ id: "diff.close", title: "Close", keys: ["escape"], run: (s) => s.close() },
)

interface AppCtx { view: "list" | "diff"; diff: DiffState }
const App = context<AppCtx>()

const appKeymap = App(
	diffKeymap.scope((a) => a.view === "diff" && a.diff),
)
```

Three things doing the work:

- `context<C>()` returns a callable bound to a context type. Every command config inside infers `s: C` automatically — no `<DiffState>` repeated per call.
- Each item is either a `CommandConfig` literal or an existing `Keymap<C>`. Mix freely.
- `keymap.scope((a) => cond && a.sub)` is the falsy-friendly form of `contramapMaybe` — write your scoping as a `&&` chain, not a ternary.

## Why this shape

`Keymap<C>` is the unit of authoring. It is:

- **A monoid** under `union` — combine keymaps over the same context, identity is `Keymap.empty()`, associative.
- **Contravariant** in `C` via `contramap` / `contramapMaybe` — sub-keymaps over narrow contexts lift into wider ones via projection.
- **Restrictable** with `restrict(predicate)` — AND-merges a predicate into every binding's `when`.
- **Prefixable** with `prefix("space")` — leader keys for free.

Every combinator returns a Keymap. The algebra is closed. Laws asserted in tests.

## Why this engine

Dispatch is a **pure function** of `(keymap, state, stroke, ctx, now)` returning
`(state, decision)`. State is data: `{ pending, timeoutAt }`. The stateful
`createDispatcher` is a thin wrapper around the pure core.

That means:

- **Testable without React or fake timers** for the dispatch logic itself.
- **State is observable**: `dispatcher.getState()`, `dispatcher.onStateChange(...)`.
- **Replay, time-travel, snapshot** all become possible because runtime state is just data.

```ts
import { initialDispatchState, pureDispatch } from "@ghui/keymap"

const { state, decision } = pureDispatch(km, initialDispatchState, parseKey("g"), ctx, now)
// decision: { kind: "ran" | "pending" | "disabled" | "no-match", ... }
// state:    { pending: [...], timeoutAt: number | null }
```

## API surface

### Defining bindings

| | |
|---|---|
| `defineCommand({ id, title, keys, run, ... })` | Build a Keymap from one logical command. |
| `keys: ["r"]` / `["g g"]` / `["k", "up"]` | Single, sequence, or alternatives. |
| `when: (ctx) => boolean` | Scope predicate. |
| `enabled: (ctx) => true \| false \| string` | Gate with optional reason. |
| `keywords: ["reload", "fetch"]` | For palette search. |

### Composing

| | |
|---|---|
| `Keymap.empty<C>()` | Identity for union. |
| `Keymap.union(...kms)` | Concatenate bindings. |
| `km.contramap((c2) => c)` | Lift to wider context. |
| `km.contramapMaybe((c2) => c \| null)` | Lift; null = inactive. |
| `km.restrict((c) => boolean)` | AND-merge into `when`. |
| `km.prefix("space")` | Prepend to all sequences. |
| `km.union(other)` | Instance form. |
| `km.filter((b) => boolean)` | Drop bindings. |
| `for (const b of km)` | Iterate (Symbol.iterator). |

### Reading

| | |
|---|---|
| `km.active(ctx)` | Currently-runnable bindings. |
| `km.commands(ctx)` | Active bindings narrowed to `Command<C>` (id+title required). |
| `snapshot(km, ctx)` | Serializable view: `{ sequence, status, meta }[]`. |
| `isCommand(binding)` | Type guard. |

### Dispatching

| | |
|---|---|
| `createDispatcher(km, getCtx, options?)` | Stateful wrapper over `pureDispatch`. |
| `dispatcher.dispatch(stroke)` | Process a key. |
| `dispatcher.runById("pull.refresh")` | Run by command id, no key required. |
| `dispatcher.getState()` | `{ pending, timeoutAt }`. |
| `dispatcher.onStateChange(cb)` | Subscribe. |
| `pureDispatch(km, state, stroke, ctx, now)` | Pure core; for tests/replay/SSR. |
| `pureTick(km, state, ctx, now)` | Process timeouts purely. |

### React

| | |
|---|---|
| `useKeymap(km, ctx, subscribe)` | Mounts; re-creates dispatcher on `km` change. |
| `useDispatchState(dispatcher)` | Reactive `{ pending, timeoutAt }`. |
| `usePendingSequence(dispatcher)` | Convenience: just pending. |

## Sequences and disambiguation

`"r"` single, `"g g"` two-stroke, `"ctrl+x ctrl+c"` modifier sequences. When
`g` and `g g` are both bound and active, pressing `g` enters pending; a second
`g` runs the sequence; an unrelated key clears pending and re-dispatches fresh;
a 500ms timeout commits to `g`. Configurable via `disambiguationTimeoutMs`.

The dispatcher accepts an injectable `Clock` for deterministic tests.

## Type narrowing

```ts
import { isCommand, type Command } from "@ghui/keymap"

const all = km.bindings              // Binding<C>[] — meta is optional
const cmds = all.filter(isCommand)   // Command<C>[] — meta.id, meta.title required
const active = km.commands(ctx)      // Command<C>[] runnable now

// In palette code:
active.map((c) => c.meta.title)      // No optional chaining needed
```

## Laws (asserted in tests)

- **Monoid (`union`)**: identity (`empty`), associativity.
- **Contravariant functor (`contramap`)**: `contramap(id) ≡ km`; `contramap(g).contramap(f) ≡ contramap(c => g(f(c)))`.
- **`restrict` is idempotent for the same predicate.**
- **`prefix` composes**: `prefix(b).prefix(a) ≡ prefix("a b")`.
- **Meta survives every combinator.**
- **`pureDispatch` is referentially transparent**: same inputs → same output.

## Non-goals

- Type-level key-string validation. Keystrokes are parsed at definition time;
  typos become runtime no-ops.
- Layer priorities or weighted resolution. `when` predicates are how you scope.
  Optional `onCollision` callback warns when active bindings share a sequence.
- Async run with cancellation. `run` may return anything; the dispatcher
  doesn't await.
- Pluggable parsers, transformers, attrs, or fields.
