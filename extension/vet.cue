@extern(embed)
package extension

#packageJson:     _packageJson     @embed(file=package.json)
#packageLockJson: _packageLockJson @embed(file=package-lock.json)

_packageJson: {
	version: extension.npm.version
}

_packageLockJson: {
	version: extension.npm.version
	packages: "": version: extension.npm.version
}
