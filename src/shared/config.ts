import type { DimensionName, StandardId } from './types.js';

export const RULES_VERSION = '2026.08-matriz-v2-61';

export const STANDARD_NAMES: Record<StandardId, string> = {
  'darwin-core': 'Darwin Core',
  'wcmp-2': 'WCMP 2.0',
  'iso-19115': 'ISO 19115'
};

export const STANDARD_WEIGHTS: Record<StandardId, number> = {
  'darwin-core': 0.2,
  'wcmp-2': 0.4,
  'iso-19115': 0.4
};

export const DIMENSION_WEIGHTS: Record<DimensionName, number> = {
  Interpretabilidade: 0.1,
  Reputação: 0.05,
  Acurácia: 0.15,
  Temporalidade: 0.15,
  Completude: 0.2,
  Acessibilidade: 0.1,
  Consistência: 0.2,
  'Segurança de Acesso': 0.05
};

export const DEFAULT_COVERAGE_THRESHOLD = 0.8;
export const MIN_COVERAGE_THRESHOLD = 0.51;
export const MAX_COVERAGE_THRESHOLD = 1;
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_DWC_RECORDS = 100_000;
export const MAX_MAP_POINTS = 2_000;
