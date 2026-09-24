import { useAtomValue } from "@effect/atom-react"
import { CommentSegmentsLine } from "../comments.js"
import { PaddedRow } from "../primitives.js"
import { diffCommentThreadsAtom } from "./atoms.js"
import { diffThreadToggledAtom } from "./threadAtoms.js"
import { diffThreadExpanded, diffThreadFromComments, diffThreadLines } from "./threads.js"

// The rows of one thread block between diff segments. Heights were reserved
// by `diffThreadPlacements` with the same inputs, so the lines fit exactly.
export const DiffThreadBlock = ({ keys, width }: { readonly keys: readonly string[]; readonly width: number }) => {
	const threads = useAtomValue(diffCommentThreadsAtom)
	const toggled = useAtomValue(diffThreadToggledAtom)
	return (
		<>
			{keys.flatMap((key) => {
				const thread = diffThreadFromComments(key, threads[key] ?? [])
				if (!thread) return []
				return diffThreadLines(thread, { expanded: diffThreadExpanded(thread, toggled), width }).map((line) => (
					<PaddedRow key={line.key}>
						<CommentSegmentsLine segments={line.segments} />
					</PaddedRow>
				))
			})}
		</>
	)
}
