export const STANDARD_IDS = ['darwin-core', 'wcmp-2', 'iso-19115'] as const;
export type StandardId = (typeof STANDARD_IDS)[number];

export const DIMENSIONS = [
  'Interpretabilidade',
  'Reputação',
  'Acurácia',
  'Temporalidade',
  'Completude',
  'Acessibilidade',
  'Consistência',
  'Segurança de Acesso'
] as const;
export type DimensionName = (typeof DIMENSIONS)[number];

export type QualityClassification = 'Confiável' | 'Aceitável' | 'Perigoso';

export interface CriterionDefinition {
  id: string;
  standard: StandardId;
  dimension: DimensionName;
  field: string;
  question: string;
}

export interface CriterionResult extends CriterionDefinition {
  passed: boolean;
  validCount: number;
  applicableCount: number;
  coverage: number;
  evidence: string[];
  location: string;
  message: string;
}

export interface DimensionScore {
  dimension: DimensionName;
  score: number;
  weight: number;
  passing: number;
  failing: number;
  total: number;
  contribution: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface GeoExtent {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface TemporalBucket {
  label: string;
  count: number;
}

export interface ThemeBucket {
  label: string;
  count: number;
}

export interface VisualizationData {
  points: GeoPoint[];
  sampledPoints: boolean;
  geometry?: Record<string, unknown>;
  extent?: GeoExtent;
  temporal: TemporalBucket[];
  themes: ThemeBucket[];
  links: string[];
}

export interface FileSummary {
  name: string;
  size: number;
  recordCount: number;
  analyzedAt: string;
}

export interface AnalysisResult {
  rulesVersion: string;
  standard: StandardId;
  standardName: string;
  file: FileSummary;
  coverageThreshold: number;
  criteria: CriterionResult[];
  dimensions: DimensionScore[];
  score: number;
  passing: number;
  failing: number;
  visualization: VisualizationData;
}

export interface SessionEvaluation {
  id: string;
  updatedAt: string;
  coverageThreshold: number;
  analyses: Partial<Record<StandardId, AnalysisResult>>;
  complete: boolean;
  iqg: number | null;
  classification: QualityClassification | null;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

export interface LinkDiagnostic {
  url: string;
  ok: boolean;
  status?: number;
  message: string;
}
