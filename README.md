# CUE for Visual Studio Code

[The official VS Code CUE extension](https://marketplace.visualstudio.com/items?itemName=cuelangorg.vscode-cue)
provides rich language support for
[the CUE language](https://cuelang.org/)
through syntax highlighting and language server (LSP) integration.

## What is CUE?

CUE makes it easy to validate data, write schemas, and ensure configurations
align with policies.

CUE works with a wide range of tools and formats that you're already using such
as Go, JSON, YAML, OpenAPI, and JSON Schema.

For more information and documentation, including __tutorials and guides__, see
[cuelang.org](https://cuelang.org).

## Quick Start

1. Make sure you have
   [CUE installed](https://cuelang.org/docs/introduction/installation/) on the
   computer that's running VS Code. We recommend installing the latest version.

1. Install the
   [VS Code CUE extension](https://marketplace.visualstudio.com/items?itemName=cuelangorg.vscode-cue).

1. Open any CUE file to automatically activate the extension. The CUE
   status bar appears in the bottom right corner of the window and displays your
   CUE version. The :zap: sign next to the CUE version indicates the language
   server is running, and you are ready to go.

1. Use the Command Palette, `Shift+Command+P` (Mac) / `Ctrl+Shift+P`
   (Windows/Linux), to run CUE-specific commands. Find them through their
   common `CUE: ` prefix.

For more details on configuring and using the CUE language server, see
[LSP: Getting started](https://github.com/cue-lang/cue/wiki/LSP:-Getting-started).

## Configuration

The extension can be configured through VS Code settings. Access settings via:
- `Code` → `Preferences` → `Settings` (Mac)
- `File` → `Preferences` → `Settings` (Windows/Linux)

### CUE Binary Path

By default, the extension uses the `cue` command from your system PATH. You can customize this using the `cue.cueCommand` setting to point to a specific CUE installation.

**Supported path formats:**

1. **VS Code Variables** (recommended for portability):
   ```json
   {
     "cue.cueCommand": "${workspaceFolder}/bin/cue"
   }
   ```
   ```json
   {
     "cue.cueCommand": "${workspaceFolder:my-folder}/bin/cue"
   }
   ```

   ```json
   {
     "cue.cueCommand": "${userHome}/.local/bin/cue"
   }
   ```

2. **Absolute paths**:
   ```json
   {
     "cue.cueCommand": "/usr/local/bin/cue"
   }
   ```

3. **PATH-resolved commands** (default):
   ```json
   {
     "cue.cueCommand": "cue"
   }
   ```

**Supported VS Code variables:**
- `${workspaceFolder}` - The path of the first workspace folder
- `${workspaceFolder:name}` - The path of the workspace folder named `name` in a multi-root setup
- `${userHome}` - The user's home directory

Any other `${...}` variable, or a variable that cannot be resolved (for
example a workspace folder name that does not match), is reported as an
error. Relative paths such as `./bin/cue` are not supported; use a
variable to construct an absolute path instead, e.g.
`${workspaceFolder}/bin/cue`.

### Other Settings

- `cue.useLanguageServer` - Enable/disable the CUE language server (default: `true`)
- `cue.languageServerFlags` - Additional flags to pass to the language server (e.g., `["-rpc.trace"]`)
- `cue.enableEmbeddedFilesSupport` - Enable CUE LSP for JSON and YAML files (default: `true`)

## Feedback

We welcome feedback on your experience with the extension.
Please file bug reports and share ideas via
[issues](https://cuelang.org/issues) and
[discussions](https://cuelang.org/discussions)
in the main CUE repository.

## Credits

This project was started by
[betawaffle](https://github.com/betawaffle)
who graciously permitted that it be moved to be part of
[the CUE project](https://cuelang.org).

## Contributing

See [Contributing](https://github.com/cue-lang/vscode-cue/wiki/Contributing).
