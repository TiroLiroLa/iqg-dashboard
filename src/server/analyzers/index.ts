import type { AnalysisResult } from '../../shared/types.js';
import { analyzeDwc, looksLikeDwc } from './dwc.js';
import { analyzeIso, looksLikeIso, parseIso } from './iso.js';
import { analyzeWcmp, looksLikeWcmp, parseWcmp } from './wcmp.js';

export function analyzeFile(buffer: Buffer, fileName: string, threshold: number): AnalysisResult {
  const trimmed = buffer.toString('utf8', 0, Math.min(buffer.length, 2048)).trimStart();
  if (trimmed.startsWith('{')) {
    const record = parseWcmp(buffer);
    if (!looksLikeWcmp(record)) throw new Error('JSON reconhecido, mas não corresponde a um registro WCMP 2 GeoJSON válido.');
    return analyzeWcmp(record, buffer, fileName, threshold);
  }
  if (trimmed.startsWith('<')) {
    const root = parseIso(buffer);
    if (!looksLikeIso(root)) throw new Error('XML reconhecido, mas a raiz não é MD_Metadata ou MI_Metadata.');
    return analyzeIso(root, buffer, fileName, threshold);
  }
  if (looksLikeDwc(buffer)) return analyzeDwc(buffer, fileName, threshold);
  throw new Error('Padrão não reconhecido. Envie Darwin Core TSV, WCMP 2 JSON ou ISO 19115 XML.');
}
