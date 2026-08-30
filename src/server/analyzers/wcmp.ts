import { criteriaFor } from '../../shared/criteria.js';
import { RULES_VERSION, STANDARD_NAMES } from '../../shared/config.js';
import { scoreCriteria } from '../../shared/scoring.js';
import type { AnalysisResult, CriterionDefinition, CriterionResult } from '../../shared/types.js';
import { booleanResult, countBuckets, getPath, hasText, isAbsoluteUri, isIsoDate, temporalBuckets, uniqueStrings } from './common.js';

type JsonObject = Record<string, unknown>;

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
const asObject = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const evidence = (value: unknown): string[] => hasText(value) ? [typeof value === 'string' ? value : JSON.stringify(value).slice(0, 240)] : [];

function validGeometry(value: unknown): boolean {
  const geometry = asObject(value);
  const type = geometry.type;
  const coordinates = geometry.coordinates;
  if (typeof type !== 'string' || !['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(type)) return false;
  if (!Array.isArray(coordinates)) return false;
  const pairs: number[][] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node) && node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') pairs.push(node as number[]);
    else if (Array.isArray(node)) node.forEach(walk);
  };
  walk(coordinates);
  return pairs.length > 0 && pairs.every(([longitude, latitude]) =>
    Number.isFinite(longitude) && Number.isFinite(latitude) && longitude! >= -180 && longitude! <= 180 && latitude! >= -90 && latitude! <= 90
  );
}

function links(record: JsonObject): JsonObject[] {
  return asArray(record.links).map(asObject);
}

function evaluate(definition: CriterionDefinition, record: JsonObject): CriterionResult {
  const properties = asObject(record.properties);
  const contacts = asArray(properties.contacts).map(asObject);
  const linkItems = links(record);
  let valid = false;
  let found: unknown;
  let location = definition.field;
  switch (definition.field) {
    case 'properties.extent.temporal': {
      found = getPath(record, 'time.interval') ?? getPath(record, 'properties.extent.temporal');
      const interval = asArray(found);
      valid = interval.length >= 2 && interval.every((item) => item === '..' || isIsoDate(item));
      location = getPath(record, 'time.interval') ? 'time.interval' : definition.field;
      break;
    }
    case 'properties.themes': {
      found = properties.themes;
      valid = asArray(found).some((theme) => {
        const item = asObject(theme);
        return typeof item.scheme === 'string' && /wmo|wis\/topic-hierarchy/i.test(item.scheme) && asArray(item.concepts).length > 0;
      });
      break;
    }
    case 'properties.contacts':
      found = properties.contacts;
      valid = contacts.some((contact) => hasText(contact.organization) || hasText(contact.name));
      break;
    case 'properties.license': {
      found = properties.license ?? linkItems.find((link) => String(link.rel).toLowerCase() === 'license');
      valid = hasText(properties.license) || linkItems.some((link) => String(link.rel).toLowerCase() === 'license' && isAbsoluteUri(link.href));
      break;
    }
    case 'links':
      found = record.links;
      valid = linkItems.some((link) => isAbsoluteUri(link.href));
      break;
    case 'geometry':
      found = record.geometry;
      valid = validGeometry(found);
      break;
    case 'id':
      found = record.id;
      valid = typeof found === 'string' && /^urn:wmo:md:[^:\s]+:[^\s]+$/i.test(found);
      break;
    case 'type':
      found = record.type;
      valid = found === 'Feature';
      break;
    case 'properties': {
      found = properties;
      valid = ['type', 'title', 'description', 'created', 'themes', 'contacts', 'wmo:dataPolicy'].every((key) => hasText(properties[key]));
      break;
    }
    case 'version':
      found = properties.version ?? record.conformsTo;
      valid = hasText(properties.version) || asArray(record.conformsTo).some((item) => typeof item === 'string' && /\/wcmp\/2/i.test(item));
      location = hasText(properties.version) ? 'properties.version' : 'conformsTo';
      break;
    case 'properties.accessConstraints':
      found = properties.accessConstraints;
      valid = hasText(found);
      break;
    case 'properties.wmo:dataPolicy':
      found = properties['wmo:dataPolicy'];
      valid = ['core', 'recommended'].includes(String(found).toLowerCase());
      break;
    case 'properties.wmo:topicHierarchy': {
      found = properties['wmo:topicHierarchy'] ?? properties.themes;
      valid = hasText(properties['wmo:topicHierarchy']) || asArray(properties.themes).some((theme) => /wis\/topic-hierarchy|wmo/i.test(String(asObject(theme).scheme)));
      location = hasText(properties['wmo:topicHierarchy']) ? definition.field : 'properties.themes[].scheme';
      break;
    }
    case 'language':
      found = record.language ?? properties.language;
      valid = ['en', 'eng', 'english'].includes(String(found).toLowerCase());
      break;
    case 'properties.created':
      found = properties.created;
      valid = isIsoDate(found);
      break;
    case 'properties.pubtime':
      found = properties.pubtime;
      valid = isIsoDate(found);
      break;
    case 'properties.contacts (role)':
      found = contacts.flatMap((contact) => asArray(contact.roles));
      valid = asArray(found).some((role) => ['originator', 'custodian'].includes(String(role).toLowerCase()));
      location = 'properties.contacts[].roles';
      break;
  }
  return booleanResult(definition, valid, evidence(found), location);
}

function extractThemes(record: JsonObject): string[] {
  const properties = asObject(record.properties);
  const themes = asArray(properties.themes).flatMap((theme) => {
    const item = asObject(theme);
    return asArray(item.concepts).flatMap((concept) => {
      const value = asObject(concept);
      return [value.title, value.id].filter(hasText).map(String);
    });
  });
  return [...asArray(properties.keywords).filter(hasText).map(String), ...themes];
}

export function analyzeWcmp(record: JsonObject, buffer: Buffer, fileName: string, threshold: number): AnalysisResult {
  const criteria = criteriaFor('wcmp-2').map((definition) => evaluate(definition, record));
  const scored = scoreCriteria('wcmp-2', criteria, threshold);
  const properties = asObject(record.properties);
  const dates = [properties.created, properties.updated, properties.pubtime, ...asArray(getPath(record, 'time.interval'))]
    .filter(hasText).map(String);
  const urls = uniqueStrings(links(record).map((link) => link.href)).filter(isAbsoluteUri);
  const geometry = validGeometry(record.geometry) ? asObject(record.geometry) : undefined;
  return {
    rulesVersion: RULES_VERSION,
    standard: 'wcmp-2',
    standardName: STANDARD_NAMES['wcmp-2'],
    file: { name: fileName, size: buffer.length, recordCount: 1, analyzedAt: new Date().toISOString() },
    ...scored,
    visualization: {
      points: [],
      sampledPoints: false,
      geometry,
      temporal: temporalBuckets(dates),
      themes: countBuckets(extractThemes(record)),
      links: urls
    }
  };
}

export function parseWcmp(buffer: Buffer): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`JSON inválido: ${error instanceof Error ? error.message : 'falha de leitura'}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('O documento WCMP deve ser um objeto JSON.');
  return parsed as JsonObject;
}

export function looksLikeWcmp(record: JsonObject): boolean {
  return record.type === 'Feature'
    && Array.isArray(record.conformsTo)
    && record.conformsTo.some((item) => typeof item === 'string' && /\/wcmp\/2/i.test(item));
}
