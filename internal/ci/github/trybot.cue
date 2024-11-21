// Copyright 2023 The CUE Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package github

import (
	"list"
	"strings"

	"github.com/cue-tmp/jsonschema-pub/exp1/githubactions"
)

// The trybot workflow.
workflows: trybot: _repo.bashWorkflow & {
	name: _repo.trybot.name

	on: {
		push: {
			tags: [_repo.releaseTagPattern]
			branches: list.Concat([[_repo.testDefaultBranch], _repo.protectedBranchPatterns]) // do not run PR branches
		}
		pull_request: {}
	}

	jobs: test: {
		"runs-on": _repo.linuxMachine

		let runnerOSExpr = "runner.os"
		let runnerOSVal = "${{ \(runnerOSExpr) }}"

		// The repo config holds the standard string representation of a Go
		// version. setup-go, rather unhelpfully, strips the "go" prefix.
		let goVersion = strings.TrimPrefix(_repo.goVersion, "go")

		let _setupGoActionsCaches = _repo.setupGoActionsCaches & {
			#goVersion: goVersion
			#os:        runnerOSVal
			_
		}
		let installGo = _repo.installGo & {
			#setupGo: with: "go-version": goVersion
			_
		}

		// Only run the trybot workflow if we have the trybot trailer, or
		// if we have no special trailers. Note this condition applies
		// after and in addition to the "on" condition above.
		if: "\(_repo.containsTrybotTrailer) || ! \(_repo.containsDispatchTrailer)"

		// Update PATH to add node_modules/.bin, for both the root level
		// package.json used for tooling, and within the extension.
		let npmSetup = {
			name: "Add node_modules/.bin to PATH and npm ci"
			run: """
				echo "PATH=$PWD/node_modules/.bin:$PATH" >> $GITHUB_ENV
				npm ci
				"""
		}

		let extensionStep = {
			"working-directory": "extension"
		}
		let releaseStep = extensionStep & {
			if: _repo.isReleaseTag
		}

		steps: [
			for v in _repo.checkoutCode {v},

			// Install and setup Go
			for v in installGo {v},
			for v in _setupGoActionsCaches {v},

			// CUE setup
			_installCUE,

			// Node setup
			_installNode,

			_repo.earlyChecks,

			_centralRegistryLogin,

			npmSetup,
			extensionStep & npmSetup,

			// Go steps - currently independent of the extension
			{
				name: "Verify"
				run:  "go mod verify"
			},
			{
				name: "Generate"
				run:  "go generate ./..."
			},
			{
				name: "Test"
				run:  "go test ./..."
			},
			{
				name: "Race test"
				run:  "go test -race ./..."
			},
			{
				name: "staticcheck"
				run:  "go run honnef.co/go/tools/cmd/staticcheck@v0.5.1 ./..."
			},
			{
				name: "Tidy"
				run:  "go mod tidy"
			},

			// Extension
			extensionStep & {
				name: "Format"
				run:  "npm run format"
			},
			extensionStep & {
				name: "Compile"
				run:  "npm run compile"
			},
			extensionStep & {
				name: "Extension publish dry-run"
				run:  "npm run package"
			},

			// Final checks
			_repo.checkGitClean,

			// Release steps
			releaseStep & {
				name: "Check version match"
				run:  "cue cmd -t tag=\(_versionRef) checkReleaseVersion"
			},
			releaseStep & {
				name: "Release package"
				run:  "npm run publish -- -p $VSCODE_PAT"
				env: VSCODE_PAT: "${{ secrets.CUECKOO_VSCODE_PAT }}"
			},

		]
	}
}

// _versionRef is a workflow job-runtime expression that evaluates to the git
// tag (version) that is being released
_versionRef: "${GITHUB_REF##refs/tags/}"

_installNode: githubactions.#Step & {
	name: "Install Node"
	uses: "actions/setup-node@v4"
	with: "node-version": strings.TrimPrefix(_repo.nodeVersion, "v")
}

_installCUE: githubactions.#Step & {
	name: "Install CUE"
	uses: "cue-lang/setup-cue@v1.0.1"
	with: version: _repo.cueVersion
}

_centralRegistryLogin: githubactions.#Step & {
	env: {
		// Note: this token has read-only access to the registry
		// and is used only because we need some credentials
		// to pull dependencies from the Central Registry.
		// The token is owned by notcueckoo and described as "ci readonly".
		CUE_TOKEN: "${{ secrets.NOTCUECKOO_CUE_TOKEN }}"
	}
	run: """
		cue login --token=${CUE_TOKEN}
		"""
}
