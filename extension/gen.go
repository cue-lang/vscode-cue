package extension

//go:generate go tool cue cmd genPackageJSON .:extension
//go:generate go tool cue cmd genTS .:extension
//go:generate go tool cue vet -c .:vet
