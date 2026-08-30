import { describe, expect, it } from 'vitest';
import { CRITERIA } from '../src/shared/criteria.js';
import { buildSession, calculateIqg, classify, scoreCriteria } from '../src/shared/scoring.js';
import type { AnalysisResult, CriterionResult, StandardId } from '../src/shared/types.js';

function fakeAnalysis(standard: StandardId, score: number): AnalysisResult {
  return {
    rulesVersion: 'test', standard, standardName: standard, coverageThreshold: .8,
    file: { name: `${standard}.test`, size: 1, recordCount: 1, analyzedAt: new Date(0).toISOString() },
    criteria: [], dimensions: [], score, passing: 0, failing: 0,
    visualization: { points: [], sampledPoints: false, temporal: [], themes: [], links: [] }
  };
}

describe('matriz e pontuação', () => {
  it('mantém exatamente os 61 critérios da matriz', () => {
    expect(CRITERIA).toHaveLength(61);
    expect(CRITERIA.filter((item) => item.standard === 'darwin-core')).toHaveLength(27);
    expect(CRITERIA.filter((item) => item.standard === 'wcmp-2')).toHaveLength(17);
    expect(CRITERIA.filter((item) => item.standard === 'iso-19115')).toHaveLength(17);
  });

  it('calcula o IQG de referência e a classificação', () => {
    const iqg = calculateIqg({
      'darwin-core': fakeAnalysis('darwin-core', 80),
      'wcmp-2': fakeAnalysis('wcmp-2', 90),
      'iso-19115': fakeAnalysis('iso-19115', 70)
    });
    expect(iqg).toBe(80);
    expect(classify(iqg!)).toBe('Aceitável');
  });

  it('respeita os limites de classificação', () => {
    expect(classify(69.99)).toBe('Perigoso');
    expect(classify(70)).toBe('Aceitável');
    expect(classify(84.99)).toBe('Aceitável');
    expect(classify(85)).toBe('Confiável');
  });

  it('recalcula a cobertura Darwin Core sem reler o arquivo', () => {
    const definition = CRITERIA.find((item) => item.standard === 'darwin-core')!;
    const criterion: CriterionResult = { ...definition, passed: false, validCount: 7, applicableCount: 10, coverage: .7, evidence: [], location: 'test', message: '' };
    expect(scoreCriteria('darwin-core', [criterion], .8).passing).toBe(0);
    expect(scoreCriteria('darwin-core', [criterion], .6).passing).toBe(1);
  });

  it('não publica IQG em sessão incompleta', () => {
    const value = buildSession('x', { 'darwin-core': fakeAnalysis('darwin-core', 100) }, .8);
    expect(value.complete).toBe(false);
    expect(value.iqg).toBeNull();
  });
});
