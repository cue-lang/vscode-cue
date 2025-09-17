package extension

//go:generate go tool cue cmd genPackageJSON
//go:generate go tool cue cmd genTS

// Update package-lock.json from package.json.
// TODO: consider moving inside cue-cmd-genPackageJSON.
//go:generate npm install --silent --package-lock-only
