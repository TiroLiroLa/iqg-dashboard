import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeFile } from '../src/server/analyzers/index.js';

const fixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures');
const samples = [
  ['darwin-core.tsv', 'darwin-core', 27],
  ['wcmp-2.json', 'wcmp-2', 17],
  ['iso-19115.xml', 'iso-19115', 17]
] as const;

describe('fixtures versionadas do projeto', () => {
  it.each(samples)('reconhece e avalia %s', (relative, standard, criteria) => {
    const filePath = path.join(fixturesRoot, relative);
    const result = analyzeFile(fs.readFileSync(filePath), path.basename(filePath), .8);
    expect(result.standard).toBe(standard);
    expect(result.criteria).toHaveLength(criteria);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passing + result.failing).toBe(criteria);
  });
});
