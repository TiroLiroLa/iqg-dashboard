import {
  DIMENSIONS,
  STANDARD_IDS,
  type AnalysisResult,
  type CriterionResult,
  type DimensionScore,
  type QualityClassification,
  type SessionEvaluation,
  type StandardId
} from './types.js';
import { DIMENSION_WEIGHTS, STANDARD_WEIGHTS } from './config.js';

const round = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function classify(score: number): QualityClassification {
  if (score >= 85) return 'Confiável';
  if (score >= 70) return 'Aceitável';
  return 'Perigoso';
}

export function applyThreshold(result: CriterionResult, standard: StandardId, threshold: number): CriterionResult {
  const passed = standard === 'darwin-core'
    ? result.applicableCount > 0 && result.coverage >= threshold
    : result.applicableCount > 0 && result.validCount === result.applicableCount;
  return {
    ...result,
    passed,
    message: passed
      ? `Critério atendido (${(result.coverage * 100).toFixed(1)}% de cobertura).`
      : `Critério não atendido (${(result.coverage * 100).toFixed(1)}% de cobertura).`
  };
}

export function scoreCriteria(
  standard: StandardId,
  criteria: CriterionResult[],
  threshold: number
): Pick<AnalysisResult, 'criteria' | 'dimensions' | 'score' | 'passing' | 'failing' | 'coverageThreshold'> {
  const scored = criteria.map((criterion) => applyThreshold(criterion, standard, threshold));
  const dimensions: DimensionScore[] = DIMENSIONS.map((dimension) => {
    const items = scored.filter((criterion) => criterion.dimension === dimension);
    const passing = items.filter((criterion) => criterion.passed).length;
    const score = items.length ? (passing / items.length) * 100 : 0;
    const weight = DIMENSION_WEIGHTS[dimension];
    return {
      dimension,
      score: round(score),
      weight,
      passing,
      failing: items.length - passing,
      total: items.length,
      contribution: round(score * weight)
    };
  });
  const score = round(dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0));
  const passing = scored.filter((criterion) => criterion.passed).length;
  return {
    criteria: scored,
    dimensions,
    score,
    passing,
    failing: scored.length - passing,
    coverageThreshold: threshold
  };
}

export function rescoreAnalysis(analysis: AnalysisResult, threshold: number): AnalysisResult {
  return { ...analysis, ...scoreCriteria(analysis.standard, analysis.criteria, threshold) };
}

export function calculateIqg(analyses: Partial<Record<StandardId, AnalysisResult>>): number | null {
  if (!STANDARD_IDS.every((standard) => analyses[standard])) return null;
  return round(STANDARD_IDS.reduce((sum, standard) => sum + analyses[standard]!.score * STANDARD_WEIGHTS[standard], 0));
}

export function buildSession(
  id: string,
  analyses: Partial<Record<StandardId, AnalysisResult>>,
  coverageThreshold: number
): SessionEvaluation {
  const rescored: Partial<Record<StandardId, AnalysisResult>> = {};
  for (const standard of STANDARD_IDS) {
    const analysis = analyses[standard];
    if (analysis) rescored[standard] = rescoreAnalysis(analysis, coverageThreshold);
  }
  const iqg = calculateIqg(rescored);
  return {
    id,
    updatedAt: new Date().toISOString(),
    coverageThreshold,
    analyses: rescored,
    complete: iqg !== null,
    iqg,
    classification: iqg === null ? null : classify(iqg)
  };
}
