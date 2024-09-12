@extern(embed)

package site

import (
	"encoding/json"

	"tool/exec"
	"tool/file"
)

_input: _ @embed(file=package.json)

// gen generates an npm package.json file from the current site configuration.
command: gen: {
	write: file.Create & {
		filename: "package.json"
		contents: json.Indent(json.Marshal(extension.npm), "", "  ")
	}
}

// writeback ensures that the npm.cue file (which belongs to the site
// package) contains the npm-controlled parts of package.json
command: writeback: {
	// extract the relevant config value
	extract: exec.Run & {
		cmd: ["cue", "export", "--out=json", "-e=devDependencies", "package.json"]
		stdout: string
	}
	// place at a path: extension.npm
	place: exec.Run & {
		cmd: ["cue", "export", "--out=cue", "-l=extension:", "-l=npm:", "-l=devDependencies:", "-p=site", "json:", "-"]
		stdin:  extract.stdout
		stdout: string
	}
	// write to the npm.cue file
	write: file.Create & {
		filename: "npm.cue"
		contents: place.stdout
	}
}
