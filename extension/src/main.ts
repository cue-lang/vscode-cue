'use strict';

import * as vscode from 'vscode';
import * as path from 'node:path';
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
// This will probably come back to bite us down the line, but, like vscode-go,
// we use global state for the extension. One of the nice side effects
// (drivers?) is to make writing code cleaner. It might seem like a small
// thing, but having 99% of code indented within a class or namespace becomes a
// tiring waste of space, coming from Go. This does have the notable side
// effect that we don't have a sensible value for 'this', but given that global
// state is always available, this doesn't feel like a big loss.
//
// In a similar vein, everything will start in a single .ts file to avoid the
// mess of importing from multiple files in the same directory (I can't seem to
// find a clean analog for Go's packages).
//
// Extension instances and configuration
// =====================================
// Every VSCode window is in one of three modes:
//
// 1. folder mode - when a single folder has been opened.
// 2. workspace mode - a specific .code-workspace is open.
// 3. untitled workspace mode
//
// Workspace mode supports there being multiple workspace folders open.
//
// For now, we do not support untitled workspace mode. This might change in the
// future, especially when we understand the implications for the LSP server.
//
// In either folder or workspace mode, at most a single instance of the CUE
// extension may be running. It is possible for a user to disable extensions on
// a per folder/workspace basis.
//
// TODO: better understand (and point users towards documentation on) how the
// effective extension instance configuration is resolved in workspace mode
// where there are multiple folders, especially folders with settings that
// conflict. This feels like very much an edge case, but at least for now we
// log the effective extension configuration so it will be clear what
// configuration is being used.
//
// Logging errors vs showing errors
// ================================
// We don't have a well-established pattern in this space yet, so this comment
// is really designed to capture the high-level thinking in one place. It is
// very much open to revision:
//
// 1. If the user has invokved a command provided by this extension, and the
//    error occurs during the excution of the command, use showErrorMessage.
// 2. If an error occurs during startup, use showErrorMessage.
// 3. Otherwise log errors in the output using output.error.
//
// In the case that showErrorMessage is used to "handle" the error, it is generally
// incorrect to also then reject a promise. For example, if a command handler
// deals with an error by informing the user via showErrorMessage, but it
// also then returns a rejected promise in the handler, the end user will get:
//
// * a popup error modal dialog wtih an 'ok' button directing the user to
//  consult the output window. This corresponds to the rejected promise.
// * a non-modal elegant error message popup bottom right, informing them of
//    the error message.
//
// We are fully in control of the style, options in the second case and not the
// first. Hence showErrorMessage should generally be accompanied by a resolved
// promise, indicating the error has been handled.
//
// Code error-handling style
// =========================
// We also look to follow a Go-style approach to errors. The situations where
// async functions are required are defined for us by the VSCode extension
// "API". Within the extension code we chose to await async functions rather
// than chaining promises. Furthermore, we use the ve() utility function to
// convert an async function that returns a Promise<T> into a Promise<[T,
// Err]>. An await on such a function allows for Go-style error handling,
// checking whether the error value in the tuple is !== null. This works
// especially well with third-party libraries. Note that this pattern is even
// used for async functions that we write: we defensively write those functions
// to behave like regular async functions that return a Promise<T>, and use
// ve() within the extension to translate that into a more readable error
// handling style.
//
// ve() converts a resolve or reject into a resolve that returns the pair of [T
// | null, Err | null]. Therefore, when declaring our own extension-"internal"
// functions, it still makes sense to call ve() in order that we have
// consistency with calls to third-party code. But also to be defensive in case
// such a function is called by third party code (and hence would expect a
// Promise<T> type return).
//
// Promise<void> functions are used when there is no return value. They are
// equivalent to a Go function that results only in an error. In this
// situation, ve() is still used to wrap the call; it translates a
// resolve/reject into a
//
// Output log
// ===========
// An output channel
// (https://code.visualstudio.com/api/references/vscode-api#OutputChannel) is
// used to log useful but non-sensitive information about the extension. In
// case something goes wrong, glancing at the output logs is the first port of
// call to determine what was happening. In VSCode, this output can be seen via
// the 'Output' window, then selecting 'CUE' from the dropdown that allows you
// to select the category of output to view. If the LSP is active, then we
// create a separate output channel for the log messages received from the LSP
// client. That can be seen by selecting 'CUE Language Server'.

// ctx is the global that represents the context of the active extension
// instance. A value of undefined indicates the extension is not active on the
// current system (for example, the current system might not be a supported
// platform or architecture).
var ctx: vscode.ExtensionContext | undefined;

// client is the active LSP client. This variable may only be defined if ctx
// !== undefined. If ctx !== undefined, then a value of undefined for client
// indicates that no LSP client is running.
//
// It might seem a bit odd that this variable is called 'client', so some
// explanation. 'cue lsp' is the LSP server. The VSCode window (whether in
// folder or workspace mode) is ultimately the LSP client. An instance of the
// lcnode.LanguageClient is responsible for starting the LSP server ('cue lsp')
// and acting as the LSP client, translating requests/responses/notifications
// to/from the LSP server into events/changes etc within the VSCode instance.
//
// (We ignore for one second that an instance of 'cue lsp' can act simply as a
// forwarded to a true LSP server. That point can, and is, abstracted away: we
// can simply treat the running 'cue lsp' instance as the LSP server.)
//
// Hence, an instance of this extension is never directly responsible for
// starting the LSP server; everything happens through an instance of the
// lcnode.LanguageClient. Hence the client variable being defined represents
// our proxy for "this extension instance is connected to a CUE LSP server".
var client: lcnode.LanguageClient | undefined;

// clientStateChangeHandler is the event handler that is called back when the
// state of the running LSP client changes.
var clientStateChangeHandler: lcnode.Disposable | undefined;

// config represents the configuration of the active vscode-cue extension instance.
// During activation of the extension instance, we register to receive callbacks
// when the configuration changes, so the config value remains current post activation.
//
// Most notably, this config value is the effective config, post application of
// documented defaults. As such, it is a deep copy of the configuration as reported
// by VSCode, "extended" by the default values we define within the extension.
var config: CueConfiguration;

// configChangeListener is a handler for changes in the extension instance
// configuration. It will only be defined for an active instance of the
// extension.
var configChangeListener: lcnode.Disposable | undefined;

// CueConfiguration corresponds to the type of the configuration of the vscode-cue
// extension.
//
// TODO: keep this in sync with the configuration schema in CUE.
type CueConfiguration = {
	useLanguageServer: boolean;
	languageServerCommand: string[];
	languageServerFlags: string[];
};

// manualLspStop is true when cmdStopLSP has been called. It is reset to false
// only if the LSP is configured to be active and when cmdStartLSP is called.
let manualLspStop = false;

// output is a singleton output channel used for extension logging (at various
// levels) to the user via the 'Output' window, in the 'CUE' context.
let output = vscode.window.createOutputChannel('CUE', { log: true });

// lspOutputChannel is established as a singleton the first time we run cue
// lsp. Log and error output from the running cue lsp instance is logged to the
// output channel, named 'CUE Language Server'.
let lspOutputChannel: vscode.OutputChannel;

// activate is the entrypoint for an instance of the extension. It is part of
// the VSCode extension API.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	// Verify that we are in either folder or workspace mode. For now, untitled
	// workspace mode is not supported, at least until we better understand the
	// implications.
	if (!vscode.workspace.workspaceFolders) {
		vscode.window.showErrorMessage('No workspace or folder open. CUE extension will not activate.');
		return Promise.resolve();
	}

	output.info('extension activated');

	ctx = context;
	configChangeListener = vscode.workspace.onDidChangeConfiguration(extensionConfigurationChange);
	ctx!.subscriptions.push(configChangeListener);

	registerCommand('vscode-cue.welcome', cmdWelcomeCUE);
	registerCommand('vscode-cue.startlsp', cmdStartLSP);
	registerCommand('vscode-cue.stoplsp', cmdStopLSP);

	// TODO(myitcv): in the early days of 'cue lsp', it might be worthwhile
	// adding a command that toggles the enabled-ness of the LSP in the active
	// workspace/folder, i.e. sets 'cue.useLanguageServer' in either workspace or
	// folder configuration for the user, toggling any existing value, and
	// starting/stopping the instance as appropriate given the resulting state.

	// Manually trigger a configuration changed event.
	extensionConfigurationChange(undefined);
}

// deactivate is called when the extension instance is shutting down. It is
// part of the VSCode extension API.
export async function deactivate(): Promise<void> {
	output.info('vscode-cue deactivate');

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

	output.info('extension deactivated');

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
// command succeeds; commands are often run for their side effects. But per the
// comment on logging vs showing errors above, it often makes sense to show
// error messages to user if that error corresponds directly to the invoking of
// the command, such that the user would otherwise be left surprised if nothing
// happened because of the error.
function registerCommand(cmd: string, callback: (context?: any) => Promise<void>) {
	var disposable = vscode.commands.registerCommand(cmd, callback);
	ctx!.subscriptions.push(disposable);
}

// cmdWelcomeCUE is a basic command that can be used to verify whether the
// vscode-cue extension is loaded at all (beyond checking output logs).
async function cmdWelcomeCUE(context?: any): Promise<void> {
	vscode.window.showInformationMessage('Welcome to CUE!');
	return Promise.resolve();
}

// cmdStartLSP is used to explicitly (re)start the LSP server. It can only be
// called if the extension configuration allows for it.
async function cmdStartLSP(context?: any): Promise<void> {
	if (!config.useLanguageServer) {
		vscode.window.showErrorMessage(`useLanguageServer is configured to false`);
		return Promise.resolve();
	}
	manualLspStop = false;
	return startCueLsp('manually');
}

// cmdStopLSP is used to explicitly stop the LSP server.
async function cmdStopLSP(context?: any): Promise<void> {
	manualLspStop = true;
	return stopCueLsp('manually');
}

// runCueLsp is responsible for starting 'cue lsp'. It stops an existing client
// if there is one, to prevent there being two running instances.
//
// By default, the LSP is started using a version of cmd/cue found in PATH.
//
// TODO: proper error handling strategy here. This is run async from activate
// so updating the user is "up to us". We might need to refine messages that
// are shown, log messages, etc. We will likely refine this error strategy as
// users report problems "in the wild".
async function startCueLsp(source: string = ''): Promise<void> {
	let err;

	if (!config.useLanguageServer || manualLspStop) {
		// Nothing to do. Explicit attempts to start the LSP in this situation are
		// handled elsewhere. And in case the user has manually stopped the LSP,
		// we should only run it if explicitly asked to via a command. And if we
		// had been through that path, then manualLspStop would be false.
		return Promise.resolve();
	}

	if (source !== '') {
		source = `${source} `;
	}

	// Stop the running instance if there is one.
	[, err] = await ve(stopCueLsp());
	if (err !== null) {
		return Promise.reject(err);
	}

	// By the this stage, config represents the defaults-populated configuration
	// we should use. The first element of the languageServerCommand is the
	// command that should be run. We need to handle the normal cases:
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
	// a check to ensure we have at least some LSP support for now,
	// distinguishing from the case where the command is not found (which should,
	// races aside, only happen in case an absolute path is specified and that
	// path does not exist).
	//
	// Note: we do not worry about the working directory here. The command we are
	// running should not care at all about the working directory.
	let cueHelpLsp: Cmd = {
		Args: [command, 'help', 'lsp']
	};
	[, err] = await ve(osexecRun(cueHelpLsp));
	if (err !== null) {
		if (isErrnoException(err)) {
			vscode.window.showErrorMessage(`failed to run ${JSON.stringify(cueHelpLsp)}: ${err}`);
			return Promise.resolve();
		}
		// Probably running an early version of CUE with no LSP support.
		vscode.window.showErrorMessage(
			`the version of cmd/cue at ${JSON.stringify(command)} does not support 'cue lsp'. Please upgrade to at least v0.11.0`
		);
		return Promise.resolve();
	}

	const serverOptions: lcnode.ServerOptions = {
		command: command,
		args: [...config.languageServerCommand.slice(1), ...config.languageServerFlags]

		// NOTE: we do not set the working directory. The 'cue lsp' ignores the
		// working directory and always will. It will always rely on the paths of
		// WorkspaceFolders (and possibly in a fallback scenario the RootURI in the
		// call to Initialize).
	};

	output.info(`${source}starting CUE LSP with server options: ${JSON.stringify(serverOptions, null, 2)}`);

	// Create an output channel for logging, errors etc received from 'cue lsp'
	// and the LanguageClient. To include this in the extension logging would
	// clutter things unncessarily.
	if (lspOutputChannel === undefined) {
		lspOutputChannel = vscode.window.createOutputChannel('CUE Language Server');
	}

	// Options to control the language client. For example, which file events
	// (open, modified etc) get sent to the server.
	const clientOptions: lcnode.LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'cue' }],
		outputChannel: lspOutputChannel
	};

	// Create the language client
	//
	// TODO: properly handle the client/server dying and informing the user,
	// beyond the simple notification of state change.
	client = new lcnode.LanguageClient('cue lsp', 'cue lsp: the CUE Language Server', serverOptions, clientOptions);
	clientStateChangeHandler = client.onDidChangeState(cueLspStateChange);

	// Dispose of the state change handler before the client itself,
	// otherwise we get a notification of a state change when we are
	// disposing of the client (which only happens when the extension
	// is deactivating).
	ctx!.subscriptions.push(clientStateChangeHandler);

	// Start the client, which in turn will start 'cue lsp'
	client.start();
	ctx!.subscriptions.push(client);

	// At this point, all events happend via callbacks in terms of state changes,
	// or the client-server interaction of the LSP protocol.

	return Promise.resolve();
}

// stopCueLsp kills the running LSP client, if there is one.
async function stopCueLsp(source: string = ''): Promise<void> {
	if (client === undefined) {
		return Promise.resolve();
	}

	if (source !== '') {
		source = `${source} `;
	}

	output.info(`${source}stopping cue lsp`);

	// Stop listening to the event first so that we don't trigger a restart
	clientStateChangeHandler!.dispose();

	let err;
	// TODO: use a different timeout?
	[, err] = await ve(client.stop());
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

// humanReadableState returns a human readable version of the language client
// state.
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
	output.info(`cue lsp client state change: from ${oldState} to ${newState}`);
}

// extensionConfigurationChange is the callback that fires when the extension
// instance's configuration has changed, including the initial configuration
// change that happens at activation time.
//
// s will be undefined in the case that extensionConfigurationChange is called
// during activation.
//
// Note that this function updates config with a deep copy of the configuration
// reported by VSCode (then extended with defaults).
async function extensionConfigurationChange(s: vscode.ConfigurationChangeEvent | undefined): Promise<void> {
	// For some unknown reason, we get random callbacks (during development at
	// least) for configuration changes where there is no actual configuration
	// change. That is to say, there is no observable configuration change when
	// considering the concrete configuration, at any point in the configuration
	// graph. This appears to be mitigated by calling
	// s.affectsConfiguration('cue') to determine if there has been a change. We
	// might need to modify this to be a comparison of the net configuration
	// (post applyConfigDefaults) but for now, given the defaults are static, the
	// VSCode check suffices.
	if (s !== undefined && !s.affectsConfiguration('cue')) {
		return Promise.resolve();
	}

	let vscodeConfig = vscode.workspace.getConfiguration('cue');
	let configCopy = JSON.parse(JSON.stringify(vscodeConfig)) as CueConfiguration;
	config = applyConfigDefaults(configCopy);
	output.info(`configuration updated to: ${JSON.stringify(config, null, 2)}`);

	let err;
	if (config.useLanguageServer) {
		// TODO: we might want to revisit just blindly restarting the LSP, for
		// example in case the configuration for the LSP client or server hasn't
		// changed. But for now it's good enough.
		[, err] = await ve(startCueLsp());
	} else {
		[, err] = await ve(stopCueLsp());
	}
	if (err !== null) {
		return Promise.reject(err);
	}

	return Promise.resolve();
}

// applyConfigDefaults updates c to apply defaults. Note this returns a value
// that is only a shallow copy of c. So in effect, the caller must consider
// that c is in effect mutated by a called to applyConfigDefaults, because the
// value return can, in general, cause mutations to c.
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

// Type Cmd is a rip off of os/exec.Cmd.
type Cmd = {
	Args: string[];
	Stdout?: string;
	Stderr?: string;
	Err?: cp.ExecFileException | null;
};

// osexecRun is a Go os/exec.Cmd.Run rip-off, to give a Go-style feel to
// running a process.
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
