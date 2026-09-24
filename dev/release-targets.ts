export interface ReleaseTarget {
	readonly id: string
	readonly bunTarget: string
	readonly os: "darwin" | "linux"
	readonly cpu: "arm64" | "x64"
}

export const releaseTargets: readonly ReleaseTarget[] = [
	{ id: "darwin-arm64", bunTarget: "bun-darwin-arm64", os: "darwin", cpu: "arm64" },
	{ id: "darwin-x64", bunTarget: "bun-darwin-x64", os: "darwin", cpu: "x64" },
	{ id: "linux-arm64", bunTarget: "bun-linux-arm64", os: "linux", cpu: "arm64" },
	{ id: "linux-x64", bunTarget: "bun-linux-x64", os: "linux", cpu: "x64" },
]

export const currentReleaseTargetId = () => {
	const os = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : null
	const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null
	return os && arch ? `${os}-${arch}` : null
}

export const findReleaseTarget = (id: string | null | undefined) => releaseTargets.find((target) => target.id === id) ?? null

export const binaryPackageName = (packageName: string, target: ReleaseTarget) => `${packageName}-${target.id}`
