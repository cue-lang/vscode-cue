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

// syncSyntaxCorpus refreshes the copy of the CUE syntax corpus in
// testdata/syntax, its pass, preview and fail directories, from a checkout of
// cue-lang/cue, which must be exactly at a tag, and records the tag in
// testdata/syntax/SOURCE. Corpus files that the checkout no longer has are
// removed, with their goldens. Run it with
// 'npm run sync-syntax-corpus -- <checkout>', then run
// 'npm run update-grammar-goldens' and 'npm run test:unit'.

import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { corpusDir, corpusFiles, corpusFilesIn, goldenPath } from './tmgrammar';

function main() {
	const checkout = process.argv[2];
	if (checkout === undefined) {
		throw new Error('usage: npm run sync-syntax-corpus -- <cue-checkout>');
	}
	let tag: string;
	try {
		tag = cp.execFileSync('git', ['-C', checkout, 'describe', '--exact-match', '--tags'], { encoding: 'utf8' }).trim();
	} catch {
		throw new Error(`${checkout} is not a git checkout exactly at a tag`);
	}
	const src = path.join(checkout, 'cue', 'parser', 'testdata', 'syntax');
	const names = corpusFilesIn(src);
	if (names.length === 0) {
		throw new Error(`no corpus files in ${src}`);
	}
	for (const old of corpusFiles()) {
		if (!names.includes(old)) {
			fs.rmSync(path.join(corpusDir, old));
			fs.rmSync(goldenPath(old), { force: true });
		}
	}
	for (const name of names) {
		const dst = path.join(corpusDir, name);
		fs.mkdirSync(path.dirname(dst), { recursive: true });
		fs.copyFileSync(path.join(src, name), dst);
	}
	fs.writeFileSync(path.join(corpusDir, 'SOURCE'), `cue-lang/cue ${tag}\n`);
	console.log(`copied ${names.length} corpus files from cue-lang/cue ${tag}`);
}

try {
	main();
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
}
