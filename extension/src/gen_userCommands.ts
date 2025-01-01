// Code generated by cue cmd genTS; DO NOT EDIT.

let _config = {"commandTitlePrefix":"CUE: ","commands":{"welcome":{"title":"Welcome"},"startlsp":{"title":"Start CUE LSP"},"stoplsp":{"title":"Stop CUE LSP"}},"npm":{"name":"vscode-cue","displayName":"vscode-cue","description":"CUE language support for Visual Studio Code","repository":"https://github.com/cue-lang/vscode-cue","version":"0.0.8","icon":"media/white_circle_128.png","license":"MIT","publisher":"cuelangorg","engines":{"vscode":">=1.85.0"},"categories":["Programming Languages"],"activationEvents":["onLanguage:cue"],"main":"./dist/main.js","contributes":{"languages":[{"id":"cue","aliases":["CUE","cue"],"extensions":[".cue"],"configuration":"./language-configuration.json"}],"grammars":[{"language":"cue","scopeName":"source.cue","path":"./syntaxes/cue.tmLanguage.json","embeddedLanguages":{"source.cue.embedded":"source.cue"}}],"commands":[{"command":"vscode-cue.startlsp","title":"CUE: : Start CUE LSP"},{"command":"vscode-cue.stoplsp","title":"CUE: : Stop CUE LSP"},{"command":"vscode-cue.welcome","title":"CUE: : Welcome"}],"configuration":{"type":"object","title":"CUE","properties":{"cue.useLanguageServer":{"type":"boolean","default":true,"description":"Enable cue lsp, the language server for CUE."},"cue.cueCommand":{"type":"string","default":"cue","description":"The command or path used to run the CUE command, cmd/cue"},"cue.languageServerFlags":{"type":"array","default":[],"description":"Flags like -rpc.trace and -logfile to be used while running the language server."}}}},"scripts":{"vscode:prepublish":"cue cmd genPackageJSON && npm run clean && npm run buildpackage","clean":"rm -rf dist","compile":"npm run check-types && npm run lint && node esbuild.js","watch":"npm-run-all -p watch:*","watch:esbuild":"node esbuild.js --watch","watch:tsc":"tsc --noEmit --watch --project tsconfig.json","buildpackage":"npm run check-types && npm run lint && node esbuild.js --production","package":"vsce package && cue cmd genManifest","publish":"vsce publish","compile-tests":"tsc -p . --outDir out","watch-tests":"tsc -p . -w --outDir out","pretest":"npm run compile-tests && npm run compile && npm run lint","check-types":"tsc --noEmit","lint":"eslint src --ext ts","test":"vscode-test","format":"prettier --write \"src/**/*.ts\" --ignore-path ../.prettierignore"},"devDependencies":{"@types/mocha":"10.0.7","@types/node":"22.9.1","@types/vscode":"1.85.0","@typescript-eslint/eslint-plugin":"7.14.1","@typescript-eslint/parser":"7.11.0","@vscode/test-cli":"0.0.9","@vscode/test-electron":"2.4.0","@vscode/vsce":"3.2.1","esbuild":"0.21.5","eslint":"8.57.0","npm-run-all":"4.1.5","typescript":"5.4.5","@types/which":"3.0.4","vscode-languageclient":"9.0.1","which":"5.0.0"}}};
export const config: Readonly<typeof _config> = Object.freeze(_config);
