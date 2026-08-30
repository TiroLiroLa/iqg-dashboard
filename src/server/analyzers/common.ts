import type { CriterionDefinition, CriterionResult, TemporalBucket, ThemeBucket } from '../../shared/types.js';

export const hasText = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;

export const isIsoDate = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parts = value.trim().split('/');
  return parts.every((part) => part === '..' || (!Number.isNaN(Date.parse(part)) && /^\d{4}-\d{2}-\d{2}/.test(part)));
};

export const isAbsoluteUri = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mqtt:', 'mqtts:', 'ftp:'].includes(url.protocol);
  } catch {
    return false;
  }
};

export function resultFromCounts(
  definition: CriterionDefinition,
  validCount: number,
  applicableCount: number,
  evidence: string[],
  location: string
): CriterionResult {
  const coverage = applicableCount > 0 ? validCount / applicableCount : 0;
  return {
    ...definition,
    passed: false,
    validCount,
    applicableCount,
    coverage,
    evidence: evidence.slice(0, 5),
    location,
    message: ''
  };
}

export function booleanResult(
  definition: CriterionDefinition,
  valid: boolean,
  evidence: string[] = [],
  location = definition.field
): CriterionResult {
  return resultFromCounts(definition, valid ? 1 : 0, 1, evidence, location);
}

export function countBuckets(values: string[], limit = 10): ThemeBucket[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export function temporalBuckets(values: string[]): TemporalBucket[] {
  const years: string[] = [];
  for (const value of values) {
    const match = value.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
    if (match?.[1]) years.push(match[1]);
  }
  return countBuckets(years, 200).sort((a, b) => a.label.localeCompare(b.label));
}

export function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter(hasText).map((value) => String(value).trim()))];
}

export function getPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, root);
}
