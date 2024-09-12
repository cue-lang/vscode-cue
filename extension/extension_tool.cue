package extension

import (
	"encoding/json"
	"list"
	"strings"

	"tool/exec"
	"tool/file"
)

// genManifest writes out a manifest.txt file that captures the contents
// of the extension. This command should be run after vsce package.
command: genManifest: {
	ls: exec.Run & {
		cmd: ["vsce", "ls"]
		stdout: string
	}

	redirect: file.Create & {
		// Somewhat incredibly, the output from 'vsce ls' does not appear to be stable.
		let trimmed = strings.TrimSpace(ls.stdout)
		let lines = strings.Split(trimmed, "\n")
		let orderedLines = list.SortStrings(lines)
		let ordered = strings.Join(orderedLines, "\n")
		filename: "manifest.txt"
		contents: """
		# Code generated by cue cmd genManifest; DO NOT EDIT.

		\(ordered)

		"""
	}
}

// genPackageJSON generates an npm package.json file from the current site configuration.
command: genPackageJSON: write: file.Create & {
	filename: "package.json"
	contents: json.Indent(json.Marshal(extension.npm), "", "  ")
}

// writebackPackageJSON ensures that the npm.cue file (which belongs to the
// site package) contains the npm-controlled parts of package.json
command: writebackPackageJSON: {
	// extract the relevant config value
	extract: exec.Run & {
		cmd: ["cue", "export", "--out=json", "-e=devDependencies", "package.json"]
		stdout: string
	}
	// place at a path: extension.npm
	place: exec.Run & {
		cmd: ["cue", "export", "--out=cue", "-l=extension:", "-l=npm:", "-l=devDependencies:", "-p=extension", "json:", "-"]
		stdin:  extract.stdout
		stdout: string
	}
	// write to the npm.cue file
	write: file.Create & {
		filename: "npm.cue"
		contents: place.stdout
	}
}
