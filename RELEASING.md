# Releasing the extension

A release publishes the extension to the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=cuelangorg.vscode-cue)
and the [OpenVSX registry](https://open-vsx.org/extension/cuelangorg/vscode-cue).
Publishing is done by CI: pushing a `v*` tag runs the TryBot workflow
(`.github/workflows/trybot.yaml`, generated from `internal/ci`), which
checks that the tag matches the extension version and then publishes to
both registries.

The extension version is not a true semver version: tags are of the form
`vX.Y.Z` while the version in the extension's configuration is `X.Y.Z`.

## 1. Bump the version

On a work branch off `origin/master`, edit `version` in
`extension/extension.cue`, then regenerate from the repository root:

    go generate ./...

This updates `extension/package.json` (including the `.vsix` filename
in the `publish:ovsx` script), `extension/package-lock.json` and
`extension/src/gen_userCommands.ts`. Commit with a message of the form:

    extension: bump version to vX.Y.Z before release

Mail it with `git codereview mail`, get it reviewed and submit it as
usual. Ideally nothing else lands on `master` between this commit and
the tag, so the release contains exactly what was tested.

## 2. Check that the commit is ready to tag

Fetch, and confirm the bump commit is on `origin/master`:

    git fetch origin
    git log --oneline -3 origin/master

Confirm the post-submit TryBot run for that commit passed on GitHub:

    gh run list --repo cue-lang/vscode-cue --branch master --limit 5

Confirm the tag does not already exist, and that the version check CI
will run passes:

    git ls-remote --tags origin vX.Y.Z    # should print nothing
    cd extension && go tool cue cmd -t tag=vX.Y.Z checkReleaseVersion

## 3. Tag in the GerritHub repository

Tags must be created in the GerritHub repository, never pushed directly
to GitHub. GerritHub is the source of truth and replicates the tag to
the GitHub mirror, and it is the tag arriving on GitHub that starts the
publish.

Creating tags is deliberately restricted: day-to-day accounts cannot
push tags, so the push is done with the separate account set aside for
releases. Tag the bump commit, then push the tag to the GerritHub URL
from `codereview.cfg`, authenticating as that account. Previous
releases use lightweight tags:

    git tag --no-sign vX.Y.Z <sha-of-bump-commit>
    git -c credential.helper= push https://<release-account>@cue.gerrithub.io/a/cue-lang/vscode-cue vX.Y.Z

`--no-sign` keeps the tag lightweight even if `tag.gpgSign` is set in
your git config, which would otherwise make git create a signed,
annotated tag and prompt for a tag message.

Setting `credential.helper` to the empty string disables all configured
credential helpers for that one command, so git prompts for the release
account's password and neither looks it up in nor saves it to a
credential store. The username in the URL takes precedence over any
configured `credential.username`.

## 4. Watch the release workflow

Within a minute or two GerritHub replicates the tag to GitHub (the push
event is attributed to the `cueckoo` user), which starts a TryBot run
for the tag. On a tag, as well as the usual checks, the workflow runs
"Check version match", "Publish extension to the OpenVSX registry" and
"Publish extension to the Microsoft VSCode Marketplace":

    gh run list --repo cue-lang/vscode-cue --branch vX.Y.Z
    gh run watch <run-id> --repo cue-lang/vscode-cue

The publish steps authenticate with the `CUECKOO_OVSX_PAT` and
`CUECKOO_VSCODE_PAT` repository secrets. If a publish step fails with
an authentication error, the relevant token has most likely expired and
needs to be rotated by an organization admin before the run is re-run.
Both registries reject a version that is already published, so if only
one publish step succeeded, re-running the job will fail at that step.

## 5. Verify the published versions

OpenVSX:

    curl -s https://open-vsx.org/api/cuelangorg/vscode-cue | jq -r .version

VS Code Marketplace (it can take a few minutes after the publish step
for the new version to appear):

    curl -s -X POST \
      https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json;api-version=3.0-preview.1' \
      -d '{"filters":[{"criteria":[{"filterType":7,"value":"cuelangorg.vscode-cue"}]}],"flags":1}' |
      jq -r '.results[0].extensions[0].versions[0].version'
