package extension

import (
	"strings"

	"tool/exec"
	"tool/file"
)

command: genManifest: {
	ls: exec.Run & {
		cmd: ["vsce", "ls"]
		stdout: string
	}

	redirect: file.Create & {
		filename: "manifest.txt"
		contents: """
		# Code generated by cue cmd genManifest; DO NOT EDIT.
		\(strings.TrimSpace(ls.stdout))
		"""
	}
}