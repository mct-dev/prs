import * as Atom from "effect/unstable/reactivity/Atom"

export const noticeAtom = Atom.make<string | null>(null)
