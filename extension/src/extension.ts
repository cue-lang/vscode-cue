// Copyright 2024 The CUE Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

import * as path from 'node:path';
import which from 'which';
import * as vscode from 'vscode';
import * as lcnode from 'vscode-languageclient/node';
import * as cp from 'node:child_process';
import * as lc from 'vscode-languageclient';

let errTornDown = new Error('Extenssion instance already torn down');

// An instance of Extension represents the active instance (!!) of the VSCode
// extension that is this project. An instance of Extension is created when the
// extension is activated, and tearDown-ed when the extension is deactivated.
export class Extension {
	// ctx is the context of the active extension instance passed at
	// activate-time.
	private ctx: vscode.ExtensionContext;

	// client is the active LSP client. A value of undefined for client indicates
	// that no LSP client is running.
	//
	// It might seem a bit odd that this variable is called 'client', so some
	// explanation. 'cue lsp' is the LSP server. The VSCode window (whether in
	// folder or workspace mode) is ultimately the LSP client. An instance of the
	// lcnode.LanguageClient is responsible for starting the LSP server ('cue
	// lsp') and acting as the LSP client, translating
	// requests/responses/notifications to/from the LSP server into
	// events/changes etc within the VSCode instance.
	//
	// (We ignore for one second that an instance of 'cue lsp' can act simply as
	// a forwarded to a true LSP server. That point can, and is, abstracted away:
	// we can simply treat the running 'cue lsp' instance as the LSP server.)
	//
	// Hence, an instance of this extension is never directly responsible for
	// starting the LSP server; everything happens through an instance of the
	// lcnode.LanguageClient. Hence the client variable being defined represents
	// our proxy for "this extension instance is connected to a CUE LSP server".
	private client?: lcnode.LanguageClient;

	// clientStateChangeHandler is the event handler that is called back when the
	// state of the running LSP client changes. Note, that we dispose of this
	// handler before intentionally shutting down the LSP server.
	private clientStateChangeHandler?: lcnode.Disposable;

	// config represents the configuration of the active vscode-cue extension
	// instance. During activation of the extension instance, we register to
	// receive callbacks when the configuration changes, so the config value
	// remains current post activation.
	//
	// Most notably, this config value is the effective config, post application
	// of documented defaults. As such, it is a deep copy of the configuration as
	// reported by VSCode, "extended" by the default values we define within the
	// extension.
	private config?: CueConfiguration;

	// manualLspStop is true when cmdStopLSP has been called. It is reset to false
	// only if the LSP is configured to be active and when cmdStartLSP is called.
	private manualLspStop: boolean = false;

	private output: vscode.LogOutputChannel;
	private lspOutput?: vscode.OutputChannel;

	// tornDown is set to true only when this Extension instance is being
	// tearDown-ed. This happens when the corresponding extension instance has
	// been deactivate-d. This state allows us to be defensive in callback
	// methods, throwing errors in case we get callbacks after tearDown.
	private tornDown: boolean = false;

	// cueCommand keeps track of the last output from 'cue version' using the
	// configured languageServerCommand[0] command as a proxy for cmd/cue. An
	// empty string means that we were unable to interrogate the output of 'cue
	// version'.
	private cueVersion: string = '';

	// statusBarItem shows the CUE extension status, including version and a
	// :zap: icon in case the LSP is running.
	private statusBarItem: vscode.StatusBarItem;

	constructor(
		ctx: vscode.ExtensionContext,
		output: vscode.LogOutputChannel,
		lspOutput: vscode.OutputChannel | undefined
	) {
		this.ctx = ctx;
		this.output = output;

		let configChangeListener = vscode.workspace.onDidChangeConfiguration(this.extensionConfigurationChange);
		this.ctx.subscriptions.push(configChangeListener);

		this.registerCommand('vscode-cue.welcome', this.cmdWelcomeCUE);
		this.registerCommand('vscode-cue.startlsp', this.cmdStartLSP);
		this.registerCommand('vscode-cue.stoplsp', this.cmdStopLSP);

		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

		// TODO(myitcv): in the early days of 'cue lsp', it might be worthwhile
		// adding a command that toggles the enabled-ness of the LSP in the active
		// workspace/folder, i.e. sets 'cue.useLanguageServer' in either workspace or
		// folder configuration for the user, toggling any existing value, and
		// starting/stopping the instance as appropriate given the resulting state.

		// Manually trigger a configuration changed event. This will ultimately
		// start cue lsp if the configuration reflects that should happen.
		this.extensionConfigurationChange(undefined);
	}

	// tearDown is called in response to the deactivate function for the
	// extension. At this point in the lifecycle of the extension, subscriptions
	// via this.ctx will already have been disposed. Hence any remaining cleanup
	// logic should be placed here.
	tearDown = (): vscode.OutputChannel | undefined => {
		if (this.tornDown) {
			throw errTornDown;
		}
		this.tornDown = true;
		return this.lspOutput;
	};

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
	registerCommand = (cmd: string, callback: (context?: any) => Promise<void>) => {
		if (this.tornDown) {
			throw errTornDown;
		}

		let disposable = vscode.commands.registerCommand(cmd, callback);
		this.ctx.subscriptions.push(disposable);
	};

	// extensionConfigurationChange is the callback that fires when the extension
	// instance's configuration has changed, including the initial configuration
	// change that happens at activation time.
	//
	// s will be undefined in the case that extensionConfigurationChange is called
	// during activation.
	//
	// Note that this function updates config with a deep copy of the configuration
	// reported by VSCode (then extended with defaults).
	//
	// Because the caller of this callback does not handle promises (citation
	// needed), we need to determine how to report errors to the user. Hence we
	// either use showErrorMessage or this.output.error, with a mild preference
	// for the former because it surfaces problems to the user.
	extensionConfigurationChange = async (s: vscode.ConfigurationChangeEvent | undefined): Promise<void> => {
		if (this.tornDown) {
			throw errTornDown;
		}

		// For some unknown reason, we get random callbacks (during development at
		// least) for configuration changes where there is no actual configuration
		// change. That is to say, there is no observable configuration change when
		// considering the concrete configuration, at any point in the
		// configuration graph. This appears to be mitigated by calling
		// s.affectsConfiguration('cue') to determine if there has been a change.
		if (s !== undefined && !s.affectsConfiguration('cue')) {
			return;
		}

		// As https://github.com/Microsoft/vscode/issues/35451 clearly explains,
		// the object value returned by vscode.workspace.getConfiguration always
		// has a defined value for each field in the configuration schema. As such,
		// we cannot predicate any logic in this extension on a field _not_ having
		// been set, because we simply cannot distinguish that case.
		let vscodeConfig = vscode.workspace.getConfiguration('cue');
		let newConfig = JSON.parse(JSON.stringify(vscodeConfig)) as CueConfiguration;

		// We need to re-run 'cue version' in case the cue command implied by
		// languageServerCommand[0] changes.
		let currentCueCmd = this.config?.languageServerCommand?.[0] ?? '';
		let newCueCmd = newConfig.languageServerCommand?.[0] ?? '';

		this.config = newConfig;
		this.output.info(`configuration updated to: ${JSON.stringify(this.config, null, 2)}`);

		let err;

		// Sanity check the cueCommand config Show an error message in case we do
		// not have a valid value. Note that this does not try to ensure the binary
		// exists on disk; that in effect happens each time we try and run the
		// command and so failure (e.g. file not existing) is handled at each of
		// those sites.
		//
		// By the this stage, config represents the defaults-populated
		// configuration we should use. The field cueCommand is the command that
		// should be run. We need to handle the normal cases:
		//
		// 1. cue - a simple relative path, no slashes
		// 2. ./relative/path/to/cue - a non-simple (!) relative path, >=1 slashes
		// 3. /absolute/path/to/cue - absolute filepath
		//
		// For now, we err on the side of caution by only allowing simple relative
		// and absolute file paths. Reason being, it's not clear (yet) what this
		// means in the case of the running VSCode, workspace etc. And we might
		// want to support expanding special VSCode variables in the path.
		let cueCommand = this.config!.cueCommand;

		let validCueCommand = false;
		let invalidMsgSuffix = '';

		switch (true) {
			case cueCommand.trim() == '':
				// Simply broken and obviously so.
				break;
			case !path.isAbsolute(cueCommand) && cueCommand.includes(path.sep):
				invalidMsgSuffix = 'only simple relative or absolute file paths supported';
				break;
			default:
				validCueCommand = true;
		}
		if (!validCueCommand) {
			let msg = `invalid cue.cueCommand config value ${JSON.stringify(cueCommand)}`;
			if (invalidMsgSuffix.trim() !== '') {
				msg += `; ${invalidMsgSuffix}`;
			}
			this.showErrorMessage(msg);

			// Stop the LSP if it is running.
			[, err] = await ve(this.stopCueLsp());
			if (err !== null) {
				return this.showErrorMessage(`failed to stop cue lsp: ${err}`);
			}
			return;
		}

		// Update the status bar item
		[, err] = await ve(this.updateStatus(currentCueCmd == newCueCmd));
		if (err !== null) {
			return Promise.reject(err);
		}

		// Run the LSP as required
		if (this.config.useLanguageServer) {
			// TODO: we might want to revisit just blindly restarting the LSP, for
			// example in case the configuration for the LSP client or server hasn't
			// changed. But for now it's good enough.
			[, err] = await ve(this.startCueLsp());
		} else {
			[, err] = await ve(this.stopCueLsp());
		}
		if (err !== null) {
			return this.showErrorMessage(`${err}`);
		}
	};

	// showErrorMessage is a convenience void return type wrapper around
	// vscode.window.showErrorMessage for early return in void call sites.
	showErrorMessage = (message: string, ...items: string[]): void => {
		vscode.window.showErrorMessage(message, ...items);
	};

	// updateStatus ensures that the status bar item reflects the current state
	// of the extension.
	updateStatus = async (updateCueVersion: boolean): Promise<void> => {
		let version = this.cueVersion;
		if (updateCueVersion) {
			// We need to run 'cue version' (according to the config cueCommand)
			// for the updated version string.
		}
		return Promise.resolve();
	};

	// cmdWelcomeCUE is a basic command that can be used to verify whether the
	// vscode-cue extension is loaded at all (beyond checking output logs).
	cmdWelcomeCUE = async (context?: any): Promise<void> => {
		if (this.tornDown) {
			throw errTornDown;
		}

		vscode.window.showInformationMessage('Welcome to CUE!');
		return;
	};

	// cmdStartLSP is used to explicitly (re)start the LSP server. It can only be
	// called if the extension configuration allows for it.
	cmdStartLSP = async (context?: any): Promise<void> => {
		if (this.tornDown) {
			throw errTornDown;
		}

		if (!this.config!.useLanguageServer) {
			return this.showErrorMessage(`useLanguageServer is configured to false`);
		}
		this.manualLspStop = false;
		return this.startCueLsp('manually');
	};

	// cmdStopLSP is used to explicitly stop the LSP server.
	cmdStopLSP = async (context?: any): Promise<void> => {
		if (this.tornDown) {
			throw errTornDown;
		}

		this.manualLspStop = true;
		return this.stopCueLsp('manually');
	};

	// startCueLsp is responsible for starting 'cue lsp'. It stops an existing client
	// if there is one, to prevent there being two running instances.
	//
	// By default, the LSP is started using a version of cmd/cue found in PATH.
	//
	// TODO: proper error handling strategy here. This is run async from activate
	// so updating the user is "up to us". We might need to refine messages that
	// are shown, log messages, etc. We will likely refine this error strategy as
	// users report problems "in the wild".
	startCueLsp = async (source: string = ''): Promise<void> => {
		if (this.tornDown) {
			throw errTornDown;
		}

		if (!this.config!.useLanguageServer || this.manualLspStop) {
			// Nothing to do. Explicit attempts to start the LSP in this situation are
			// handled elsewhere. And in case the user has manually stopped the LSP,
			// we should only run it if explicitly asked to via a command. And if we
			// had been through that path, then manualLspStop would be false.
			return;
		}

		if (source !== '') {
			source = `${source} `;
		}

		let cueCommand, err;

		// Stop the running instance if there is one.
		[, err] = await ve(this.stopCueLsp());
		if (err !== null) {
			return Promise.reject(err);
		}

		[cueCommand, err] = await ve(this.absCueCommand(this.config!.cueCommand));
		if (err !== null) {
			return Promise.reject(err);
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
			Args: [cueCommand!, 'help', 'lsp']
		};
		[, err] = await ve(osexecRun(cueHelpLsp));
		if (err !== null) {
			if (isErrnoException(err)) {
				return this.showErrorMessage(`failed to run ${JSON.stringify(cueHelpLsp)}: ${err}`);
			}
			// Probably running an early version of CUE with no LSP support.
			return this.showErrorMessage(
				`the version of cmd/cue at ${JSON.stringify(cueCommand)} does not support 'cue lsp'. Please upgrade to at least v0.11.0`
			);
		}

		const serverOptions: lcnode.ServerOptions = {
			command: cueCommand!,
			args: ['lsp', ...this.config!.languageServerFlags]

			// NOTE: we do not set the working directory. The 'cue lsp' ignores the
			// working directory and always will. It will always rely on the paths of
			// WorkspaceFolders (and possibly in a fallback scenario the RootURI in the
			// call to Initialize).
		};

		this.output.info(`${source}starting CUE LSP with server options: ${JSON.stringify(serverOptions, null, 2)}`);

		// Create an output channel for logging, errors etc received from 'cue lsp'
		// and the LanguageClient. To include this in the extension logging would
		// clutter things unncessarily.
		if (this.lspOutput === undefined) {
			this.lspOutput = vscode.window.createOutputChannel('CUE Language Server');
		}

		// Options to control the language client. For example, which file events
		// (open, modified etc) get sent to the server.
		const clientOptions: lcnode.LanguageClientOptions = {
			documentSelector: [{ scheme: 'file', language: 'cue' }],
			outputChannel: this.lspOutput
		};

		// Create the language client
		//
		// TODO: properly handle the client/server dying and informing the user,
		// beyond the simple notification of state change.
		this.client = new lcnode.LanguageClient('cue lsp', 'cue lsp: the CUE Language Server', serverOptions, clientOptions);
		this.clientStateChangeHandler = this.client.onDidChangeState(this.cueLspStateChange);

		// Dispose of the state change handler before the client itself,
		// otherwise we get a notification of a state change when we are
		// disposing of the client (which only happens when the extension
		// is deactivating).
		this.ctx.subscriptions.push(this.clientStateChangeHandler);

		// Start the client, which in turn will start 'cue lsp'
		this.client.start();
		this.ctx.subscriptions.push(this.client);

		// At this point, all events happend via callbacks in terms of state changes,
		// or the client-server interaction of the LSP protocol.
	};

	// stopCueLsp kills the running LSP client, if there is one.
	stopCueLsp = async (source: string = ''): Promise<void> => {
		if (this.tornDown) {
			throw errTornDown;
		}

		if (this.client === undefined) {
			return;
		}

		if (source !== '') {
			source = `${source} `;
		}

		this.output.info(`${source}stopping cue lsp`);

		// Stop listening to the event first so that we don't handle state changes
		// in the usual way.
		this.clientStateChangeHandler!.dispose();

		let err;
		// TODO: use a different timeout?
		[, err] = await ve(this.client.stop());
		this.client = undefined;
		this.clientStateChangeHandler = undefined;
		if (err !== null) {
			// TODO: we get an error message here relating to the process for stopping
			// the server timing out, when providing an argument to stop(). Why? And
			// if that does happen, what can we know about the state of the running
			// process?
			return Promise.reject(new Error(`failed to stop cue lsp: ${err}`));
		}
	};

	cueLspStateChange = (s: lc.StateChangeEvent): void => {
		if (this.tornDown) {
			throw errTornDown;
		}

		let oldState = JSON.stringify(humanReadableState(s.oldState));
		let newState = JSON.stringify(humanReadableState(s.newState));
		this.output.info(`cue lsp client state change: from ${oldState} to ${newState}`);
	};

	// absCueCommand computes an absolute path for a non-absolute cueCommand
	// value. If cueCommand is already absolute, cueCommand is returned. Note
	// that despite using which to resolve a non-absolute value the caller can
	// still not make any guarantees about the existence of the binary on disk
	// when it comes to running it. Races possible everywhere.
	absCueCommand = async (cueCommand: string): Promise<string> => {
		if (path.isAbsolute(cueCommand)) {
			return Promise.resolve(cueCommand);
		}
		let [resolvedCommand, err] = await ve(which(cueCommand));
		if (err !== null) {
			return Promise.reject(new Error(`failed to find ${JSON.stringify(cueCommand)} in PATH: ${err}`));
		}
		return Promise.resolve(resolvedCommand!);
	};
}

// CueConfiguration corresponds to the type of the configuration of the vscode-cue
// extension.
//
// TODO: keep this in sync with the configuration schema in CUE.
type CueConfiguration = {
	useLanguageServer: boolean;
	cueCommand: string;
	languageServerFlags: string[];
};

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
