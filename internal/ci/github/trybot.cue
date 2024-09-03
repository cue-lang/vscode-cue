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

	"github.com/SchemaStore/schemastore/src/schemas/json"
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

	jobs: {
		test: {
			"runs-on": _repo.linuxMachine

			let runnerOSExpr = "runner.os"
			let runnerOSVal = "${{ \(runnerOSExpr) }}"
			let _setupGoActionsCaches = _repo.setupGoActionsCaches & {
				#goVersion: _repo.latestGo
				#os:        runnerOSVal
				_
			}

			// Only run the trybot workflow if we have the trybot trailer, or
			// if we have no special trailers. Note this condition applies
			// after and in addition to the "on" condition above.
			if: "\(_repo.containsTrybotTrailer) || ! \(_repo.containsDispatchTrailer)"

			steps: [
				for v in _repo.checkoutCode {v},

				_repo.installGo & {
					with: "go-version": _repo.latestGo
				},

				for v in _setupGoActionsCaches {v},

				json.#step & {
					name: "Verify"
					run:  "go mod verify"
				},
				json.#step & {
					name: "Generate"
					run:  "go generate ./..."
				},
				json.#step & {
					name: "Test"
					run:  "go test ./..."
				},
				json.#step & {
					name: "Race test"
					run:  "go test -race ./..."
				},
				json.#step & {
					name: "staticcheck"
					run:  "go run honnef.co/go/tools/cmd/staticcheck@v0.4.3 ./..."
				},
				json.#step & {
					name: "Tidy"
					run:  "go mod tidy"
				},
				_repo.checkGitClean,
			]
		}
	}
}
