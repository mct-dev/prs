import type * as React from "react"

declare module "@opentui/react/jsx-runtime" {
	export namespace JSX {
		interface IntrinsicAttributes extends React.Attributes {}
	}
}
