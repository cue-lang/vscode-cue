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

// This module tokenizes CUE with the extension's TextMate grammar, for the
// grammar tests and the scripts that maintain their test data. Like util.ts,
// it must not depend on the vscode module at runtime, so that the tests run
// under plain Node.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';

// grammarPath is the extension's TextMate grammar for CUE.
export const grammarPath = path.join(__dirname, '..', '..', 'syntaxes', 'cue.tmLanguage.json');

// corpusDir holds the copy of the CUE syntax corpus, together with a golden
// token dump next to each corpus file and the SOURCE and KNOWN_GAPS records.
export const corpusDir = path.join(__dirname, '..', '..', 'testdata', 'syntax');

// headerPrefix starts each line of a corpus file's header, which states CUE's
// parser outcome for each run of language versions, one line per run, as in
//
//	// versions: v0.8.0..v0.17.0; outcome: ok
//	// versions: v0.18.0..; outcome: error 3:2: old-style alias syntax ...
//
// A line that names experiments gives the outcome with them enabled.
export const headerPrefix = '// versions: ';

// Token is one token of a line, with the scopes the grammar assigns to it.
// The root scope, source.cue, is omitted.
export interface Token {
	line: number;
	column: number;
	text: string;
	scopes: string[];
}

let grammar: Promise<vsctm.IGrammar> | undefined;

// loadGrammar returns the CUE grammar, loading it on first use.
export function loadGrammar(): Promise<vsctm.IGrammar> {
	grammar ??= (async () => {
		const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
		await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
		const registry = new vsctm.Registry({
			onigLib: Promise.resolve({
				createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
				createOnigString: (s: string) => new oniguruma.OnigString(s)
			}),
			loadGrammar: async () => vsctm.parseRawGrammar(fs.readFileSync(grammarPath, 'utf8'), grammarPath)
		});
		const g = await registry.loadGrammar('source.cue');
		if (g === null) {
			throw new Error(`cannot load the grammar in ${grammarPath}`);
		}
		return g;
	})();
	return grammar;
}

// tokenize returns the tokens of src, line by line, carrying the grammar's
// state from one line to the next.
export function tokenize(g: vsctm.IGrammar, src: string): Token[] {
	const tokens: Token[] = [];
	let stack = vsctm.INITIAL;
	src.split('\n').forEach((line, i) => {
		const r = g.tokenizeLine(line, stack);
		for (const t of r.tokens) {
			tokens.push({
				line: i + 1,
				column: t.startIndex,
				text: line.substring(t.startIndex, t.endIndex),
				scopes: t.scopes.filter((s) => s !== 'source.cue')
			});
		}
		stack = r.ruleStack;
	});
	return tokens;
}

// formatToken formats t as one line of a golden token dump:
// line:column, the token text as a JSON string, and its scopes, if any.
export function formatToken(t: Token): string {
	const pos = `${t.line}:${t.column}\t${JSON.stringify(t.text)}`;
	return t.scopes.length === 0 ? pos : `${pos}\t${t.scopes.join(' ')}`;
}

// dump returns the golden token dump of tokens.
export function dump(tokens: Token[]): string {
	return tokens.map(formatToken).join('\n') + '\n';
}

// invalidTokens returns the non-blank tokens that carry an invalid scope.
export function invalidTokens(tokens: Token[]): Token[] {
	return tokens.filter((t) => t.text.trim() !== '' && t.scopes.some((s) => s.startsWith('invalid')));
}

// corpusFiles returns the corpus files in corpusDir, sorted.
export function corpusFiles(): string[] {
	return corpusFilesIn(corpusDir);
}

// corpusFilesIn returns the names of the corpus files in root, such as
// alias_postfix_paren.cue, sorted.
export function corpusFilesIn(root: string): string[] {
	if (!fs.existsSync(root)) {
		return [];
	}
	return fs
		.readdirSync(root)
		.filter((f) => f.endsWith('.cue'))
		.sort();
}

// goldenPath returns the path of the golden token dump for a corpus file.
export function goldenPath(name: string): string {
	return path.join(corpusDir, name.replace(/\.cue$/, '.tokens'));
}

// header returns the header lines of the corpus file src.
export function header(src: string): string[] {
	const lines = src.split('\n');
	const end = lines.findIndex((l) => !l.startsWith(headerPrefix));
	return end < 0 ? lines : lines.slice(0, end);
}

// mustBeValid reports whether the grammar must give no invalid scope to the
// corpus file src: whether a line of its header has the outcome ok, so that
// some language version accepts it, perhaps only with the experiments the
// line names.
export function mustBeValid(src: string): boolean {
	return header(src).some((l) => /^\/\/ versions: [^;]*(; experiments: [^;]*)?; outcome: ok$/.test(l));
}

// knownGapsPath is the file listing the corpus files that must be valid but
// that the grammar does not yet handle, one per line, after a header of '#'
// comment lines. The grammar tests fail if a listed file no longer has invalid
// tokens; 'npm run update-grammar-goldens' removes such entries, and deletes
// the file once none are left. A missing file means there are no gaps.
export const knownGapsPath = path.join(corpusDir, 'KNOWN_GAPS');

// knownGaps returns the corpus files listed in knownGapsPath.
export function knownGaps(): Set<string> {
	if (!fs.existsSync(knownGapsPath)) {
		return new Set();
	}
	return new Set(
		fs
			.readFileSync(knownGapsPath, 'utf8')
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l !== '' && !l.startsWith('#'))
	);
}
