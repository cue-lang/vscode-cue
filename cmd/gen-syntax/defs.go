package main

import (
	"log"
	"strings"
)

var root = struct {
	Schema     string  `json:"$schema"`
	Name       string  `json:"name"`
	ScopeName  string  `json:"scopeName"`
	Patterns   Rules   `json:"patterns"`
	Repository RuleMap `json:"repository"`
}{
	Schema:     "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
	Name:       "CUE",
	ScopeName:  "source.cue",
	Patterns:   patterns,
	Repository: repository,
}

var patterns = Includes(
	"#whitespace",
	"#comment",
	"#package",
	"#import",
	"#punctuation_comma",
	"#declaration",
	"#invalid_in_braces",
)

var repository = RuleMap{
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
	"binding": {
		Match: `(<)(` + identAny + `|_)(>)`,
		Captures: Captures{
			1: Capture{Name: "punctuation.definition.generic.begin"},
			2: Capture{Name: "variable.other"},
			3: Capture{Name: "punctuation.definition.generic.end"},
		},
		Name: "meta.generic",
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
		Begin: beforeIdent + `(len|close|and|or)(\()`,
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
			"#expression",
			"#invalid_in_parens",
		),
		Name: "meta.function-call",
	},
	"clause": {
		Patterns: Rules{
			{
				Match: beforeIdent + `(for)[ \t]+(` + identAny + `)(?:[ \t]*(,)[ \t]*(` + identAny + `))?[ \t]+(in)` + afterIdent,
				Captures: Captures{
					1: Capture{Name: "keyword.control.for"},
					2: Capture{Name: "variable.other"},
					3: Capture{Name: "punctuation.separator"},
					4: Capture{Name: "variable.other"},
					5: Capture{Name: "keyword.control.in"},
				},
			},
			{
				Match: beforeIdent + `if` + afterIdent,
				Name:  "keyword.control.conditional",
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
			"#comment_block",
		),
	},
	"comment_block": {
		Begin: `/\*`,
		End:   `\*/`,
		Captures: Captures{
			0: Capture{Name: "punctuation.definition.comment"},
		},
		Name: "comment.block",
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
			"#binding",
			"#punctuation_isa",
			"#punctuation_colon",
			"#punctuation_option",
			"#punctuation_bind",
			"#punctuation_arrow",
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
		Match: beforeNum + `0o?[0-7](?:_?[0-7])*` + afterNum,
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
		Match: `[^\}]+`,
		Name:  "invalid",
	},
	"invalid_in_brakets": {
		Match: `[^\]]+`,
		Name:  "invalid",
	},
	"invalid_in_parens": {
		Match: `[^\)]+`,
		Name:  "invalid",
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
				Match: `[\+\-\*]|/(?![/*])`,
				Name:  "keyword.operator", // not *only* arithmetic, also unary
			},
			{
				Match: beforeIdent + `(?:div|mod|quo|rem)` + afterIdent,
				Name:  "keyword.operator.word",
			},
			{
				Match: `=[=~]|![=~]|<=|>=|[<](?![-=])|[>](?![=])`, // ==, =~, !=, !~, <=, >=, <, >
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
			"#expression",
			"#invalid_in_parens",
		),
		Name: "meta.parens",
	},
	"punctuation_arrow": {
		Match: `<-`,
		Name:  "punctuation.arrow",
	},
	"punctuation_bind": {
		Match: `(?<![=!><])=(?![=~])`,
		Name:  "punctuation.bind",
	},
	"punctuation_comma": {
		Match: `,`,
		Name:  "punctuation.separator",
	},
	"punctuation_isa": {
		Match: `(?<!:)::(?!:)`,
		Name:  "punctuation.isa",
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
	"selector": {
		Match: `(?<!\.)(\.)(` + identAny + `)` + afterIdent,
		Captures: Captures{
			1: Capture{Name: "punctuation.accessor"},
			2: Capture{Name: "variable.other.member"},
		},
	},
	"string": {
		Patterns: StringRules(1),
	},
	"string_backtick": {
		Begin: "`",
		BeginCaptures: Captures{
			0: Capture{Name: "punctuation.definition.string.begin"},
		},
		End: "`",
		EndCaptures: Captures{
			0: Capture{Name: "punctuation.definition.string.end"},
		},
		ContentName: "string.quoted.backtick",
		Name:        "meta.string",
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
	beforeIdent = `(?<!` + identChar + `)`
	afterIdent  = `(?!` + identChar + `)`
)

const (
	identChar     = `[\p{L}\p{Nd}_]`
	identExported = `\p{Lu}` + identChar + `*`
	identLocal    = `\p{Ll}` + identChar + `*`
	identNormal   = `\p{L}` + identChar + `*`
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
	siSuffix    = `(?:[KMGTPEYZ]i?)`
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
	return Rules{
		{
			Match: `\\` + hashes + `(?:` + quote + `|` + escapeCommon + `)`,
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
				"#expression",
				"#invalid_in_parens",
			),
			Name: "meta.interpolation",
		},
		{
			Match: `\\` + hashes + `.`,
			Name:  "invalid.illegal",
		},
	}
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
	rules := make(Rules, 0, maxHashes*4+1)
	for h := maxHashes; h >= 0; h-- {
		rules = append(rules,
			StringRule("double-multiline", h),
			StringRule("double", h),
			StringRule("single-multiline", h),
			StringRule("single", h),
		)
	}
	return append(rules, Rule{Include: "#string_backtick"})
}
