package project

// versions specifies various tooling versions required for contributing
// to this project.
//
// TODO: provide a direnv-like way of allowing developers to bootstrap tooling
// versions without need CUE to evaluate, or move the contrib.versions data to
// a JSON file and embed (probably better).
contrib: versions: {
	cue: v:  "v0.11.0"
	go: v:   "go1.23.1"
	node: v: "v20.17.0"
}
