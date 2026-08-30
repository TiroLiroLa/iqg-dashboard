import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { criteriaFor } from '../../shared/criteria.js';
import { RULES_VERSION, STANDARD_NAMES } from '../../shared/config.js';
import { scoreCriteria } from '../../shared/scoring.js';
import type { AnalysisResult, CriterionDefinition, CriterionResult, GeoExtent } from '../../shared/types.js';
import { booleanResult, countBuckets, hasText, isAbsoluteUri, isIsoDate, temporalBuckets, uniqueStrings } from './common.js';

type XmlObject = Record<string, unknown>;

const TOPIC_CODES = new Set([
  'farming', 'biota', 'boundaries', 'climatologyMeteorologyAtmosphere', 'economy', 'elevation',
  'environment', 'geoscientificInformation', 'health', 'imageryBaseMapsEarthCover', 'intelligenceMilitary',
  'inlandWaters', 'location', 'oceans', 'planningCadastre', 'society', 'structure', 'transportation',
  'utilitiesCommunication', 'extraTerrestrial', 'disaster'
].map((value) => value.toLowerCase()));
const ROLE_CODES = new Set([
  'resourceprovider', 'custodian', 'owner', 'user', 'distributor', 'originator', 'pointofcontact',
  'principalinvestigator', 'processor', 'publisher', 'author', 'sponsor', 'coauthor', 'collaborator', 'editor',
  'mediator', 'rightsHolder', 'contributor', 'funder', 'stakeholder'
].map((value) => value.toLowerCase()));

function findNodes(root: unknown, key: string): unknown[] {
  const found: unknown[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [name, value] of Object.entries(node as XmlObject)) {
      if (name === key) found.push(value);
      visit(value);
    }
  };
  visit(root);
  return found;
}

function scalarValues(node: unknown): string[] {
  const values: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) values.push(text);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value as XmlObject).forEach(visit);
  };
  visit(node);
  return values;
}

function valuesFor(root: XmlObject, key: string): string[] {
  return uniqueStrings(findNodes(root, key).flatMap(scalarValues));
}

function nodeContains(root: XmlObject, key: string, matcher?: RegExp): boolean {
  const values = valuesFor(root, key);
  return matcher ? values.some((value) => matcher.test(value)) : values.some(hasText);
}

function evaluate(definition: CriterionDefinition, root: XmlObject): CriterionResult {
  let valid = false;
  let values: string[] = [];
  let location = `//*[local-name()='${definition.field}']`;
  switch (definition.field) {
    case 'abstract':
    case 'purpose':
    case 'title':
    case 'language':
    case 'topicCategory':
    case 'maintenanceAndUpdateFrequency':
      values = valuesFor(root, definition.field);
      valid = values.some(hasText);
      break;
    case 'referenceSystemIdentifier':
      values = valuesFor(root, definition.field);
      valid = values.some((value) => /EPSG/i.test(value) && /\d{3,6}/.test(value));
      break;
    case 'lineage':
      values = [...valuesFor(root, 'statement'), ...valuesFor(root, 'lineage')];
      valid = values.some((value) => value.length > 3);
      location = "//*[local-name()='lineage']";
      break;
    case 'MD_Constraints':
      values = [...valuesFor(root, 'MD_Constraints'), ...valuesFor(root, 'MD_LegalConstraints'), ...valuesFor(root, 'resourceConstraints')];
      valid = values.some(hasText);
      location = "//*[local-name()='resourceConstraints']";
      break;
    case 'date': {
      const dateStamp = valuesFor(root, 'dateStamp');
      const creationDates = findNodes(root, 'CI_Date').flatMap((node) => {
        const scalar = scalarValues(node);
        return scalar.some((value) => /creation/i.test(value)) ? scalar : [];
      });
      values = [...dateStamp, ...creationDates];
      valid = values.some(isIsoDate);
      location = "//*[local-name()='dateStamp' or local-name()='CI_Date']";
      break;
    }
    case 'MD_TopicCategoryCode':
      values = valuesFor(root, 'MD_TopicCategoryCode');
      valid = values.some((value) => TOPIC_CODES.has(value.toLowerCase()));
      break;
    case 'CI_Date':
      values = findNodes(root, 'CI_Date').flatMap((node) => {
        const scalar = scalarValues(node);
        return scalar.some((value) => /revision/i.test(value)) ? scalar : [];
      });
      valid = values.some(isIsoDate);
      break;
    case 'MD_SecurityConstraints':
      values = valuesFor(root, 'MD_SecurityConstraints');
      valid = values.some(hasText);
      break;
    case 'spatialResolution':
      values = [...valuesFor(root, 'spatialResolution'), ...valuesFor(root, 'equivalentScale'), ...valuesFor(root, 'distance')];
      valid = values.some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
      break;
    case 'distributionFormat':
      values = [...valuesFor(root, 'distributionFormat'), ...valuesFor(root, 'resourceFormat'), ...valuesFor(root, 'MD_Format')];
      valid = values.some(hasText);
      location = "//*[local-name()='distributionFormat' or local-name()='resourceFormat']";
      break;
    case 'role (CI_RoleCode)':
      values = valuesFor(root, 'CI_RoleCode');
      valid = values.some((value) => ROLE_CODES.has(value.toLowerCase().replace(/\s/g, '')));
      location = "//*[local-name()='CI_RoleCode']";
      break;
    case 'characterSet (defaultLocale)':
      values = [...valuesFor(root, 'characterSet'), ...valuesFor(root, 'defaultLocale'), ...valuesFor(root, 'characterEncoding')];
      valid = values.some((value) => /utf-?8|utf8/i.test(value));
      location = "//*[local-name()='characterSet' or local-name()='defaultLocale']";
      break;
  }
  return booleanResult(definition, valid, values.slice(0, 5), location);
}

function numericValue(root: XmlObject, key: string): number | undefined {
  const value = valuesFor(root, key).find((item) => Number.isFinite(Number(item)));
  return value === undefined ? undefined : Number(value);
}

function extentFrom(root: XmlObject): GeoExtent | undefined {
  const west = numericValue(root, 'westBoundLongitude');
  const east = numericValue(root, 'eastBoundLongitude');
  const south = numericValue(root, 'southBoundLatitude');
  const north = numericValue(root, 'northBoundLatitude');
  if ([west, east, south, north].some((value) => value === undefined)) return undefined;
  return { west: west!, east: east!, south: south!, north: north! };
}

export function parseIso(buffer: Buffer): XmlObject {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (/<!DOCTYPE/i.test(text)) throw new Error('XML com DOCTYPE não é aceito por segurança.');
  const validation = XMLValidator.validate(text);
  if (validation !== true) throw new Error(`XML inválido: ${validation.err.msg} (linha ${validation.err.line}).`);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    processEntities: false,
    trimValues: true,
    parseTagValue: false
  });
  const parsed = parser.parse(text) as XmlObject;
  return parsed;
}

export function looksLikeIso(root: XmlObject): boolean {
  return Object.keys(root).some((key) => key === 'MD_Metadata' || key === 'MI_Metadata');
}

export function analyzeIso(root: XmlObject, buffer: Buffer, fileName: string, threshold: number): AnalysisResult {
  const criteria = criteriaFor('iso-19115').map((definition) => evaluate(definition, root));
  const scored = scoreCriteria('iso-19115', criteria, threshold);
  const dates = uniqueStrings([
    ...valuesFor(root, 'Date'), ...valuesFor(root, 'DateTime'), ...valuesFor(root, 'TimePosition'), ...valuesFor(root, 'dateStamp')
  ]);
  const themes = [...valuesFor(root, 'MD_TopicCategoryCode'), ...valuesFor(root, 'keyword')];
  const urls = uniqueStrings(valuesFor(root, 'URL')).filter(isAbsoluteUri);
  return {
    rulesVersion: RULES_VERSION,
    standard: 'iso-19115',
    standardName: STANDARD_NAMES['iso-19115'],
    file: { name: fileName, size: buffer.length, recordCount: 1, analyzedAt: new Date().toISOString() },
    ...scored,
    visualization: {
      points: [],
      sampledPoints: false,
      extent: extentFrom(root),
      temporal: temporalBuckets(dates),
      themes: countBuckets(themes),
      links: urls
    }
  };
}
