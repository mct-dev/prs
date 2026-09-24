// Procedural loading art: abstract braille-dot pictures, no words or letters.
//
// Each terminal cell is a 2x4 grid of braille dots (U+2800 block), so a
// W x H cell box is a 2W x 4H dot canvas with roughly square dots. A variant
// fills that canvas with a brightness in [0, 1]; ordered dithering turns
// brightness into dot density, and each cell keeps its average brightness as
// a color level. Everything is a pure function of (variant, size, seed,
// frame), so tests and headless renders are deterministic.

export const LOADING_ART_VARIANTS = ["contours", "plasma", "torus"] as const
export type LoadingArtVariant = (typeof LOADING_ART_VARIANTS)[number]

/** Number of color levels a cell can take (0 = dimmest). */
export const ART_LEVELS = 5

export interface ArtCell {
	/** A braille character, or a plain space when no dot is lit. */
	readonly char: string
	readonly level: number
}

export type ArtFrame = readonly (readonly ArtCell[])[]

export interface ArtFrameInput {
	readonly variant: LoadingArtVariant
	readonly width: number
	readonly height: number
	readonly frame: number
	readonly seed?: number
}

export const ART_FRAME_INTERVAL_MS = 80
export const DEFAULT_ART_SEED = 7
/** The frame shown when animation is off. Chosen because it reads well in every variant. */
export const STATIC_ART_FRAME = 24

// Braille dot bits, indexed [row][column] within a cell.
const DOT_BITS = [
	[0x01, 0x08],
	[0x02, 0x10],
	[0x04, 0x20],
	[0x40, 0x80],
] as const

// 4x4 Bayer matrix, normalized to (0, 1). Dither thresholds per dot.
const BAYER = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16))

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)
const smooth = (t: number) => t * t * (3 - 2 * t)

// Integer hash of a lattice point, in [0, 1). Seeded; never uses Math.random.
const hash2 = (x: number, y: number, seed: number) => {
	let h = (Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263) + Math.imul(seed, 2_147_483_647)) | 0
	h = Math.imul(h ^ (h >>> 13), 1_274_126_177)
	h ^= h >>> 16
	return (h >>> 0) / 4_294_967_296
}

const valueNoise = (x: number, y: number, seed: number) => {
	const x0 = Math.floor(x)
	const y0 = Math.floor(y)
	const tx = smooth(x - x0)
	const ty = smooth(y - y0)
	const a = hash2(x0, y0, seed)
	const b = hash2(x0 + 1, y0, seed)
	const c = hash2(x0, y0 + 1, seed)
	const d = hash2(x0 + 1, y0 + 1, seed)
	return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
}

/** A brightness field over the dot canvas, or a precomputed canvas. */
type Field = (x: number, y: number) => number

interface ArtField {
	readonly field: Field
	/** Dithered fields light dots by density; line fields light every nonzero dot. */
	readonly dither: boolean
}

// Topographic contour lines over slowly drifting value noise. A dot is lit
// where the height band changes between it and its right or lower neighbor,
// which gives crisp one-dot lines instead of dithered bands.
const contoursCanvas = (dotsWide: number, dotsHigh: number, t: number, seed: number): Field => {
	const scale = 3.4 / Math.max(dotsWide, dotsHigh * 1.5)
	const bands = 7
	const stride = dotsWide + 1
	const height = new Float32Array(stride * (dotsHigh + 1))
	for (let y = 0; y <= dotsHigh; y++) {
		for (let x = 0; x <= dotsWide; x++) {
			const nx = x * scale
			const ny = y * scale
			height[y * stride + x] = 0.7 * valueNoise(nx + t * 0.012, ny - t * 0.007, seed) + 0.3 * valueNoise(nx * 2.3 - t * 0.017, ny * 2.3 + 3.7, seed + 1)
		}
	}
	const bandAt = (x: number, y: number) => Math.floor(height[y * stride + x]! * bands)
	return (x, y) => {
		const band = bandAt(x, y)
		if (band === bandAt(x + 1, y) && band === bandAt(x, y + 1)) return 0
		return 0.35 + 0.65 * clamp01(band / (bands - 1))
	}
}

// Soft interference of a few moving sine waves.
const plasmaField = (dotsWide: number, dotsHigh: number, t: number, seed: number): Field => {
	const phase = hash2(seed, 3, seed) * Math.PI * 2
	const size = Math.max(dotsWide, dotsHigh * 1.6)
	const k = 11 / size
	const cx = dotsWide * (0.5 + 0.3 * Math.sin(t * 0.021 + phase))
	const cy = dotsHigh * (0.5 + 0.3 * Math.cos(t * 0.017 + phase))
	return (x, y) => {
		const dx = x - cx
		const dy = (y - cy) * 1.25
		const v =
			Math.sin(x * k + t * 0.09 + phase) + Math.sin(y * k * 1.3 - t * 0.07) + Math.sin((x + y) * k * 0.7 + t * 0.05) + Math.sin(Math.sqrt(dx * dx + dy * dy) * k * 1.4 - t * 0.12)
		const normalized = (v + 4) / 8
		return clamp01((normalized - 0.3) / 0.62) ** 1.6
	}
}

// A slowly rotating, lit torus, drawn into its own canvas with a depth buffer.
const torusCanvas = (dotsWide: number, dotsHigh: number, t: number, seed: number): Field => {
	const light = [0, 0.7071, -0.7071] as const
	const tilt = 0.9 + 0.3 * hash2(seed, 5, seed)
	const a = tilt + t * 0.035
	const b = t * 0.05
	const cosA = Math.cos(a)
	const sinA = Math.sin(a)
	const cosB = Math.cos(b)
	const sinB = Math.sin(b)
	const tubeRadius = 1
	const ringRadius = 2
	const viewerDistance = 5
	const fit = Math.min(dotsWide, dotsHigh) * 0.46
	// Scaled so the nearest edge (z ~ 3.5 at the tilts we use) stays inside the box.
	const projection = fit * 1.15
	const brightness = new Float32Array(dotsWide * dotsHigh)
	const depth = new Float32Array(dotsWide * dotsHigh)
	const thetaStep = Math.min(0.09, 2.4 / Math.max(dotsWide, dotsHigh))
	const phiStep = thetaStep / 2.5

	for (let theta = 0; theta < Math.PI * 2; theta += thetaStep) {
		const cosTheta = Math.cos(theta)
		const sinTheta = Math.sin(theta)
		const circleX = ringRadius + tubeRadius * cosTheta
		const circleY = tubeRadius * sinTheta
		for (let phi = 0; phi < Math.PI * 2; phi += phiStep) {
			const cosPhi = Math.cos(phi)
			const sinPhi = Math.sin(phi)
			const x = circleX * (cosB * cosPhi + sinA * sinB * sinPhi) - circleY * cosA * sinB
			const y = circleX * (sinB * cosPhi - sinA * cosB * sinPhi) + circleY * cosA * cosB
			const z = viewerDistance + cosA * circleX * sinPhi + circleY * sinA
			const inverseZ = 1 / z
			const px = Math.floor(dotsWide / 2 + projection * x * inverseZ)
			const py = Math.floor(dotsHigh / 2 - projection * y * inverseZ)
			if (px < 0 || py < 0 || px >= dotsWide || py >= dotsHigh) continue
			const index = py * dotsWide + px
			if (inverseZ <= depth[index]!) continue
			depth[index] = inverseZ
			const nx = cosTheta * (cosB * cosPhi + sinA * sinB * sinPhi) - sinTheta * cosA * sinB
			const ny = cosTheta * (sinB * cosPhi - sinA * cosB * sinPhi) + sinTheta * cosA * cosB
			const nz = cosA * cosTheta * sinPhi + sinTheta * sinA
			const lum = nx * light[0] + ny * light[1] + nz * light[2]
			brightness[index] = 0.12 + 0.88 * clamp01(lum)
		}
	}

	return (x, y) => brightness[y * dotsWide + x]!
}

const fieldFor = (variant: LoadingArtVariant, dotsWide: number, dotsHigh: number, frame: number, seed: number): ArtField => {
	switch (variant) {
		case "contours":
			return { field: contoursCanvas(dotsWide, dotsHigh, frame, seed), dither: false }
		case "plasma":
			return { field: plasmaField(dotsWide, dotsHigh, frame, seed), dither: true }
		case "torus":
			return { field: torusCanvas(dotsWide, dotsHigh, frame, seed), dither: true }
	}
}

export const renderArtFrame = ({ variant, width, height, frame, seed = DEFAULT_ART_SEED }: ArtFrameInput): ArtFrame => {
	const columns = Math.max(0, Math.floor(width))
	const rows = Math.max(0, Math.floor(height))
	if (columns === 0 || rows === 0) return []
	const dotsWide = columns * 2
	const dotsHigh = rows * 4
	const { field, dither } = fieldFor(variant, dotsWide, dotsHigh, frame, seed)

	return Array.from({ length: rows }, (_, row) =>
		Array.from({ length: columns }, (_, column): ArtCell => {
			let bits = 0
			let lit = 0
			let total = 0
			for (let dy = 0; dy < 4; dy++) {
				for (let dx = 0; dx < 2; dx++) {
					const x = column * 2 + dx
					const y = row * 4 + dy
					const value = field(x, y)
					if (value > (dither ? BAYER[y % 4]![x % 4]! : 0)) {
						bits |= DOT_BITS[dy]![dx]!
						lit++
						total += value
					}
				}
			}
			if (bits === 0) return { char: " ", level: 0 }
			const level = Math.min(ART_LEVELS - 1, Math.floor((total / lit) * ART_LEVELS))
			return { char: String.fromCharCode(0x2800 + bits), level }
		}),
	)
}

/** Plain text of a frame, one string per row, with trailing blanks trimmed. */
export const artFrameText = (frame: ArtFrame) =>
	frame.map((row) =>
		row
			.map((cell) => cell.char)
			.join("")
			.trimEnd(),
	)

export const ART_MIN_WIDTH = 18
export const ART_MAX_WIDTH = 40
export const ART_MIN_HEIGHT = 3
export const ART_MAX_HEIGHT = 8

/** Art box size for a pane, or null when the pane is too small for art. */
export const artSizeFor = (paneWidth: number, paneHeight: number): { readonly width: number; readonly height: number } | null => {
	// Leave room for a blank row and the hint line under the art.
	const availableHeight = paneHeight - 2
	if (paneWidth < ART_MIN_WIDTH + 2 || availableHeight < ART_MIN_HEIGHT) return null
	const width = Math.max(ART_MIN_WIDTH, Math.min(ART_MAX_WIDTH, Math.floor(paneWidth * 0.4)))
	const height = Math.max(ART_MIN_HEIGHT, Math.min(ART_MAX_HEIGHT, Math.floor(availableHeight * 0.35), Math.round(width / 4.5)))
	return { width, height }
}
