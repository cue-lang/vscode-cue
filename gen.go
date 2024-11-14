package vscode

//go:generate go run ./internal/cmd/gen-syntax syntaxes/cue.tmLanguage.json
//go:generate cue cmd genManifest
