## Testing

For now, we do not have any (meaningful) end-to-end/integration tests. For now
therefore we run through the following scenarios offline using VSCode. This list
could/should form the basis for the later addition of real automated tests that
cover these situations:

1. Ensuring that we get an error message when opening a CUE file in untitled
   workspace mode (see comment 'Extension instances and configuration').
2. Ensuring that we get an error message when trying to start the LSP via the
   command, but in a configuration state of `useLanguageServer: false`.
3. Ensuring we get an error message when the cmd/cue version used does not
   support the LSP (as determined by `cue help lsp` returning an error). e.g.
   by using v0.10.0.
4. Ensuring we get an error when the configured `languageServerCommand` is a
   non-simple relative path, e.g. `./cue`.
5. Verifying that the extension sees and response to runtime configuration
   changes.
