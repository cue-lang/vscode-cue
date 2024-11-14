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

	"github.com/cue-tmp/jsonschema-pub/exp1/githubactions"
)

// The trybot workflow.
workflows: trybot: _repo.bashWorkflow & {
	name: _repo.trybot.name

	on: {
		push: {
			branches: list.Concat([[_repo.testDefaultBranch], _repo.protectedBranchPatterns]) // do not run PR branches
		}
		pull_request: {}
	}

	jobs: test: {
		"runs-on": _repo.linuxMachine

		let runnerOSExpr = "runner.os"
		let runnerOSVal = "${{ \(runnerOSExpr) }}"
		let _setupGoActionsCaches = _repo.setupGoActionsCaches & {
			#goVersion: _repo.latestGo
			#os:        runnerOSVal
			_
		}
		let installGo = _repo.installGo & {
			#setupGo: with: "go-version": _repo.latestGo
			_
		}

		// Only run the trybot workflow if we have the trybot trailer, or
		// if we have no special trailers. Note this condition applies
		// after and in addition to the "on" condition above.
		if: "\(_repo.containsTrybotTrailer) || ! \(_repo.containsDispatchTrailer)"

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

			// Go steps - currently independent of the extension
			githubactions.#Step & {
				name: "Verify"
				run:  "go mod verify"
			},
			_registryReadOnlyAccessStep & {
				name: "Generate"
				_run: "go generate ./..."
			},
			githubactions.#Step & {
				name: "Test"
				run:  "go test ./..."
			},
			githubactions.#Step & {
				name: "Race test"
				run:  "go test -race ./..."
			},
			githubactions.#Step & {
				name: "staticcheck"
				run:  "go run honnef.co/go/tools/cmd/staticcheck@v0.5.1 ./..."
			},
			githubactions.#Step & {
				name: "Tidy"
				run:  "go mod tidy"
			},

			// Extension
			githubactions.#Step & {
				name: "npm install"
				run:  "npm ci"
			},
			githubactions.#Step & {
				name: "Update manifest.txt"
				run:  "cue cmd genManifest"
			},
			githubactions.#Step & {
				name: "Extension publish dry-run"
				run:  "vsce package"
			},

			// Final checks
			_repo.checkGitClean,
		]
	}
}

_installNode: githubactions.#Step & {
	name: "Install Node"
	uses: "actions/setup-node@v4"
	with: "node-version": _repo.nodeVersion
}

_installCUE: githubactions.#Step & {
	name: "Install CUE"
	uses: "cue-lang/setup-cue@v1.0.1"
	with: version: "v0.11.0-rc.1"
}
