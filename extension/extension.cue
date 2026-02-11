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
	displayName: "CUE"
	description: "The offical CUE extension for VS Code, providing syntax highlighting and language server integration (LSP) - from the team that builds CUE and cuelang.org"
	repository:  "https://github.com/cue-lang/vscode-cue"
	version:     "0.0.19"
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

		// sort the commands by title for stability
		let _commands = [
			for k, v in extension.commands {
				command: "\(npm.name).\(k)"
				title:   extension.commandTitlePrefix + v.title
			},
		]
		commands: list.Sort(_commands, {
			x:    _
			y:    _
			less: x.title < y.title
		})

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
				"cue.enableEmbeddedFilesSupport": {
					type:        "boolean"
					default:     true
					description: "Enable CUE LSP for JSON and YAML files. When enabled, the CUE language server will provide features for .json, .yaml, and .yml files based on how they are embedded into .cue files."
				}
			}
		}
	}
	scripts: {
		"vscode:prepublish": "go tool cue cmd genPackageJSON && npm run clean && npm run buildpackage"
		clean:               "rm -rf dist"
		compile:             "npm run check-types && npm run lint && node esbuild.js"
		watch:               "npm-run-all -p watch:*"
		"watch:esbuild":     "node esbuild.js --watch"
		"watch:tsc":         "tsc --noEmit --watch --project tsconfig.json"
		buildpackage:        "npm run check-types && npm run lint && node esbuild.js --production"
		package:             "vsce package && go tool cue cmd genManifest"
		"publish:msft":      "vsce publish"
		"publish:ovsx":      "ovsx publish \(extension.npm.name)-\(extension.npm.version).vsix"
		"compile-tests":     "tsc -p . --outDir out"
		"watch-tests":       "tsc -p . -w --outDir out"
		pretest:             "npm run compile-tests && npm run compile && npm run lint"
		"check-types":       "tsc --noEmit"
		lint:                "eslint src --ext ts"
		test:                "vscode-test"
		format:              "prettier --write \"src/**/*.ts\" --ignore-path ../.prettierignore"
	}

	// devDependencies is sort of maintained by npm. We maintain those in a
	// separate file in order that 'cue cmd writebackPackageJSON' can be used to
	// "push" changes from npm back to the source of truth CUE files.
	devDependencies: _
}
