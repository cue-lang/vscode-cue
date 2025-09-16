package extension

//go:generate go tool cue cmd genPackageJSON
//go:generate go tool cue cmd genTS

// TODO: replace with a proper CUE constraint + vet.
//go:generate go tool cue export package.json package-lock.json -o gen.go.export.json
//go:generate rm gen.go.export.json
