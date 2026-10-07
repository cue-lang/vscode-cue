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

// These tests check the TextMate grammar against a copy of the CUE syntax
// corpus in testdata/syntax: each file's tokens must match its golden dump,
// and files of valid syntax must have no token scoped invalid. Like
// util.test.ts, they run under plain Node via 'npm run test:unit'.

import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	corpusClasses,
	corpusDir,
	corpusFiles,
	dump,
	formatToken,
	goldenPath,
	invalidTokens,
	knownGaps,
	loadGrammar,
	mustBeValid,
	tokenize
} from './tmgrammar';

suite('TextMate grammar', () => {
	const files = corpusFiles();
	const gaps = knownGaps();

	test('the corpus is present', () => {
		assert.ok(files.length > 0, `no corpus files in ${corpusDir}`);
	});

	test('KNOWN_GAPS names corpus files that must be valid', () => {
		for (const name of gaps) {
			assert.ok(files.includes(name), `KNOWN_GAPS names ${name}, which is not a corpus file`);
			assert.ok(mustBeValid(name), `KNOWN_GAPS names ${name}, which is not required to be valid`);
		}
	});

	test('every golden has a corpus file', () => {
		for (const dir of corpusClasses) {
			for (const f of fs.readdirSync(path.join(corpusDir, dir)).filter((f) => f.endsWith('.tokens'))) {
				const golden = `${dir}/${f}`;
				assert.ok(files.includes(golden.replace(/\.tokens$/, '.cue')), `${golden} has no corpus file`);
			}
		}
	});

	for (const name of files) {
		test(name, async () => {
			const g = await loadGrammar();
			const tokens = tokenize(g, fs.readFileSync(`${corpusDir}/${name}`, 'utf8'));
			const golden = goldenPath(name);
			assert.ok(fs.existsSync(golden), `missing golden ${golden}; run 'npm run update-grammar-goldens'`);
			assert.strictEqual(
				dump(tokens),
				fs.readFileSync(golden, 'utf8'),
				`tokens differ from ${golden}; review, then run 'npm run update-grammar-goldens'`
			);
			if (!mustBeValid(name)) {
				return;
			}
			const invalid = invalidTokens(tokens).map(formatToken);
			if (gaps.has(name)) {
				assert.notDeepStrictEqual(invalid, [], `${name} has no invalid tokens; remove it from KNOWN_GAPS`);
			} else {
				assert.deepStrictEqual(invalid, [], `${name} has tokens scoped invalid`);
			}
		});
	}
});
