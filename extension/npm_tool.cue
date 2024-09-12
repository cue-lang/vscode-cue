@extern(embed)

package site

_input: _ @embed(file=package.json)

// writeback ensures that the npm.cue file (which belongs to the site
// package) contains the npm-controlled parts of package.json
command: writeback: {}
