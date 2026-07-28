// Copyright 2026 The CUE Authors
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

// This module contains helpers that do not depend on the vscode module
// at runtime: only type-only imports of vscode are permitted here (they
// are erased at compile time). This constraint allows unit tests of
// these helpers (src/test/util.test.ts) to run under plain Node via
// 'npm run test:unit', without requiring a VSCode (Electron) instance.

import * as cp from 'node:child_process';
import * as path from 'node:path';
import type * as vscode from 'vscode';

// isRelativePath reports whether p is a relative path: a non-absolute value
// that contains a path separator. Such values are not supported as
// cueCommand values: following POSIX shell conventions, a value containing a
// separator is not subject to PATH lookup, and it is not clear what a
// relative path should be relative to in the context of a running VS Code
// instance. Both '/' and path.sep are treated as separators, matching the
// separator detection of the which package.
export function isRelativePath(p: string): boolean {
	return !path.isAbsolute(p) && (p.includes('/') || p.includes(path.sep));
}

// expandVSCodeVariables expands the supported VS Code variables in str,
// returning the expanded string, or an error for a variable that is not
// supported or cannot be resolved. The supported variables are:
//
// - ${workspaceFolder} - the path of the first workspace folder
// - ${workspaceFolder:name} - the path of the workspace folder named 'name'
//   in a multi-root setup
// - ${userHome} - the path of the user's home folder
//
// The workspace folders and home directory are parameters so that the
// function is pure.
export function expandVSCodeVariables(
	str: string,
	folders: readonly vscode.WorkspaceFolder[] | undefined,
	homeDir: string
): ValErr<string> {
	let err: Error | null = null;
	// Expand in a single pass using a function replacement. This ensures that
	// expanded values are never themselves re-scanned for variables, and that
	// '$' characters within them are not interpreted as special replacement
	// patterns.
	const expanded = str.replace(/\$\{([^}]*)\}/g, (match: string, name: string): string => {
		if (name === 'userHome') {
			if (homeDir === '') {
				err ??= new Error(`cannot expand ${match}: the user's home directory is unknown`);
				return match;
			}
			return homeDir;
		}
		if (name === 'workspaceFolder' || name.startsWith('workspaceFolder:')) {
			let folder: vscode.WorkspaceFolder | undefined;
			if (name === 'workspaceFolder') {
				// Consistent with the resolution of relative paths, the first
				// workspace folder is used.
				folder = folders?.[0];
			} else {
				const folderName = name.slice('workspaceFolder:'.length);
				folder = folders?.find((f) => f.name === folderName);
			}
			if (folder === undefined) {
				err ??= new Error(`cannot expand ${match}: no matching workspace folder`);
				return match;
			}
			return folder.uri.fsPath;
		}
		err ??= new Error(`unsupported variable ${match}`);
		return match;
	});
	if (err !== null) {
		return [null, err];
	}
	return [expanded, null];
}

// ValErr is convenience type for a nullable [value, error] pair. JavaScript
// does not have zero values and hence we are forced to create a nullable
// type.
export type ValErr<T> = [T | null, Error | null];

// ve converts a promise that returns a single value to a promise that returns
// a [value, error] tuple, the error being the value "caught" in case the input
// promise is rejected. When used with 'await', this allows JavaScript-native
// Promise-aware functions that otherwise encourage the use of try-catch with
// 'await' to transform results into a more Go-style of error handling.
//
// TODO: can we be smarter with the Promise<void> case?
export function ve<T>(p: Promise<T>): Promise<ValErr<T>> {
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
export type Cmd = {
	Args: string[];
	Stdout?: string;
	Stderr?: string;
	Err?: cp.ExecFileException | null;
};

// osexecRun is a Go os/exec.Cmd.Run rip-off, to give a Go-style feel to
// running a process.
export async function osexecRun(cmd: Cmd): Promise<void> {
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
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
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
