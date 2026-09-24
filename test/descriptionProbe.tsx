// Renders a PR detail pane with a synthetic description and returns the
// character frame. Run directly to print it:
//   bun test/descriptionProbe.tsx [width] [body-lines] [body-file]
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act } from "react"
import type { PullRequestItem } from "../src/domain.ts"
import { DETAIL_BODY_SCROLL_LIMIT, DetailsPane, getDetailsPaneHeight } from "../src/ui/DetailsPane.tsx"
import { prDescriptionBody } from "./fixtures/markdownBodies.ts"

const pullRequest = (body: string): PullRequestItem => ({
	repository: "my-org/widgets",
	author: "alice",
	headRefOid: "abc123",
	headRefName: "feat/widget-cache",
	baseRefName: "main",
	defaultBranchName: "main",
	number: 42,
	title: "Add the widget cache",
	body,
	labels: [],
	additions: 120,
	deletions: 8,
	changedFiles: 5,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://example.com/my-org/widgets/pull/42",
})

export const probeDescription = async (width = 72, body = prDescriptionBody, bodyLines = DETAIL_BODY_SCROLL_LIMIT) => {
	// @ts-expect-error -- React's act environment flag is intentionally global.
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	const item = pullRequest(body)
	const contentWidth = width - 2
	const height = getDetailsPaneHeight({ pullRequest: item, contentWidth, bodyLines, paneWidth: width })
	const setup = await createTestRenderer({ width, height })
	const root = createRoot(setup.renderer)
	act(() => {
		root.render(
			<DetailsPane
				pullRequest={item}
				contentWidth={contentWidth}
				bodyLines={bodyLines}
				paneWidth={width}
				placeholderContent={{ title: "", hint: "" }}
				loadingIndicator=""
				themeId="ghui"
				themeGeneration={0}
			/>,
		)
	})
	await setup.renderOnce()
	const frame = setup.captureCharFrame()
	act(() => root.unmount())
	setup.renderer.destroy()
	return frame.replace(/[ \t]+$/gm, "").replace(/\n+$/, "")
}

if (import.meta.main) {
	const width = Number(process.argv[2] ?? 72)
	const bodyLines = Number(process.argv[3] ?? DETAIL_BODY_SCROLL_LIMIT)
	const body = process.argv[4] ? await Bun.file(process.argv[4]).text() : prDescriptionBody
	console.log(await probeDescription(width, body, bodyLines))
	process.exit(0)
}
