// package repo contains data values that are common to all CUE configurations
// in this repo. The list of configurations includes GitHub workflows, but also
// things like gerrit configuration etc.
package repo

import (
	"github.com/cue-lang/vscode-cue:project"
	"github.com/cue-lang/vscode-cue/internal/ci/base"
)

base

githubRepositoryPath: "cue-lang/vscode-cue"

botGitHubUser:      "cueckoo"
botGitHubUserEmail: "cueckoo@gmail.com"

linuxMachine: "ubuntu-22.04"

goVersion:   project.contrib.versions.go.v
nodeVersion: project.contrib.versions.node.v
cueVersion:  project.contrib.versions.cue.v
