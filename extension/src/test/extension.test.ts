import * as assert from 'assert';
import * as vscode from 'vscode';
import { expandVSCodeVariables, isRelativePath } from '../extension';

// workspaceFolder is a convenience constructor for a vscode.WorkspaceFolder.
function workspaceFolder(name: string, fsPath: string, index: number): vscode.WorkspaceFolder {
	return { uri: vscode.Uri.file(fsPath), name, index };
}

suite('expandVSCodeVariables', () => {
	const folders = [workspaceFolder('one', '/w/one', 0), workspaceFolder('two', '/w/two', 1)];
	const home = '/home/tester';

	test('values without variables are unchanged', () => {
		for (const val of ['cue', '/abs/path/cue', './bin/cue', '', 'weird$name']) {
			let [expanded, err] = expandVSCodeVariables(val, folders, home);
			assert.strictEqual(err, null);
			assert.strictEqual(expanded, val);
		}
	});

	test('${workspaceFolder} expands to the first workspace folder', () => {
		let [expanded, err] = expandVSCodeVariables('${workspaceFolder}/bin/cue', folders, home);
		assert.strictEqual(err, null);
		assert.strictEqual(expanded, '/w/one/bin/cue');
	});

	test('${workspaceFolder:name} expands to the named workspace folder', () => {
		let [expanded, err] = expandVSCodeVariables('${workspaceFolder:two}/bin/cue', folders, home);
		assert.strictEqual(err, null);
		assert.strictEqual(expanded, '/w/two/bin/cue');
	});

	test('${userHome} expands to the home directory', () => {
		let [expanded, err] = expandVSCodeVariables('${userHome}/.local/bin/cue', folders, home);
		assert.strictEqual(err, null);
		assert.strictEqual(expanded, '/home/tester/.local/bin/cue');
	});

	test('multiple variables expand in one value', () => {
		let [expanded, err] = expandVSCodeVariables('${workspaceFolder:one}/x/${workspaceFolder:two}/y', folders, home);
		assert.strictEqual(err, null);
		assert.strictEqual(expanded, '/w/one/x//w/two/y');
	});

	test('dollar signs in expanded values are preserved', () => {
		const dollarFolders = [workspaceFolder('main', '/w/a$$b', 0)];
		let [expanded, err] = expandVSCodeVariables('${workspaceFolder}/bin/cue', dollarFolders, '/home/c$&d');
		assert.strictEqual(err, null);
		assert.strictEqual(expanded, '/w/a$$b/bin/cue');
		[expanded, err] = expandVSCodeVariables('${userHome}/bin/cue', dollarFolders, '/home/c$&d');
		assert.strictEqual(err, null);
		assert.strictEqual(expanded, '/home/c$&d/bin/cue');
	});

	test('expanded values are not re-expanded', () => {
		const trickyFolders = [workspaceFolder('main', '/w/${userHome}', 0)];
		let [expanded, err] = expandVSCodeVariables('${workspaceFolder}/bin/cue', trickyFolders, home);
		assert.strictEqual(err, null);
		assert.strictEqual(expanded, '/w/${userHome}/bin/cue');
	});

	test('${workspaceFolder} errors when there are no workspace folders', () => {
		for (const noFolders of [undefined, []]) {
			let [expanded, err] = expandVSCodeVariables('${workspaceFolder}/bin/cue', noFolders, home);
			assert.strictEqual(expanded, null);
			assert.match(`${err}`, /cannot expand \$\{workspaceFolder\}: no matching workspace folder/);
		}
	});

	test('${workspaceFolder:name} errors when no folder matches', () => {
		let [expanded, err] = expandVSCodeVariables('${workspaceFolder:three}/bin/cue', folders, home);
		assert.strictEqual(expanded, null);
		assert.match(`${err}`, /cannot expand \$\{workspaceFolder:three\}: no matching workspace folder/);
	});

	test('${userHome} errors when the home directory is unknown', () => {
		let [expanded, err] = expandVSCodeVariables('${userHome}/bin/cue', folders, '');
		assert.strictEqual(expanded, null);
		assert.match(`${err}`, /cannot expand \$\{userHome\}/);
	});

	test('unsupported variables error', () => {
		for (const val of ['${env:GOBIN}/cue', '${workspaceFolderBasename}/cue', '${}/cue']) {
			let [expanded, err] = expandVSCodeVariables(val, folders, home);
			assert.strictEqual(expanded, null);
			assert.match(`${err}`, /unsupported variable/);
		}
	});
});

suite('isRelativePath', () => {
	test('relative paths are detected', () => {
		for (const val of ['./bin/cue', 'bin/cue', '../cue', 'a/b/c']) {
			assert.strictEqual(isRelativePath(val), true, val);
		}
	});

	test('command names and absolute paths are not relative paths', () => {
		for (const val of ['cue', '', '/abs/path/cue', '/cue']) {
			assert.strictEqual(isRelativePath(val), false, val);
		}
	});
});
