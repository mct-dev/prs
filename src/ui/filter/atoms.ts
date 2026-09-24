import * as Atom from "effect/unstable/reactivity/Atom"

// The filter modal exposes these as the two choices; the actual state lives in
// the view atoms (mode + repository). This module owns text-filter state only.
export const scopeFilters = ["all", "mine"] as const
export type ScopeFilter = (typeof scopeFilters)[number]

export const filterQueryAtom = Atom.make("")
export const filterDraftAtom = Atom.make("")
export const filterModeAtom = Atom.make(false)

export const effectiveFilterQueryAtom = Atom.make((get) => (get(filterModeAtom) ? get(filterDraftAtom) : get(filterQueryAtom)).trim().toLowerCase())
