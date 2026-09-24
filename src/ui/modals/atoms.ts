import * as Atom from "effect/unstable/reactivity/Atom"
import { initialModal, type Modal } from "./types.js"

export const activeModalAtom = Atom.make<Modal>(initialModal)
