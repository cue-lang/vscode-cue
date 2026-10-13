package main

import (
	"log"
	"strings"
)

var root = struct {
	Schema     string   `json:"$schema"`
	Name       string   `json:"name"`
	FileTypes  []string `json:"fileTypes"`
	ScopeName  string   `json:"scopeName"`
	Patterns   Rules    `json:"patterns"`
	Repository RuleMap  `json:"repository"`
}{
	Schema:     "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
	Name:       "CUE",
	FileTypes:  []string{"cue"},
	ScopeName:  "source.cue",
	Patterns:   patterns,
	Repository: repository,
}

var patterns = Includes(
	"#invalid_slash",
	"#whitespace",
	"#comment",
	"#package",
	"#import",
	"#punctuation_comma",
	"#declaration",
	"#invalid_in_braces",
)

var repository = RuleMap{
	"alias": {
		Match: `(` + identAny + `)[ \t]*(=)`,
		Captures: Captures{
			1: Capture{Name: "variable.other"},
			2: Capture{Name: "punctuation.alias"},
		},
	},
	"alias_postfix": {
		// An alias name may be _, as in ~(K, _), and a space may follow
		// the ~, as in a~ X.
		Match: `(~)[ \t]*(?:(` + identAny + `|_)|(\()[ \t]*(` + identAny + `|_)(?:[ \t]*(,)[ \t]*(` + identAny + `|_))?[ \t]*(\)))`,
		Captures: Captures{
			1: Capture{Name: "punctuation.alias"},
			2: Capture{Name: "variable.other"},
			3: Capture{Name: "punctuation.section.parens.begin"},
			4: Capture{Name: "variable.other"},
			5: Capture{Name: "punctuation.separator"},
			6: Capture{Name: "variable.other"},
			7: Capture{Name: "punctuation.section.parens.end"},
		},
	},
	"attribute": {
		Begin: `(@)(` + identAny + `)(\()`,
		BeginCaptures: Captures{
			1: Capture{Name: "punctuation.definition.annotation"},
			2: Capture{Name: "variable.annotation"},
			3: Capture{Name: "punctuation.attribute-elements.begin"},
		},
		End: `\)`,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.attribute-elements.end"},
		},
		Patterns: Includes(
			"#punctuation_comma",
			"#attribute_element",
		),
		Name: "meta.annotation",
	},
	"attribute_element": {
		Patterns: Includes(
			"#attribute_label",
			"#attribute_nested",
			"#attribute_string",
		),
	},
	"attribute_label": {
		Begin: `(` + identAny + `)(=)`,
		BeginCaptures: Captures{
			1: Capture{Name: "variable.other"},
			2: Capture{Name: "punctuation.bind"},
		},
		End: `(?=[,\)])`,
		Patterns: Includes(
			"#attribute_string",
		),
	},
	"attribute_nested": {
		Begin: `(` + identAny + `)(\()`,
		BeginCaptures: Captures{
			1: Capture{Name: "variable.other"},
			2: Capture{Name: "punctuation.attribute-elements.begin"},
		},
		End: `\)`,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.attribute-elements.end"},
		},
		Patterns: Includes(
			"#punctuation_comma",
			"#attribute_element",
		),
	},
	"attribute_string": {
		Patterns: Rules{
			{Include: "#string"},
			{
				Match: `[^\n,"'#=\(\)]+`,
				Name:  "string.unquoted",
			},
			{
				Match: `[^,\)]+`,
				Name:  "invalid",
			},
		},
	},
	"bool": {
		Match: beforeIdent + `(?:true|false)` + afterIdent,
		Name:  "constant.language.bool",
	},
	"bottom": {
		Match: beforeIdent + `_\|_` + afterIdent,
		Name:  "constant.language.bottom",
	},
	"brackets": {
		Begin: `\[`,
		BeginCaptures: Captures{
			0: Capture{Name: "punctuation.section.brackets.begin"},
		},
		End: `\]`,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.section.brackets.end"},
		},
		Patterns: Includes(
			"#whitespace",
			"#comment",
			"#punctuation_colon",
			"#punctuation_comma",
			"#punctuation_ellipsis",
			"#punctuation_option",
			"#alias",
			"#expression",
			"#invalid_in_brakets",
		),
		Name: "meta.brackets",
	},
	"call": {
		Patterns: Includes(
			"#call_predefined",
			"#call_qualified",
		),
	},
	"call_predefined": {
		Begin: beforeIdent + `(len|close|and|or|div|mod|quo|rem|matchN|matchIf|error|validator)(\()`,
		BeginCaptures: Captures{
			1: Capture{Name: "support.function"},
			2: Capture{Name: "punctuation.section.parens.begin"},
		},
		End: `\)`,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.section.parens.end"},
		},
		Patterns: Includes(
			"#whitespace",
			"#comment",
			"#punctuation_comma",
			"#attribute",
			"#alias_postfix",
			"#punctuation_colon",
			"#punctuation_option",
			"#punctuation_bind",
			"#punctuation_ellipsis",
			"#expression",
			"#invalid_in_parens",
		),
		Name: "meta.function-call",
	},
	"call_qualified": {
		Begin: beforeIdent + `(` + identPackage + `)(\.)(` + identExported + `)(\()`,
		BeginCaptures: Captures{
			1: Capture{Name: "support.module"},
			2: Capture{Name: "punctuation"},
			3: Capture{Name: "support.function"},
			4: Capture{Name: "punctuation.section.parens.begin"},
		},
		End: `\)`,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.section.parens.end"},
		},
		Patterns: Includes(
			"#whitespace",
			"#comment",
			"#punctuation_comma",
			"#attribute",
			"#alias_postfix",
			"#punctuation_colon",
			"#punctuation_option",
			"#punctuation_bind",
			"#punctuation_ellipsis",
			"#expression",
			"#invalid_in_parens",
		),
		Name: "meta.function-call",
	},
	"clause": {
		Patterns: Rules{
			{
				// A keyword after in, as in for x in otherwise, is a
				// reference.
				Match: beforeIdent + `(for)[ \t]+(` + identAny + `)(?:[ \t]*(,)[ \t]*(` + identAny + `))?[ \t]+(in)` + afterIdent + `(?:[ \t]+(` + clauseWords + `)` + afterIdent + `)?`,
				Captures: Captures{
					1: Capture{Name: "keyword.control.for"},
					2: Capture{Name: "variable.other"},
					3: Capture{Name: "punctuation.separator"},
					4: Capture{Name: "variable.other"},
					5: Capture{Name: "keyword.control.in"},
					6: Capture{Name: "variable.other"},
				},
			},
			{
				// A keyword after if, as in if else, is a reference.
				Match: beforeIdent + `(if)` + afterIdent + `(?:[ \t]+(` + clauseWords + `)` + afterIdent + `)?`,
				Captures: Captures{
					1: Capture{Name: "keyword.control.conditional"},
					2: Capture{Name: "variable.other"},
				},
			},
			{
				// try starts a clause when an assignment, a struct or another
				// clause follows; elsewhere it is an ordinary label or
				// reference.
				Match: beforeIdent + `(try)[ \t]+(` + identAny + `|_)[ \t]*(=)(?![=~])`,
				Captures: Captures{
					1: Capture{Name: "keyword.control.try"},
					2: Capture{Name: "variable.other"},
					3: Capture{Name: "punctuation.bind"},
				},
			},
			{
				Match: beforeIdent + `try(?=[ \t]*\{|[ \t]+(?:for|if|let|try)` + afterIdent + `)`,
				Name:  "keyword.control.try",
			},
			{
				// else, otherwise and fallback introduce the struct that
				// follows a comprehension.
				Match: beforeIdent + `(?:else|otherwise|fallback)(?=[ \t]*\{)`,
				Name:  "keyword.control.conditional",
			},
			{
				Match: beforeIdent + `func(?=[ \t]*\()`,
				Name:  "keyword.function",
			},
			{
				Match: beforeIdent + `(let)[ \t]+(` + identAny + `)[ \t]*(=)(?![=])`,
				Captures: Captures{
					1: Capture{Name: "keyword.control.let"},
					2: Capture{Name: "variable.other"},
					3: Capture{Name: "punctuation.bind"},
				},
			},
		},
	},
	"comment": {
		Patterns: Includes(
			"#comment_line",
		),
	},
	"comment_line": {
		Match: `(//).*$\n?`,
		Captures: Captures{
			1: Capture{Name: "punctuation.definition.comment"},
		},
		Name: "comment.line",
	},
	"declaration": {
		Patterns: Includes(
			"#attribute",
			"#alias_postfix",
			"#punctuation_ellipsis",
			"#punctuation_colon",
			"#punctuation_option",
			"#punctuation_bind",
			"#expression",
		),
	},
	"expression": {
		Patterns: Includes(
			"#clause",
			"#operator",
			"#selector",
			"#operand",
		),
	},
	"float": {
		Patterns: Rules{
			{
				Match: beforeNum + digits + `\.(?:` + digits + `)?` + floatExpOpt + afterNum,
				Name:  "constant.numeric.float.decimal",
			},
			{
				Match: beforeNum + digits + floatExp + afterNum,
				Name:  "constant.numeric.float.decimal",
			},
			{
				Match: beforeNum + `\.` + digits + floatExpOpt + afterNum,
				Name:  "constant.numeric.float.decimal",
			},
		},
	},
	"identifier": {
		Match: beforeIdent + `(?:` + identAny + `)` + afterIdent,
		Name:  "variable.other",
	},
	"import": {
		Patterns: Rules{
			{
				Begin: beforeIdent + `(import)[ \t]+(\()`,
				BeginCaptures: Captures{
					1: Capture{Name: "keyword.other.import"},
					2: Capture{Name: "punctuation.section.parens.begin"},
				},
				End: `\)`,
				EndCaptures: Captures{
					0: Capture{Name: "punctuation.section.parens.end"},
				},
				Patterns: Rules{
					{Include: "#whitespace"},
					{Include: "#comment"},
					{
						Match: importSpec,
						Captures: Captures{
							1: Capture{Name: "entity.name.namespace"},
							2: Capture{Name: "punctuation.definition.string.begin"},
							3: Capture{Name: "string.quoted.double-import"},
							4: Capture{Name: "punctuation.colon"},
							5: Capture{Name: "entity.name"},
							6: Capture{Name: "punctuation.definition.string.end"},
						},
						Name: "meta.import-spec",
					},
					{
						Match: `;`,
						Name:  "punctuation.separator",
					},
					{Include: "#invalid_in_parens"},
				},
				Name: "meta.imports",
			},
			{
				Match: beforeIdent + `(import)[ \t]+` + importSpec,
				Captures: Captures{
					1: Capture{Name: "keyword.other.import"},
					2: Capture{Name: "entity.name.namespace"},
					3: Capture{Name: "punctuation.definition.string.begin"},
					4: Capture{Name: "string.quoted.double-import"},
					5: Capture{Name: "punctuation.colon"},
					6: Capture{Name: "entity.name"},
					7: Capture{Name: "punctuation.definition.string.end"},
				},
				Name: "meta.import",
			},
		},
	},
	"integer": {
		Patterns: Includes(
			"#integer_si",
			"#integer_decimal",
			"#integer_binary",
			"#integer_hex",
			"#integer_octal",
		),
	},
	"integer_binary": {
		Match: beforeNum + `0b[0-1](?:_?[0-1])*` + afterNum,
		Name:  "constant.numeric.integer.binary",
	},
	"integer_decimal": {
		Match: beforeNum + `(?:0|[1-9](?:_?[0-9])*)` + afterNum,
		Name:  "constant.numeric.integer.decimal",
	},
	"integer_hex": {
		Match: beforeNum + `0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*` + afterNum,
		Name:  "constant.numeric.integer.hexadecimal",
	},
	"integer_octal": {
		Match: beforeNum + `0o[0-7](?:_?[0-7])*` + afterNum,
		Name:  "constant.numeric.integer.octal",
	},
	"integer_si": {
		Patterns: Rules{
			{
				Match: beforeNum + decimalInt + `(?:\.` + digits + `)?` + siSuffix + afterNum,
				Name:  "constant.numeric.integer.other",
			},
			{
				Match: beforeNum + `\.` + digits + siSuffix + afterNum,
				Name:  "constant.numeric.integer.other",
			},
		},
	},
	"invalid_in_braces": {
		Match: `[^\s\}]`,
		Name:  "invalid",
	},
	"invalid_in_brakets": {
		Match: `[^\s\]]`,
		Name:  "invalid",
	},
	"invalid_in_parens": {
		Match: `[^\s\)]`,
		Name:  "invalid",
	},
	"invalid_slash": {
		// A / where a declaration or a value must start, as at the start of
		// a block comment, which CUE does not have. It comes ahead of the
		// whitespace rule, so that it also matches after indentation.
		Match: `(?<=^|[\{,:])[ \t]*+(/)(?!/)`,
		Captures: Captures{
			1: Capture{Name: "invalid"},
		},
	},
	"null": {
		Match: beforeIdent + `null` + afterIdent,
		Name:  "constant.language.null",
	},
	"number": {
		Patterns: Includes(
			"#float",
			"#integer",
		),
	},
	"operand": {
		Patterns: Includes(
			"#top",
			"#bottom",
			"#null",
			"#bool",
			"#number",
			"#string",
			"#type",
			"#self",
			"#call",
			"#identifier",
			"#struct",
			"#brackets",
			"#parens",
		),
	},
	"operator": {
		Patterns: Rules{
			{
				Match: `->`,
				Name:  "keyword.operator.arrow",
			},
			{
				Match: `[\+\-\*]|/(?!/)`,
				Name:  "keyword.operator", // not *only* arithmetic, also unary
			},
			{
				Match: `=[=~]|![=~]|<=|>=|[<](?!=)|[>](?![=])`, // ==, =~, !=, !~, <=, >=, <, >
				Name:  "keyword.operator.comparison",
			},
			{
				Match: `&{2}|\|{2}|!(?![=~])`, // &&, ||, !
				Name:  "keyword.operator.logical",
			},
			{
				Match: `&(?!&)|\|(?!\|)`, // & (unification), | (disjunction)
				Name:  "keyword.operator.set",
			},
		},
	},
	"package": {
		Match: beforeIdent + `(package)[ \t]+(` + identPackage + `)` + afterIdent,
		Captures: Captures{
			1: Capture{Name: "keyword.other.package"},
			2: Capture{Name: "entity.name.namespace"},
		},
	},
	"parens": {
		Begin: `\(`,
		BeginCaptures: Captures{
			0: Capture{Name: "punctuation.section.parens.begin"},
		},
		End: `\)`,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.section.parens.end"},
		},
		Patterns: Includes(
			"#whitespace",
			"#comment",
			"#punctuation_comma",
			"#attribute",
			"#alias_postfix",
			"#punctuation_colon",
			"#punctuation_option",
			"#punctuation_bind",
			"#punctuation_ellipsis",
			"#expression",
			"#invalid_in_parens",
		),
		Name: "meta.parens",
	},
	"punctuation_bind": {
		Match: `(?<![=!><])=(?![=~])`,
		Name:  "punctuation.bind",
	},
	"punctuation_comma": {
		Match: `,`,
		Name:  "punctuation.separator",
	},
	"punctuation_ellipsis": {
		Match: `(?<!\.)\.{3}(?!\.)`,
		Name:  "punctuation.ellipsis",
	},
	"punctuation_colon": {
		Match: `(?<!:):(?!:)`,
		Name:  "punctuation.colon",
	},
	"punctuation_option": {
		Match: `\?`,
		Name:  "punctuation.option",
	},
	"self": {
		// self, unless it is a field label, possibly with a postfix alias,
		// or a prefix alias name, as in self={...}.
		// The quantifiers are possessive, so that a long run of spaces does
		// not make the lookahead backtrack.
		Match: beforeIdent + `(?:__)?self` + afterIdent + `(?![ \t]*+(?:[?!][ \t]*+)?:|[ \t]*+~|[ \t]*+=(?![=~]))`,
		Name:  "variable.language.self",
	},
	"selector": {
		Patterns: Rules{
			{
				Match: `(?<!\.)(\.)(` + identAny + `)` + afterIdent,
				Captures: Captures{
					1: Capture{Name: "punctuation.accessor"},
					2: Capture{Name: "variable.other.member"},
				},
			},
			{
				// A quoted selector, as in x."a-b"; the string rule
				// scopes the quoted label.
				Match: `(?<!\.)(\.)(?=#*")`,
				Captures: Captures{
					1: Capture{Name: "punctuation.accessor"},
				},
			},
		},
	},
	"string": {
		Patterns: StringRules(4),
	},
	"struct": {
		Begin: `\{`,
		BeginCaptures: Captures{
			0: Capture{Name: "punctuation.definition.struct.begin"},
		},
		End: `\}`,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.definition.struct.end"},
		},
		Patterns: Includes(
			"#invalid_slash",
			"#whitespace",
			"#comment",
			"#punctuation_comma",
			"#punctuation_ellipsis",
			"#declaration",
			"#invalid_in_braces",
		),
		Name: "meta.struct",
	},
	"top": {
		Match: beforeIdent + `_(?!\|)` + afterIdent,
		Name:  "constant.language.top",
	},
	"type": {
		Match: beforeIdent + `(?:bool|u?int(?:8|16|32|64|128)?|float(?:32|64)?|string|bytes|number|rune)` + afterIdent,
		Name:  "support.type",
	},
	"whitespace": {
		Match: `[ \t\r\n]+`,
	},
}

const (
	beforeNum = `(?<![\p{L}\p{Nd}_\.])`
	afterNum  = `(?![\p{L}\p{Nd}_\.])`
)

const (
	// The words that start a clause or a comprehension's fallback, but
	// are references after in or if.
	clauseWords = `else|otherwise|fallback|try`
)

const (
	beforeIdent = `(?<!` + identChar + `)`
	afterIdent  = `(?!` + identChar + `)`
)

const (
	identChar     = `[\p{L}\p{Nd}_\$\#]`
	identExported = `\p{Lu}` + identChar + `*`
	identLocal    = `\p{Ll}` + identChar + `*`
	identNormal   = `[\p{L}\$\#]` + identChar + `*`
	identHidden   = `_` + identChar + `+`
	identPackage  = identNormal
	identAny      = identNormal + `|` + identHidden
)

const (
	importLocation = `[^:"]+`
	importSpec     = `(?:(` + identPackage + `)[ \t]+)?(")(` + importLocation + `)(?:(:)(` + identNormal + `))?(")`
)

const (
	digits      = `[0-9](?:_?[0-9])*`
	floatExp    = `[eE][\+\-]?` + digits
	floatExpOpt = `(?:` + floatExp + `)?`
	decimalInt  = `(?:0|[1-9](?:_?[0-9])*)`
	siSuffix    = `(?:[KMGTP]i?)`
)

const (
	escapeControl = `[abfnrtv]`
	escapeSimple  = `/|\\`
	escapeOctal   = `[0-7]{3}`
	escapeHex     = `x[0-9A-Fa-f]{2}`
	escapeLittleU = `u[0-9A-Fa-f]{4}`
	escapeBigU    = `U[0-9A-Fa-f]{8}`
	escapeCommon  = escapeSimple + `|` + escapeControl + `|` + escapeLittleU + `|` + escapeBigU
	escapeByte    = escapeOctal + `|` + escapeHex
)

func EscapeRules(quote, hashes string, bytes bool) Rules {
	var byteName string
	if bytes {
		byteName = "constant.character.escape"
	} else {
		byteName = "invalid.illegal"
	}
	rules := Rules{
		{
			// The string's own quote character is an escape, also in a
			// multiline string.
			Match: `\\` + hashes + `(?:` + quote[:1] + `|` + escapeCommon + `)`,
			Name:  "constant.character.escape",
		},
		{
			Match: `\\` + hashes + `(?:` + escapeByte + `)`,
			Name:  byteName,
		},
		{
			Begin: `\\` + hashes + `\(`,
			BeginCaptures: Captures{
				0: Capture{Name: "punctuation.section.interpolation.begin"},
			},
			End: `\)`,
			EndCaptures: Captures{
				0: Capture{Name: "punctuation.section.interpolation.end"},
			},
			ContentName: "source.cue.embedded",
			Patterns: Includes(
				"#whitespace",
				"#punctuation_option",
				"#expression",
				"#invalid_in_parens",
			),
			Name: "meta.interpolation",
		},
	}
	if len(quote) == 3 {
		// In a multiline string, a backslash at the end of a line escapes
		// the newline.
		rules = append(rules, Rule{
			Match: `\\` + hashes + `$`,
			Name:  "constant.character.escape",
		})
	}
	return append(rules, Rule{
		Match: `\\` + hashes + `.`,
		Name:  "invalid.illegal",
	})
}

func Includes(keys ...string) Rules {
	rules := make(Rules, len(keys))
	for i, k := range keys {
		rule := &rules[i]
		rule.Include = k
	}
	return rules
}

func StringRule(quoteName string, hashCount int) Rule {
	var (
		quote string
		bytes bool
	)
	switch quoteName {
	case "double":
		quote, bytes = `"`, false
	case "single":
		quote, bytes = `'`, true
	case "double-multiline":
		quote, bytes = `"""`, false
	case "single-multiline":
		quote, bytes = `'''`, true
	default:
		log.Fatalf("unknown quote name: %q", quoteName)
	}
	hashes := strings.Repeat("#", hashCount)
	return Rule{
		Begin: hashes + quote,
		BeginCaptures: Captures{
			0: Capture{Name: "punctuation.definition.string.begin"},
		},
		End: quote + hashes,
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.definition.string.end"},
		},
		ContentName: "string.quoted." + quoteName,
		Name:        "meta.string",
		Patterns:    EscapeRules(quote, hashes, bytes),
	}
}

func StringRules(maxHashes int) Rules {
	rules := make(Rules, 0, (maxHashes+1)*4)
	for h := maxHashes; h >= 0; h-- {
		rules = append(rules,
			StringRule("double-multiline", h),
			StringRule("double", h),
			StringRule("single-multiline", h),
			StringRule("single", h),
		)
	}
	return rules
}
