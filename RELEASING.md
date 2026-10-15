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

If either publish step fails, see "If a publish step fails" below.

## 5. Verify the published versions

Each registry can take a few minutes after its publish step before it
lists the new version.

OpenVSX:

    curl -s https://open-vsx.org/api/cuelangorg/vscode-cue | jq -r .version

VS Code Marketplace:

    curl -s -X POST \
      https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json;api-version=3.0-preview.1' \
      -d '{"filters":[{"criteria":[{"filterType":7,"value":"cuelangorg.vscode-cue"}]}],"flags":1}' |
      jq -r '.results[0].extensions[0].versions[0].version'

## If a publish step fails

The step log says why. The most likely cause is an expired token: the
publish steps authenticate with the `CUECKOO_OVSX_PAT` and
`CUECKOO_VSCODE_PAT` secrets of the GitHub repository, and the tokens
in them expire. An expired Marketplace token fails with:

    Access Denied: The Personal Access Token used has expired.

To replace the Marketplace token, someone with access to the
`cuelangorg` publisher creates a new Azure DevOps personal access token
at https://aka.ms/vscodepat, with the organization set to "All
accessible organizations" and the "Marketplace (Manage)" scope. Azure
DevOps tokens last at most a year, so pick a long expiry. Then store it
in the repository secret, which prompts for the value:

    gh secret set CUECKOO_VSCODE_PAT --repo cue-lang/vscode-cue

Once the cause is fixed, how to finish the release depends on how far
the run got. The OpenVSX step runs first, and the Marketplace step is
skipped if it fails.

If the OpenVSX step failed, nothing was published, so re-run the failed
job:

    gh run rerun <run-id> --failed --repo cue-lang/vscode-cue

If the OpenVSX step succeeded but the Marketplace step failed, a re-run
does not help: the OpenVSX step then fails because the version is
already published there, and the Marketplace step is skipped again.
Publish to the Marketplace by hand instead, as described below.

### Publishing to the Marketplace by hand

Publish the exact `.vsix` that CI published to OpenVSX, so that both
registries serve the same file. Download it into an empty directory and
check it against the checksum OpenVSX publishes:

    mkdir vsix-X.Y.Z && cd vsix-X.Y.Z
    curl -fLO https://open-vsx.org/api/cuelangorg/vscode-cue/X.Y.Z/file/cuelangorg.vscode-cue-X.Y.Z.vsix
    echo "$(curl -fsSL https://open-vsx.org/api/cuelangorg/vscode-cue/X.Y.Z/file/cuelangorg.vscode-cue-X.Y.Z.sha256)  cuelangorg.vscode-cue-X.Y.Z.vsix" | sha256sum -c

Then publish it, entering the Marketplace token at the silent prompt.
Use the version of `@vscode/vsce` pinned in `extension/npm.cue`:

    read -rs VSCE_PAT && export VSCE_PAT
    npx -y -p node@22 -p @vscode/vsce@3.2.1 -- vsce publish --packagePath cuelangorg.vscode-cue-X.Y.Z.vsix
    unset VSCE_PAT

`-p node@22` runs vsce on Node 22, as CI does: vsce 3.2.1 fails to
start on Node 26.
