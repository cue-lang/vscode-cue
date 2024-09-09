'use strict';

import * as tar from 'tar';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import crypto = require('crypto');
import * as stream from 'node:stream';
import which from 'which';
import * as cp from 'node:child_process';

import * as lcnode from 'vscode-languageclient/node';
import * as lc from 'vscode-languageclient';

// Note by myitcv
// ==============
// I am not good with TypeScript. I struggle with writing idiomatic code. Truth
// be told I would prefer to have written this extension in Go and use GopherJS
// to transpile to JavaScript. But that's for another day. Any poor style, etc,
// is my own.
//
// Structure of the extension
// ==========================
// This will probably come back to bite us down the line, but we use global
// state for the extension to make writing code cleaner. It might seem like a
// small thing, but having 99% of code indented within a class or namespace
// becomes a tiring waste of space, coming from Go. This does have the notable
// side effect that we don't have a sensible value for 'this', but given that
// global state is always available, this doesn't feel like a big loss.
//
// In a similar vein, everything will start in a single .ts file to avoid the
// mess of importing from multiple files in the same directory (I can't seem to
// find a clean analog for Go's packages).
//
// Error style
// -----------
// We also look to follow a Go-style approach to errors. The situations where
// async functions are required are defined for us by the VSCode extension
// model. Within the extension code we chose to await async functions rather
// than chaining promises. Furthermore, we use the ve() utility function to
// convert an async function that returns a Promise<T> into a Promise<[T,
// Err]>. An await on such a function allows for Go-style error handling,
// checking whether the error value in the tuple is !== null. This works
// especially well with third-party libraries.
//
// ve() converst a resolve or reject into a resolve that returns the pair of [T
// | null, Err | null]. Therefore, when declaring our own extension-"internal"
// functions, it still makes sense to call ve() in order that we have
// consistency with calls to third-party code.
//
// Promise<void> functions are used when there is no return value. They are
// equivalent to a Go function that results only in an error. In this
// situation, ve() is still used to wrap the call; it translates a
// resolve/reject into a
//
// Console log
// -----------
// console.log calls are used to log useful but non-sensitive information in a
// non-verbose manner. In case something goes wrong, glancing at the console
// logs is the first port of call to determine what was happening.

// ctx is the global that represents the context of the active extension.
//
// A value of undefined indicates the extension is not active on the current
// system (for example, the current system might not be a supported platform or
// architecture).
var ctx: vscode.ExtensionContext | undefined;

// client is the running LSP client. This variable may only be defined if ctx
// !== undefined. If ctx !== undefined, then a value of undefined for client
// indicates that no LSP client is running.
var client: lcnode.LanguageClient | undefined;

var clientStateChangeHandler: lcnode.Disposable | undefined;

// config represents the configuration of the vscode-cue extension as loaded
// at activation time.
//
// TODO: handle dynamic changes in configuration. Some may require a restart
// (or stopping) of 'cue lsp'.
var config: CueConfiguration;

// CueConfiguration corresponds to the type of the configuration of the vscode-cue
// extension.
//
// TODO: keep this in sync with the configuration schema in CUE.
// type CueConfiguration = {
type CueConfiguration = {
  useLanguageServer: boolean;
  languageServerCommand: string[];
  languageServerFlags: string[];
};

export async function activate(context: vscode.ExtensionContext): Promise<undefined> {
  config = applyConfigDefaults(vscode.workspace.getConfiguration('cue') as unknown as CueConfiguration);

  console.log(`vscode-cue activated with configuration: ${JSON.stringify(config, null, 2)}`);

  // Only set ctx now that we know this is a supported platform.
  ctx = context;

  registerCommand('vscode-cue.welcome', cmdWelcomeCUE);
  registerCommand('vscode-cue.startlsp', cmdStartLSP);
  registerCommand('vscode-cue.stoplsp', cmdStopLSP);

  // run 'cue lsp' async from the main activate thread
  runCueLsp();
}

// applyConfigDefaults updates c to apply defaults. Note this mutates c, which
// it is assumed is safe because the value will have come from a call to
// getConfiguration.
function applyConfigDefaults(c: CueConfiguration): CueConfiguration {
  const defaultConfig: CueConfiguration = {
    languageServerCommand: ['cue', 'lsp'],
    languageServerFlags: [],
    useLanguageServer: true
  };

  // TODO: switch to using CUE as the source of truth for defaults (somehow)
  return {
    ...defaultConfig,
    ...c
  };
}

export async function deactivate(): Promise<undefined> {
  if (ctx === undefined) {
    // Nothing to do
    return Promise.resolve(undefined);
  }

  // TODO: unclear where this is documented, but it appears that disposable things
  // disposed _after_ a call to deactivate. That probably makes sense... but we need
  // to be careful about the invariants on state.
  //
  // On a related point, we do not dispose of things ourselves here, instead we rely
  // on the registration of "things to dispose". Hopefully we get the order right.
  ctx = undefined;

  console.log('vscode-cue deactivated');

  return Promise.resolve(undefined);
}

// registerCommand is a light wrapper around the vscode API for registering a
// command but also simultaneously adding a dispose callback.
//
// TODO(myitcv): it isn't really documented anywhere, but the expected signature
// of callback is:
//
//     (context?: any) => void | Thenable<void>
//
// Where context represents any arguments passed to the command when it is executed.
// For now, we consistently use the signature:
//
//     (context?: any) => Promise<void>
//
// This forces the style of always returning a Promise. The rejection of a
// promise handles the error case. There is nothing to return/do in the case a
// command succeeds; commands are often run for their side effects.
function registerCommand(cmd: string, callback: (context?: any) => Promise<void>) {
  var disposable = vscode.commands.registerCommand(cmd, callback);
  ctx!.subscriptions.push(disposable);
}

// cmdWelcomeCUE is a basic command that can be used to verify whether the
// vscode-cue extension is loaded at all.
async function cmdWelcomeCUE(context?: any): Promise<void> {
  vscode.window.showInformationMessage('Welcome to CUE!');
  return Promise.resolve();
}

// cmdStartLSP is used to explicitly (re)start the LSP server.
async function cmdStartLSP(context?: any): Promise<void> {
  if (!config.useLanguageServer) {
    // TODO(myitcv): should we instead return an error here? be
    // showErrorMessage instead? Possibly, because the running of a command is
    // non-blocking AFAICT. And consistently using showErrorMessage feels
    // better than
    vscode.window.showErrorMessage(`useLanguageServer is configured to false`);
    return Promise.resolve();
  }
  return runCueLsp();
}

// cmdStopLSP is used to explicitly stop the LSP server.
async function cmdStopLSP(context?: any): Promise<void> {
  return stopCueLsp();
}

// runCueLsp is responsible for starting 'cue lsp'. It stops an existing client
// if there is one, to prevent there being two running instances.
//
// By default, the LSP is started using a version of cmd/cue found in PATH.
//
// TODO: proper error handling strategy here. This is run async from activate
// so updating the user is "up to us". We might need to refine messages that
// are shown, log messages, etc.
async function runCueLsp(): Promise<void> {
  let err, _;

  if (!config.useLanguageServer) {
    // Nothing to do. Explicit attempts to start the LSP in this situation are
    // handled elsewhere.
    return Promise.resolve();
  }

  // Stop the running instance if there is one.
  [_, err] = await ve(stopCueLsp());
  if (err !== null) {
    return Promise.reject(err);
  }

  // By the this stage, config represents the defaults-populated configuration
  // we should use. The first element of the languageServerCommand is the command
  // that should be run. We need to handle the normal cases:
  //
  // 1. cue - a simple relative path, no slashes
  // 2. ./relative/path/to/cue - a non-simple (!) relative path, >=1 slashes
  // 3. /absolute/path/to/cue - absolute filepath
  //
  // For now, we err on the side of caution by only allowing simple relative
  // and absolute file paths. Reason being, it's not clear (yet) what this
  // means in the case of the running VSCode, workspace etc. And we might want
  // to support expanding special VSCode variables in the path.

  let command = config.languageServerCommand[0];

  if (!path.isAbsolute(command) && command.includes(path.sep)) {
    vscode.window.showErrorMessage(
      `invalid command path ${JSON.stringify(command)}; only simple relative or absolute file paths supported`
    );
    return Promise.resolve();
  }

  if (!path.isAbsolute(command)) {
    let resolvedCommand: string | null;
    [resolvedCommand, err] = await ve(which(command));
    if (err !== null) {
      vscode.window.showErrorMessage(`failed to find ${JSON.stringify(command)} in PATH: ${err}`);
      return Promise.resolve();
    }
    command = resolvedCommand!;
  }

  // TODO(myitcv): version-related checks would go here. Run 'cue help lsp' as
  // a check to ensure we have at least some LSP support for now, distinguishing
  // from the case where the command is not found (which should, races aside, only
  // happen in case an absolute path is specified and that path does not exist).
  //
  // Note: we do not worry about the working directory here. The command we are running
  // should not care at all about the working directory.
  let cueHelpLsp: Cmd = {
    Args: [command, 'help', 'lsp']
  };
  [, err] = await ve(osexecRun(cueHelpLsp));
  if (err !== null) {
    if (isErrnoException(err)) {
      vscode.window.showErrorMessage(`failed to run ${JSON.stringify(command)}: ${err}`);
      return Promise.resolve();
    }
    // Probably running an early version of CUE with no LSP support.
    vscode.window.showErrorMessage(
      `the version of cmd/cue at ${JSON.stringify(command)} does not support 'cue lsp'. Please upgrade to at least v0.11.0`
    );
    return Promise.resolve();
  }

  // If the extension is launched in debug mode then the debug server options
  // are used Otherwise the run options are used
  const serverOptions: lcnode.ServerOptions = {
    command: command,
    args: [...config.languageServerCommand.slice(1), ...config.languageServerFlags]

    // Note: we do not set the working directory. The 'cue lsp' ignores the
    // working directory and always will. It will always rely on the paths of
    // WorkspaceFolders (and possibly in a fallback scenario the RootURI in the
    // call to Initialize).
  };

  console.log(`starting CUE LSP with server options: ${JSON.stringify(serverOptions, null, 2)}`);

  // Options to control the language client. For example, which file events
  // (open, modified etc) get sent to the server.
  const clientOptions: lcnode.LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'cue' }]
  };

  // Create the language client and start the client.
  //
  // TODO: handle the client/server dying and informing the user.
  client = new lcnode.LanguageClient('cue lsp', 'cue lsp: the CUE Language Server', serverOptions, clientOptions);
  clientStateChangeHandler = client.onDidChangeState(cueLspStateChange);

  // Dispose of the state change handler before the client itself,
  // otherwise we get a notification of a state change when we are
  // disposing of the client (which only happens when the extension
  // is deactivating).
  ctx!.subscriptions.push(clientStateChangeHandler);

  client.start();
  ctx!.subscriptions.push(client);

  // At this point, all events happend via callbacks in terms of state changes,
  // or the client-server interaction of the LSP protocol.

  return Promise.resolve();
}

function humanReadableState(s: lcnode.State): string {
  switch (s) {
    case lcnode.State.Running:
      return 'running';
    case lcnode.State.Stopped:
      return 'stopped';
    case lcnode.State.Starting:
      return 'starting';
  }
}

function cueLspStateChange(s: lc.StateChangeEvent): void {
  var oldState = JSON.stringify(humanReadableState(s.oldState));
  var newState = JSON.stringify(humanReadableState(s.newState));
  console.log(`cue lsp client state change: from ${oldState} to ${newState}`);
}

// stopCueLsp kills the running LSP client, if there is one.
async function stopCueLsp(): Promise<void> {
  if (client === undefined) {
    return Promise.resolve();
  }

  // Stop listening to the event first so that we don't trigger a restart
  clientStateChangeHandler!.dispose();

  let _, err;
  // TODO: use a different timeout?
  [_, err] = await ve(client.stop());
  client = undefined;
  clientStateChangeHandler = undefined;
  if (err !== null) {
    // TODO: we get an error message here relating to the process for stopping
    // the server timing out, when providing an argument to stop(). Why? And
    // if that does happen, what can we know about the state of the running
    // process?
    return Promise.reject(new Error(`failed to stop cue lsp: ${err}`));
  }

  return Promise.resolve();
}

type Cmd = {
  Args: string[];
  Stdout?: string;
  Stderr?: string;
  Err?: cp.ExecFileException | null;
};

// osexecRun is a Go os/exec.Cmd.Run rip-off.
async function osexecRun(cmd: Cmd): Promise<void> {
  return new Promise((resolve, reject) => {
    cp.execFile(cmd.Args[0], cmd.Args.slice(1), (err, stdout, stderr) => {
      cmd.Stdout = stdout;
      cmd.Stderr = stderr;
      cmd.Err = err;
      if (err !== null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// isErrnoException helps us check whether an error return from child_process'
// exec-like calls is as a result of ENOENT or not.
//
// https://stackoverflow.com/questions/51523509/in-typescript-how-do-you-make-a-distinction-between-node-and-vanilla-javascript
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    isArbitraryObject(error) &&
    error instanceof Error &&
    (typeof error.errno === 'number' || typeof error.errno === 'undefined') &&
    (typeof error.code === 'string' || typeof error.code === 'undefined') &&
    (typeof error.path === 'string' || typeof error.path === 'undefined') &&
    (typeof error.syscall === 'string' || typeof error.syscall === 'undefined')
  );
}

// ArbitraryObject is used as part of isErrnoException.
type ArbitraryObject = { [key: string]: unknown };

// isArbitraryObject is used as part of isErrnoException.
function isArbitraryObject(potentialObject: unknown): potentialObject is ArbitraryObject {
  return typeof potentialObject === 'object' && potentialObject !== null;
}

// Err is a convenience type for a nullable error, much like error in Go
type Err = Error | null;

// ValErr is convenience type for a nullable [value, error] pair. JavaScript
// does not have zero values and hence we are forced to create a nullable
// type.
type ValErr<T> = [T | null, Error | null];

// ve converts a promise that returns a single value to a promise that returns
// a [value, error] tuple, the error being the value "caught" in case the input
// promise is rejected. When used with 'await', this allows JavaScript-native
// Promise-aware functions that otherwise encourage the use of try-catch with
// 'await' to transform results into a more Go-style of error handling.
//
// TODO: can we be smarter with the Promise<void> case?
function ve<T>(p: Promise<T>): Promise<ValErr<T>> {
  return p.then(
    (v: T) => {
      return [v, null];
    },
    (err) => {
      return [null, err];
    }
  );
}
