import * as Atom from "effect/unstable/reactivity/Atom"

// Diff thread keys whose expansion was toggled away from the default
// (see `diffThreadExpanded`).
export const diffThreadToggledAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive)
