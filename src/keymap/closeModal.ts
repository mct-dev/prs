import { context } from "@ghui/keymap"
import { confirmModalBindings } from "./helpers.js"

export interface CloseModalCtx {
	readonly closeModal: () => void
	readonly confirmClose: () => void
}

const Close = context<CloseModalCtx>()

export const closeModalKeymap = Close(
	...confirmModalBindings<CloseModalCtx>({
		id: "close-modal",
		close: (s) => s.closeModal(),
		confirm: { title: "Close pull request", run: (s) => s.confirmClose() },
	}),
)
