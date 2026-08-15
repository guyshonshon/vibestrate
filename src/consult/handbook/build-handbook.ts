#!/usr/bin/env tsx
// Regenerate the compiled handbook corpus:
//
//   tsx src/consult/handbook/build-handbook.ts
//
// Run it after editing anything under docs/content/ or regenerating
// docs/generated/ (`pnpm docs:generate`), and commit the result.
// tests/consult-handbook.test.ts fails when the two have drifted.

import { writeFile } from "node:fs/promises";
import { compileHandbook, renderCorpusModule } from "./handbook-compile.js";
import { readHandbookSources, corpusModulePath } from "./handbook-sources.js";

const corpus = compileHandbook(await readHandbookSources());
const target = corpusModulePath();
const module_ = renderCorpusModule(corpus);
await writeFile(target, module_, "utf8");
console.log(
  `handbook: ${corpus.entries.length} entries, ${corpus.lexicon.split(" ").length} lexicon terms, ${(
    Buffer.byteLength(module_, "utf8") / 1024
  ).toFixed(0)} KB -> ${target}`,
);
