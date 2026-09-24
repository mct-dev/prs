import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { errorMessage } from "../../errors.js"
import { isSafeUrl } from "../../safeUrl.js"
import { selectedOrderedCommentAtom } from "./atoms.js"
import { commentLinks } from "./cards.js"
import { commentCardDetailsAtom, commentCardToggledAtom, cycleDetails, toggleInSet } from "./cardState.js"

export interface CommentCardActions {
	readonly toggleSelectedCard: () => void
	readonly toggleSelectedDetails: () => void
	readonly openSelectedLink: (index: number) => void
}

export const useCommentCardActions = ({
	openUrl,
	flashNotice,
}: {
	readonly openUrl: (url: string) => Promise<unknown>
	readonly flashNotice: (message: string) => void
}): CommentCardActions => {
	const selected = useAtomValue(selectedOrderedCommentAtom)
	const setToggled = useAtomSet(commentCardToggledAtom)
	const setDetails = useAtomSet(commentCardDetailsAtom)
	return {
		toggleSelectedCard: () => {
			if (selected) setToggled((current) => toggleInSet(current, selected.id))
		},
		toggleSelectedDetails: () => {
			if (selected) setDetails((current) => cycleDetails(current, selected.id))
		},
		openSelectedLink: (index) => {
			if (!selected) return
			const link = commentLinks(selected).find((candidate) => candidate.index === index)
			if (!link) {
				flashNotice(`No link [${index}] in this comment`)
				return
			}
			if (!isSafeUrl(link.url)) {
				flashNotice(`Refusing to open non-web link [${index}]`)
				return
			}
			void openUrl(link.url)
				.then(() => flashNotice(`Opened ${link.url}`))
				.catch((error) => flashNotice(errorMessage(error)))
		},
	}
}
