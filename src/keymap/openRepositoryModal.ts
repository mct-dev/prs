import { context } from "@ghui/keymap"
import { confirmModalBindings } from "./helpers.js"

export interface OpenRepositoryModalCtx {
	readonly closeModal: () => void
	readonly openFromInput: () => void
}

const OpenRepo = context<OpenRepositoryModalCtx>()

export const openRepositoryModalKeymap = OpenRepo(
	...confirmModalBindings<OpenRepositoryModalCtx>({
		id: "open-repo",
		close: (s) => s.closeModal(),
		confirm: { title: "Open repository", run: (s) => s.openFromInput() },
	}),
)
