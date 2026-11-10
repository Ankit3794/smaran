// Extraction spike: runs the real extractors against real URLs with the real network and prints the
// success rate per source plus each failure's kind. Run: npx tsx scripts/spike-extract.ts [--record]
// Run from the project root. Not part of the app; it informs how much to trust each source (spec section 4), it does not gate anything.
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { extractorFor } from '../src/extract';
import { ExtractError } from '../src/extract/types';
import type { Source } from '../src/core/types';

const shouldRecord = process.argv.includes('--record');
const recordingsFolder = 'scripts/spike-recordings';

const lines = readFileSync('scripts/spike-urls.txt', 'utf8')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'));

async function main() {
  const tally: Record<string, { ok: number; total: number }> = {};
  const failures: string[] = [];
  if (shouldRecord) mkdirSync(recordingsFolder, { recursive: true });

  for (const [index, line] of lines.entries()) {
    const [source, url] = line.split('\t') as [Source, string];
    const extractor = extractorFor(source);
    if (!extractor) continue;
    tally[source] ??= { ok: 0, total: 0 };
    tally[source].total++;
    try {
      const result = await extractor(url, { http: fetch, allowMirrors: true });
      if (!result.text) throw new ExtractError('parse', 'No text extracted');
      tally[source].ok++;
      if (shouldRecord) writeFileSync(join(recordingsFolder, `${source}-${index}.json`), JSON.stringify(result, null, 2));
    } catch (error) {
      const kind = error instanceof ExtractError ? error.kind : 'unexpected';
      failures.push(`| ${source} | ${kind} | ${url} |`);
    }
  }

  console.log('| source | success | rate |\n|---|---|---|');
  for (const [source, { ok, total }] of Object.entries(tally)) {
    console.log(`| ${source} | ${ok}/${total} | ${Math.round((ok / total) * 100)}% |`);
  }
  console.log('\n| source | failure kind | url |\n|---|---|---|');
  console.log(failures.join('\n'));
}

main();
