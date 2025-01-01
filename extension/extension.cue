package extension

import (
	"list"
)

// TODO(myitcv): generate a CUE schema, because there does not appear to be a
// JSON Schema or other schema for validating VSCode extensions.

extension: commandTitlePrefix: "CUE: "

extension: commands: [string]: {
	// Title is the non-prefixed title to use for the command.
	// commandTitlePrefix will be templated into the npm configuration.
	title!: string
}

extension: commands: {
	welcome: title:  "Welcome"
	startlsp: title: "Start CUE LSP"
	stoplsp: title:  "Stop CUE LSP"
}

extension: npm: {
	name:        "vscode-cue"
	displayName: name
	description: "CUE language support for Visual Studio Code"
	repository:  "https://github.com/cue-lang/vscode-cue"
	version:     "0.0.8"
	icon:        "media/white_circle_128.png"
	license:     "MIT"
	publisher:   "cuelangorg"
	engines: vscode: ">=\(devDependencies["@types/vscode"])"
	categories: [
		"Programming Languages",
	]
	activationEvents: [
		"onLanguage:cue",
	]
	main: "./dist/main.js"
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

		// sort the commands by id for stability
		let sortedKeys = list.SortStrings([
			for k, _ in extension.commands {k},
		])
		commands: [
			for _, k in sortedKeys
			let v = extension.commands[k] {
				command: "\(npm.name).\(k)"
				title:   "\(extension.commandTitlePrefix): \(v.title)"
			},
		]

		// TODO(myitcv): maintain this schema as CUE, and export to JSON Schema
		// when generating package.json when CUE can do this. Doing so will also
		// require a more complete understanding of the dot-separated field names
		// used below; for example, are these top-level only?
		configuration: {
			type:  "object"
			title: "CUE"
			properties: {
				"cue.useLanguageServer": {
					type:        "boolean"
					default:     true
					description: "Enable cue lsp, the language server for CUE."
				}
				"cue.cueCommand": {
					type:        "string"
					default:     "cue"
					description: "The command or path used to run the CUE command, cmd/cue"
				}
				"cue.languageServerFlags": {
					type: "array"
					default: []
					description: "Flags like -rpc.trace and -logfile to be used while running the language server."
				}
			}
		}
	}
	scripts: {
		"vscode:prepublish": "cue cmd genPackageJSON && npm run clean && npm run buildpackage"
		clean:               "rm -rf dist"
		compile:             "npm run check-types && npm run lint && node esbuild.js"
		watch:               "npm-run-all -p watch:*"
		"watch:esbuild":     "node esbuild.js --watch"
		"watch:tsc":         "tsc --noEmit --watch --project tsconfig.json"
		buildpackage:        "npm run check-types && npm run lint && node esbuild.js --production"
		package:             "vsce package && cue cmd genManifest"
		publish:             "vsce publish"
		"compile-tests":     "tsc -p . --outDir out"
		"watch-tests":       "tsc -p . -w --outDir out"
		pretest:             "npm run compile-tests && npm run compile && npm run lint"
		"check-types":       "tsc --noEmit"
		lint:                "eslint src --ext ts"
		test:                "vscode-test"
		format:              "prettier --write \"src/**/*.ts\" --ignore-path ../.prettierignore"
	}

	// devDependencies is sort of maintained by npm. We maintain those in a
	// separate file in order that 'cue cmd writeback' can be used to "push"
	// changes from npm back to the source of truth CUE files.
	devDependencies: _
}
