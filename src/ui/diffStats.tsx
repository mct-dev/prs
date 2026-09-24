import type { PullRequestItem } from "../domain.js"
import { colors } from "./colors.js"
import { diffStatText } from "./diff.js"

type DiffStatsPart = { readonly key: string; readonly text: string; readonly color: string }

const diffStatsParts = (pullRequest: PullRequestItem): readonly DiffStatsPart[] => {
	const files = pullRequest.changedFiles === 1 ? "1 file" : `${pullRequest.changedFiles} files`
	return [
		{ key: "files", text: files, color: colors.muted },
		pullRequest.additions > 0 ? { key: "additions", text: `+${pullRequest.additions}`, color: colors.status.passing } : null,
		pullRequest.deletions > 0 ? { key: "deletions", text: `-${pullRequest.deletions}`, color: colors.status.failing } : null,
	].filter((part): part is DiffStatsPart => part !== null)
}

export const DiffStats = ({ pullRequest, loadingIndicator }: { pullRequest: PullRequestItem; loadingIndicator: string }) => {
	if (!pullRequest.detailLoaded) return <span fg={colors.muted}>{diffStatText(pullRequest, loadingIndicator)}</span>
	const parts = diffStatsParts(pullRequest)
	return (
		<>
			{parts.map((part, index) => (
				<span key={part.key} fg={part.color}>{`${index > 0 ? " " : ""}${part.text}`}</span>
			))}
		</>
	)
}
