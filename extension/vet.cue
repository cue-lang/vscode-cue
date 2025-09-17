@extern(embed)
package vet

import "github.com/cue-lang/vscode-cue/extension"

packageJson:     _packageJsonSchema     @embed(file=package.json)
packageLockJson: _packageLockJsonSchema @embed(file=package-lock.json)

_packageJsonSchema: version!: extension.extension.npm.version
_packageLockJsonSchema: _packageJsonSchema & {
	packages!: ""!: version!: extension.extension.npm.version
}
