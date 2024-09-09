package extension

extension: npm: {
	name:        "vscode-cue"
	displayName: "vscode-cue"
	description: "Rich CUE language support for Visual Studio Code"
	repository:  "https://github.com/cue-lang/vscode-cue"
	version:     "0.0.1"
	icon:        "media/white_circle_128.png"
	license:     "MIT"
	publisher:   "cuelangorg"
	engines: vscode: ">=1.63.0"
	categories: [
		"Programming Languages",
	]
	activationEvents: []
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
		commands: [{
			command: "vscode-cue.welcome"
			title:   "CUE: Welcome"
		}]
	}
	scripts: {
		"vscode:prepublish": "npm run package && cue cmd genManifest"
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

	// devDependencies is sort of maintained by npm. We maintain those in a separate file
	// in order that 'cue cmd writeback' can be used to "push" changes from npm back to
	// the source of truth CUE files.
}
