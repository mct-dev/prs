// Filter language shared by the `/` filter and section `where:` rules.
//
// A token is `field:value`, `-field:value`, or `field<op>value` with op one of
// `>`, `<`, `>=`, `<=`. Only known field names form predicates; everything
// else (including unknown `foo:bar` and bare `-word`) is free text in `/`.
// `where:` rules additionally allow `and`, `or`, `not`, and parentheses, and
// are strict: an unknown field (`me.reviewd`, `foo:bar`) is a parse error so a
// typo in `sections.yaml` is reported instead of silently matching as text.

export const filterFields = [
	"author",
	"repo",
	"label",
	"draft",
	"size",
	"files",
	"file",
	"age",
	"idle",
	"ci",
	"review",
	"risk",
	"brief",
	"section",
	"me.reviewed",
	"me.reviewed_since_push",
] as const
export type FilterField = (typeof filterFields)[number]

export const filterOperators = [":", ">=", "<=", ">", "<"] as const
export type FilterOperator = (typeof filterOperators)[number]

export interface FilterPredicate {
	readonly _tag: "Predicate"
	readonly field: FilterField
	readonly op: FilterOperator
	readonly value: string
	readonly negated: boolean
}

export type FilterExpr =
	| FilterPredicate
	| { readonly _tag: "Text"; readonly text: string }
	| { readonly _tag: "And"; readonly items: readonly FilterExpr[] }
	| { readonly _tag: "Or"; readonly items: readonly FilterExpr[] }
	| { readonly _tag: "Not"; readonly item: FilterExpr }

export interface ParsedFilterQuery {
	readonly predicates: readonly FilterPredicate[]
	readonly text: string
}

const isFilterField = (value: string): value is FilterField => (filterFields as readonly string[]).includes(value)

const booleanFields: ReadonlySet<FilterField> = new Set(["me.reviewed", "me.reviewed_since_push"])

const predicatePattern = /^(-?)([a-z][a-z._]*)(>=|<=|:|>|<)(.+)$/i

// A token that names a field: `field<op>...` or a bare dotted `me.something`.
const fieldLikePattern = /^(-?)([a-z][a-z_]*(?:\.[a-z_]+)+|[a-z][a-z._]*(?=>=|<=|:|>|<))/i

const stripQuotes = (value: string) => (value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value)

/** Parse one whitespace-free token into a predicate, or null when it is free text. */
export const parseFilterToken = (token: string): FilterPredicate | null => {
	const bare = /^(-?)([a-z][a-z._]*)$/i.exec(token)
	if (bare) {
		const field = bare[2]!.toLowerCase()
		if (isFilterField(field) && booleanFields.has(field)) {
			return { _tag: "Predicate", field, op: ":", value: "true", negated: bare[1] === "-" }
		}
		return null
	}
	const match = predicatePattern.exec(token)
	if (!match) return null
	const field = match[2]!.toLowerCase()
	if (!isFilterField(field)) return null
	const value = stripQuotes(match[4]!)
	if (value.length === 0) return null
	return { _tag: "Predicate", field, op: match[3] as FilterOperator, value, negated: match[1] === "-" }
}

// Split on whitespace but keep `"quoted values"` together.
const tokenize = (input: string, splitParens: boolean): readonly string[] => {
	const tokens: string[] = []
	let current = ""
	let quoted = false
	const flush = () => {
		if (current.length > 0) tokens.push(current)
		current = ""
	}
	for (const char of input) {
		if (char === '"') {
			quoted = !quoted
			current += char
		} else if (!quoted && /\s/.test(char)) {
			flush()
		} else if (!quoted && splitParens && (char === "(" || char === ")")) {
			flush()
			tokens.push(char)
		} else {
			current += char
		}
	}
	flush()
	return tokens
}

/** Parse a `/` filter: tokens AND together; the rest is free text. */
export const parseFilterQuery = (input: string): ParsedFilterQuery => {
	const predicates: FilterPredicate[] = []
	const text: string[] = []
	for (const token of tokenize(input, false)) {
		const predicate = parseFilterToken(token)
		if (predicate) predicates.push(predicate)
		else text.push(token)
	}
	return { predicates, text: text.join(" ") }
}

export class FilterParseError extends Error {
	override readonly name = "FilterParseError"
}

/** Parse a `where:` rule with `and` / `or` / `not` / parentheses. Juxtaposition means `and`. */
export const parseWhereExpression = (input: string): FilterExpr => {
	const tokens = tokenize(input, true)
	let position = 0
	const peek = () => tokens[position]
	const keyword = (token: string | undefined) => token?.toLowerCase()

	const parseOr = (): FilterExpr => {
		const items = [parseAnd()]
		while (keyword(peek()) === "or") {
			position++
			items.push(parseAnd())
		}
		return items.length === 1 ? items[0]! : { _tag: "Or", items }
	}

	const parseAnd = (): FilterExpr => {
		const items = [parseUnary()]
		while (position < tokens.length && peek() !== ")" && keyword(peek()) !== "or") {
			if (keyword(peek()) === "and") position++
			items.push(parseUnary())
		}
		return items.length === 1 ? items[0]! : { _tag: "And", items }
	}

	const parseUnary = (): FilterExpr => {
		const token = peek()
		if (token === undefined) throw new FilterParseError(`Unexpected end of expression: ${input}`)
		const word = keyword(token)
		if (word === "not") {
			position++
			return { _tag: "Not", item: parseUnary() }
		}
		if (token === "(") {
			position++
			const inner = parseOr()
			if (peek() !== ")") throw new FilterParseError(`Missing ")" in: ${input}`)
			position++
			return inner
		}
		if (token === ")" || word === "and" || word === "or") throw new FilterParseError(`Unexpected "${token}" in: ${input}`)
		position++
		const predicate = parseFilterToken(token)
		if (predicate) return predicate
		const field = fieldLikePattern.exec(token)?.[2]
		if (field !== undefined) {
			const known = isFilterField(field.toLowerCase())
			throw new FilterParseError(known ? `Invalid value in "${token}" in: ${input}` : `Unknown field "${field}" in: ${input}`)
		}
		return { _tag: "Text", text: token }
	}

	if (tokens.length === 0) return { _tag: "And", items: [] }
	const expression = parseOr()
	if (position < tokens.length) throw new FilterParseError(`Unexpected "${tokens[position]}" in: ${input}`)
	return expression
}

/** Human-readable labels for the active `/` filter, e.g. `author:alice · size>400 · "fix"`. */
export const describeFilterQuery = (input: string): string => {
	const { predicates, text } = parseFilterQuery(input)
	const parts = predicates.map(
		(predicate) => `${predicate.negated ? "-" : ""}${predicate.field}${predicate.op === ":" && booleanFields.has(predicate.field) ? "" : `${predicate.op}${predicate.value}`}`,
	)
	if (text.length > 0) parts.push(`"${text}"`)
	return parts.join(" ")
}

export const filterHelpText = "author: repo: label: draft: ci: review: size> files> age> idle> risk: brief: section: · -field:x negates"
