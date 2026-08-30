import { parse } from 'csv-parse/sync';
import { criteriaFor } from '../../shared/criteria.js';
import { MAX_DWC_RECORDS, MAX_MAP_POINTS, RULES_VERSION, STANDARD_NAMES } from '../../shared/config.js';
import { scoreCriteria } from '../../shared/scoring.js';
import type { AnalysisResult, CriterionDefinition, CriterionResult, GeoPoint } from '../../shared/types.js';
import { countBuckets, hasText, isAbsoluteUri, isIsoDate, resultFromCounts, temporalBuckets, uniqueStrings } from './common.js';

const BASIS_OF_RECORD = new Set([
  'HUMAN_OBSERVATION', 'MACHINE_OBSERVATION', 'PRESERVED_SPECIMEN', 'FOSSIL_SPECIMEN',
  'LIVING_SPECIMEN', 'MATERIAL_SAMPLE', 'OCCURRENCE', 'EVENT', 'TAXON'
]);
const OCCURRENCE_STATUS = new Set(['PRESENT', 'ABSENT']);
const TAXONOMIC_STATUS = new Set([
  'ACCEPTED', 'SYNONYM', 'HETEROTYPIC_SYNONYM', 'HOMOTYPIC_SYNONYM', 'DOUBTFUL',
  'INVALID', 'MISAPPLIED', 'PROPARTE_SYNONYM'
]);

type Row = Record<string, string>;

function validValue(field: string, value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  switch (field) {
    case 'decimalLatitude': {
      const number = Number(normalized);
      return Number.isFinite(number) && number >= -90 && number <= 90;
    }
    case 'decimalLongitude': {
      const number = Number(normalized);
      return Number.isFinite(number) && number >= -180 && number <= 180;
    }
    case 'coordinateUncertaintyInMeters':
      return Number.isFinite(Number(normalized)) && Number(normalized) >= 0;
    case 'measurementValue':
      return Number.isFinite(Number(normalized.replace(',', '.')));
    case 'eventDate':
    case 'dateIdentified':
    case 'modified':
      return isIsoDate(normalized);
    case 'basisOfRecord':
      return BASIS_OF_RECORD.has(normalized.toUpperCase());
    case 'occurrenceStatus':
      return OCCURRENCE_STATUS.has(normalized.toUpperCase());
    case 'taxonomicStatus':
      return TAXONOMIC_STATUS.has(normalized.toUpperCase());
    case 'language':
      return /^[a-z]{2,3}(?:-[A-Z]{2})?$/i.test(normalized);
    case 'countryCode':
      return /^[A-Z]{2,3}$/.test(normalized);
    case 'license':
      return isAbsoluteUri(normalized) || /^(CC|ODC|PDDL)[-_ ]/i.test(normalized);
    default:
      return true;
  }
}

function evaluate(definition: CriterionDefinition, rows: Row[], headers: Set<string>): CriterionResult {
  const field = definition.field.replace(/^dwc:/, '');
  if (!headers.has(field)) {
    return resultFromCounts(definition, 0, rows.length, ['Coluna ausente no cabeçalho.'], `cabeçalho:${field}`);
  }
  const validRows: number[] = [];
  const invalidRows: number[] = [];
  const values: string[] = [];
  rows.forEach((row, index) => {
    const value = row[field] ?? '';
    if (validValue(field, value)) {
      validRows.push(index + 2);
      if (values.length < 3 && hasText(value)) values.push(value.trim());
    } else if (invalidRows.length < 5) {
      invalidRows.push(index + 2);
    }
  });
  const evidence = values.map((value) => `Exemplo válido: ${value}`);
  if (invalidRows.length) evidence.push(`Linhas inválidas/vazias: ${invalidRows.join(', ')}`);
  return resultFromCounts(definition, validRows.length, rows.length, evidence, `coluna:${field}`);
}

function samplePoints(points: GeoPoint[]): { points: GeoPoint[]; sampled: boolean } {
  if (points.length <= MAX_MAP_POINTS) return { points, sampled: false };
  const step = Math.ceil(points.length / MAX_MAP_POINTS);
  return { points: points.filter((_, index) => index % step === 0).slice(0, MAX_MAP_POINTS), sampled: true };
}

export function analyzeDwc(buffer: Buffer, fileName: string, threshold: number): AnalysisResult {
  let rows: Row[];
  try {
    rows = parse(buffer, {
      columns: true,
      delimiter: '\t',
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false
    }) as Row[];
  } catch (error) {
    throw new Error(`TSV Darwin Core inválido: ${error instanceof Error ? error.message : 'falha de leitura'}`);
  }
  if (!rows.length) throw new Error('O arquivo Darwin Core não contém registros.');
  if (rows.length > MAX_DWC_RECORDS) throw new Error(`O limite de ${MAX_DWC_RECORDS} registros foi excedido.`);
  const headers = new Set(Object.keys(rows[0] ?? {}));
  const criteria = criteriaFor('darwin-core').map((definition) => evaluate(definition, rows, headers));
  const scored = scoreCriteria('darwin-core', criteria, threshold);

  const allPoints = rows.flatMap((row): GeoPoint[] => {
    const latitude = Number(row.decimalLatitude);
    const longitude = Number(row.decimalLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];
    return [{ latitude, longitude, label: row.scientificName || row.occurrenceID || undefined }];
  });
  const sampled = samplePoints(allPoints);
  const themeValues = rows.flatMap((row) => [row.scientificName, row.family].filter(hasText) as string[]);
  const links = uniqueStrings(rows.flatMap((row) => [row.occurrenceID, row.references, row.license])).filter(isAbsoluteUri);

  return {
    rulesVersion: RULES_VERSION,
    standard: 'darwin-core',
    standardName: STANDARD_NAMES['darwin-core'],
    file: { name: fileName, size: buffer.length, recordCount: rows.length, analyzedAt: new Date().toISOString() },
    ...scored,
    visualization: {
      points: sampled.points,
      sampledPoints: sampled.sampled,
      temporal: temporalBuckets(rows.map((row) => row.eventDate ?? '')),
      themes: countBuckets(themeValues),
      links
    }
  };
}

export function looksLikeDwc(buffer: Buffer): boolean {
  const firstLine = buffer.toString('utf8', 0, Math.min(buffer.length, 16_384)).split(/\r?\n/, 1)[0] ?? '';
  const headers = new Set(firstLine.replace(/^\uFEFF/, '').split('\t'));
  return ['scientificName', 'basisOfRecord', 'decimalLatitude', 'decimalLongitude'].filter((field) => headers.has(field)).length >= 2;
}
