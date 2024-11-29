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

import * as vscode from 'vscode';

import { Extension } from './extension';

// Note by myitcv
// ==============
// I am not good with TypeScript. I struggle with writing idiomatic code. Truth
// be told I would prefer to have written this extension in Go and use GopherJS
// to transpile to JavaScript! But that's a story for another day. Any poor
// style, etc, is my own.
//
// Structure of the extension
// ==========================
// Unlike the vscode-go project, we hold the state for an instance of the
// extension in an instance of the Extension class. We will later work out how
// to adapt/change this to support good end-to-end/integration testing.
//
// In a similar vein, we keep the number of TypeScript modules to a minimum for
// now. It is unfortunate that TypeScript does not have an analog to Go's
// packages.
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
//   consult the output window. This corresponds to the rejected promise.
// * a non-modal elegant error message popup bottom right, informing them of
//   the error message.
//
// We are fully in control of the style, options in the second case and not the
// first. Hence showErrorMessage should generally be accompanied by a resolved
// promise, indicating the error has been handled.
//
// Logging level
// =============
// For now, we broadly log everything to the output channel as info-level
// logging. This is intentionally noisy for now, until we get some experience
// from users reading the logs etc. Much if not all of that logging can flip to
// trace-level logging in the future.
//
// Method declaration style
// ========================
// The class arrow field function style of declaring methods in the Extension
// class, really because I don't know of a cleaner more idiomatic method.
// Suggestions/corrections welcomed!
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
// A single output channel
// (https://code.visualstudio.com/api/references/vscode-api#OutputChannel) is
// used to log useful but non-sensitive information about the extension. In
// case something goes wrong, glancing at the output logs is the first port of
// call to determine what was happening. In VSCode, this output can be seen via
// the 'Output' window, then selecting 'CUE' from the dropdown that allows you
// to select the category of output to view. If the LSP is active, then we
// create a separate output channel for the log messages received from the LSP
// client. That can be seen by selecting 'CUE Language Server'.
//
// Note that a single instance is used across instances of this extension. That
// way we don't clutter the user's VSCode Output window with multiple 'CUE'
// entries in the dropdown, entries that are indistinguishable by name.

// inst is the global that holds the state for the singleton running instance
// of the vscode-cue extension, if there is one, in the current VSCode window
// (ultimately via the extension host). The extension's configuration
// (ultimately exposed via package.json) determines when an instance of this
// extension should be created. As part of that process, the activate function
// below is called. That is effectively the entrypoint for this and indeed any
// extension. An instance of Extension is then created to wrap the context for
// the extension instance and represent its lifetime. When an instance of the
// extension is restarted, or shutdown for whatever reason, the deactivate
// function below is called, in which we perform any final tidy-ups via
// inst.tearDown, and then set inst to undefiend to represent the start of the
// extension not current being active in the current VSCode window.
let inst: Extension | undefined;

// output is a singleton output channel used for extension logging (at various
// levels) to the user via the 'Output' window, in the 'CUE' context.
let output = vscode.window.createOutputChannel('CUE', { log: true });

// lspOutput is established as a singleton the first time we run cue lsp. Log
// and error output from the running cue lsp instance is logged to the output
// channel, named 'CUE Language Server'. It is retained here as global state
// in order that we can reuse a singleton when created between instances of
// the extension, i.e. the output channel survives restarts.
let lspOutput: vscode.OutputChannel | undefined;

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

	// Based on our current understanding, it should never be the case that inst
	// is defined at this point.
	if (inst !== undefined) {
		throw new Error('inst already defined on activate?');
	}

	// An instance of Extension represents the active extension instance, in this
	// VSCode window.
	inst = new Extension(context, output, lspOutput);
}

// deactivate is called when the extension instance is shutting down. It is
// part of the VSCode extension API. It is also called when a VSCode extension
// is being restarted, followed immediately (assuming no errors results) by a
// call to activate.
export async function deactivate(): Promise<void> {
	if (inst === undefined) {
		// Nothing to do
		return Promise.resolve(undefined);
	}

	// Grab the instance of the lsp output channel if there is one to reuse it
	// between instances of the extension. This is relevant for example if the
	// extension is restarted.
	lspOutput = inst.tearDown();
	inst = undefined;

	output.info('extension deactivated');

	return Promise.resolve(undefined);
}
