import * as Atom from "effect/unstable/reactivity/Atom"

// Comment ids whose card is toggled away from its default fold state.
export const commentCardToggledAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive)
// Per-comment override for `<details>` blocks (absent = auto).
export const commentCardDetailsAtom = Atom.make<ReadonlyMap<string, boolean>>(new Map<string, boolean>()).pipe(Atom.keepAlive)

export const toggleInSet = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
	const next = new Set(set)
	if (next.has(id)) next.delete(id)
	else next.add(id)
	return next
}

// auto -> all open -> all folded -> all open ...
export const cycleDetails = (map: ReadonlyMap<string, boolean>, id: string): ReadonlyMap<string, boolean> => new Map(map).set(id, map.get(id) !== true)
