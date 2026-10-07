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

// updateGrammarGoldens rewrites the golden token dump of every corpus file in
// testdata/syntax with the grammar's current output, and removes from
// KNOWN_GAPS the files that no longer have invalid tokens, deleting KNOWN_GAPS
// once none are left. It never adds to KNOWN_GAPS. Run it with
// 'npm run update-grammar-goldens', then review the diff.

import * as fs from 'node:fs';
import {
	corpusDir,
	corpusFiles,
	dump,
	goldenPath,
	invalidTokens,
	knownGapsPath,
	loadGrammar,
	tokenize
} from './tmgrammar';

async function main() {
	const g = await loadGrammar();
	const fixed = new Set<string>();
	for (const name of corpusFiles()) {
		const tokens = tokenize(g, fs.readFileSync(`${corpusDir}/${name}`, 'utf8'));
		fs.writeFileSync(goldenPath(name), dump(tokens));
		if (invalidTokens(tokens).length === 0) {
			fixed.add(name);
		}
	}
	updateKnownGaps(fixed);
}

// updateKnownGaps removes the files in fixed from KNOWN_GAPS, keeping its
// header and the order of the other entries, and deletes the file when no
// entries are left.
function updateKnownGaps(fixed: Set<string>) {
	if (!fs.existsSync(knownGapsPath)) {
		return;
	}
	const lines = fs.readFileSync(knownGapsPath, 'utf8').split('\n');
	const header = lines.filter((l) => l.startsWith('#'));
	const entries = lines.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
	const left = entries.filter((e) => !fixed.has(e));
	if (left.length === 0) {
		fs.unlinkSync(knownGapsPath);
	} else if (left.length < entries.length) {
		fs.writeFileSync(knownGapsPath, [...header, ...left, ''].join('\n'));
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
