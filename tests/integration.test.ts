import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeFile } from '../src/server/analyzers/index.js';

const icRoot = path.resolve(process.cwd(), '..', '..', 'IC');
const samples = [
  ['padroes_para_teste/occurrence.txt', 'darwin-core', 27],
  ['padroes_para_teste/metadados_wcmp2_inmet.json', 'wcmp-2', 17],
  ['padroes_para_teste/dados_iso.xml', 'iso-19115', 17],
  ['arquivos_externos_para_teste/gbif_araucaria_parana_dwc.txt', 'darwin-core', 27],
  ['arquivos_externos_para_teste/nasa_modis_aqua_iso19115.xml', 'iso-19115', 17]
] as const;

describe('arquivos reais do projeto', () => {
  it.each(samples)('reconhece e avalia %s', (relative, standard, criteria) => {
    const filePath = path.join(icRoot, relative);
    const result = analyzeFile(fs.readFileSync(filePath), path.basename(filePath), .8);
    expect(result.standard).toBe(standard);
    expect(result.criteria).toHaveLength(criteria);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passing + result.failing).toBe(criteria);
  });
});
