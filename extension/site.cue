name:        "cue"
displayName: "CUE"
description: "Rich CUE language support for Visual Studio Code"
version:     "0.0.1"
engines: vscode: "^1.92.0"
categories: [
	"Programming Languages",
]
activationEvents: []
main: "./dist/extension.js"
contributes: {
	languages: [{
		id: "cue"
		aliases: ["CUE", "cue"]
		extensions: [
			".cue",
		]
		configuration: "./language-configuration.json"
	}]
	grammars: [{
		language:  "cue"
		scopeName: "source.cue"
		path:      "./syntaxes/cue.tmLanguage.json"
		embeddedLanguages: "source.cue.embedded": "source.cue"
	}]
	commands: [{
		command: "vscode-cue.welcome"
		title:   "CUE: Welcome"
	}]
}
scripts: {
	"vscode:prepublish": "npm run package"
	compile:             "npm run check-types && npm run lint && node esbuild.js"
	watch:               "npm-run-all -p watch:*"
	"watch:esbuild":     "node esbuild.js --watch"
	"watch:tsc":         "tsc --noEmit --watch --project tsconfig.json"
	package:             "npm run check-types && npm run lint && node esbuild.js --production"
	"compile-tests":     "tsc -p . --outDir out"
	"watch-tests":       "tsc -p . -w --outDir out"
	pretest:             "npm run compile-tests && npm run compile && npm run lint"
	"check-types":       "tsc --noEmit"
	lint:                "eslint src --ext ts"
	test:                "vscode-test"
}
devDependencies: {
	"@types/vscode":                    "^1.92.0"
	"@types/mocha":                     "^10.0.7"
	"@types/node":                      "20.x"
	"@typescript-eslint/eslint-plugin": "^7.14.1"
	"@typescript-eslint/parser":        "^7.11.0"
	eslint:                             "^8.57.0"
	esbuild:                            "^0.21.5"
	"npm-run-all":                      "^4.1.5"
	typescript:                         "^5.4.5"
	"@vscode/test-cli":                 "^0.0.9"
	"@vscode/test-electron":            "^2.4.0"
}
