package extension

import (
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
		contents: ls.stdout
	}
}
