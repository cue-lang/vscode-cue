package project

import (
	"tool/file"
)

// cpLicense ensures that the LICENSE file that exists in the extension
// subdirectory matches that of the repo root. VSCode extensions do not source
// the LICENSE file from a containing git repository (unlike Go), not do tools
// like vsce support specifying the path to the license file. Hence it makes
// most sense to mechanically keep the extension "copy" in absolute sync with
// the repo root, which is the source of truth.
command: cpLicense: {
	read: file.Read & {
		filename: "LICENSE"
		contents: string
	}
	write: file.Create & {
		filename: "extension/LICENSE"
		contents: read.contents
	}
}
