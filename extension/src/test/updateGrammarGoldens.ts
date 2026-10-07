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
// testdata/syntax with the grammar's current output. Run it with
// 'npm run update-grammar-goldens', then review the diff.

import * as fs from 'node:fs';
import { corpusDir, corpusFiles, dump, goldenPath, loadGrammar, tokenize } from './tmgrammar';

async function main() {
	const g = await loadGrammar();
	for (const name of corpusFiles()) {
		const tokens = tokenize(g, fs.readFileSync(`${corpusDir}/${name}`, 'utf8'));
		fs.writeFileSync(goldenPath(name), dump(tokens));
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
