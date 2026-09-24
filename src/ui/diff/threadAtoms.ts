import * as Atom from "effect/unstable/reactivity/Atom"
import { diffCommentThreadsAtom, selectedDiffKeyAtom } from "./atoms.js"
import { diffThreadCounts } from "./commentBadge.js"

// Diff thread keys whose expansion was toggled away from the default
// (see `diffThreadExpanded`).
export const diffThreadToggledAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive)

// Review threads per file path for the selected diff. Feeds the ◆ badges in
// the file header, the file panel and the changed-files picker.
export const diffThreadCountsAtom = Atom.make((get) => diffThreadCounts(get(selectedDiffKeyAtom), get(diffCommentThreadsAtom)))
