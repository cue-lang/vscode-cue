package extension

//go:generate go tool cue cmd genPackageJSON
//go:generate go tool cue cmd genTS

// Check that the version fields in package.json (driven by CUE) and
// package-lock.json (potentially updated manually) have the same value.
// TODO: replace with a CUE constraint which would permit the use of cue-vet,
// thereby avoiding the use of -o to stop a successful cue-export's output
// being noisily emitted to go-generate's stdout.
//go:generate go tool cue export package.json package-lock.json -o tmp.json
//go:generate rm tmp.json
