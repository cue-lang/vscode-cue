// package repo contains data values that are common to all CUE configurations
// in this repo. The list of configurations includes GitHub workflows, but also
// things like gerrit configuration etc.
package repo

import (
	"github.com/cue-lang/vscode-cue:extension"
	"github.com/cue-lang/vscode-cue/internal/ci/base"
)

base

githubRepositoryPath: "cue-lang/vscode-cue"

botGitHubUser:      "cueckoo"
botGitHubUserEmail: "cueckoo@gmail.com"

linuxMachine: "ubuntu-22.04"

goVersion:   extension.contrib.versions.go.v
nodeVersion: extension.contrib.versions.node.v
cueVersion:  extension.contrib.versions.cue.v
