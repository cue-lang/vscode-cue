package extension

extension: npm: {
	name:        "vscode-cue"
	displayName: "vscode-cue"
	description: "CUE language support for Visual Studio Code"
	repository:  "https://github.com/cue-lang/vscode-cue"
	version:     "0.0.3"
	icon:        "media/white_circle_128.png"
	license:     "MIT"
	publisher:   "cuelangorg"
	engines: vscode: ">=1.63.0"
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
		commands: [
			{
				command: "vscode-cue.welcome"
				title:   "CUE: Welcome"
			},
			{
				command: "vscode-cue.startlsp"
				title:   "CUE: Start CUE LSP"
			},
			{
				command: "vscode-cue.stoplsp"
				title:   "CUE: Stop CUE LSP"
			},
			// TODO: see comment above reference to cmdToggleAutoRestartLSP
			// reference in activate function.
			// {
			// 	command: "vscode-cue.toggleautorestart"
			// 	title:   "CUE: Toggle CUE LSP auto-restart"
			// },
		]

		// TODO: switch to being the result of a JSON Schema "export"
		configuration: {
			type:  "object"
			title: "CUE"
			properties: {
				"cue.useLanguageServer": {
					type:        "boolean"
					default:     true
					description: "Enable cuepls, the language server for CUE."
				}
				"cue.languageServerCommand": {
					type: "array"
					default: []
					description: "The command to run to launch the language server."
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
		"vscode:prepublish": "npm run clean && npm run package"
		clean:               "rm -rf dist"
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
		format:              "prettier --write \"src/**/*.ts\""
	}
}
