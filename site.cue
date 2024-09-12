package site

// versions specifies various tooling versions required for contributing
// to this project.
//
// TODO: provide a direnv-like way of allowing developers to bootstrap tooling
// versions without need CUE to evaluate, or move the contrib.versions data to
// a JSON file and embed (probably better).
contrib: versions: {
	cue: {
		v: "0.10.0"
	}
	go: {
		v: "1.23.1"
	}
	node: {
		v: "20.17.0"
	}
}
