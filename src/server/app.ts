import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { z } from 'zod';
import { analyzeFile } from './analyzers/index.js';
import { checkLink } from './link-checker.js';
import { createPdfReport } from './report.js';
import { MAX_COVERAGE_THRESHOLD, MAX_FILE_SIZE, MIN_COVERAGE_THRESHOLD } from '../shared/config.js';
import type { ApiErrorPayload, SessionEvaluation } from '../shared/types.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 4, parts: 5 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension && ['.txt', '.tsv', '.json', '.xml'].includes(extension)) callback(null, true);
    else callback(new Error('Extensão não suportada.'));
  }
});

const linksSchema = z.object({ urls: z.array(z.string().url()).max(20) });

function apiError(code: string, message: string, details?: string[]): ApiErrorPayload {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'iqg-dashboard' }));

app.post('/api/analyses', upload.single('file'), (request, response) => {
  if (!request.file) return response.status(400).json(apiError('FILE_REQUIRED', 'Selecione um arquivo para análise.'));
  const threshold = Number(request.body.coverageThreshold ?? 0.8);
  if (!Number.isFinite(threshold) || threshold < MIN_COVERAGE_THRESHOLD || threshold > MAX_COVERAGE_THRESHOLD) {
    return response.status(400).json(apiError('INVALID_THRESHOLD', 'O limiar deve estar entre 51% e 100%.'));
  }
  try {
    const result = analyzeFile(request.file.buffer, path.basename(request.file.originalname), threshold);
    return response.status(201).json(result);
  } catch (error) {
    return response.status(422).json(apiError('UNPROCESSABLE_METADATA', error instanceof Error ? error.message : 'Não foi possível analisar o arquivo.'));
  }
});

app.post('/api/reports/pdf', async (request, response) => {
  const input = request.body as SessionEvaluation;
  if (!input || typeof input !== 'object' || !input.id || !input.analyses || !Number.isFinite(input.coverageThreshold)) {
    return response.status(400).json(apiError('INVALID_SESSION', 'Sessão de avaliação inválida.'));
  }
  const buffer = await createPdfReport(input);
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="relatorio-iqg-${input.id}.pdf"`);
  return response.send(buffer);
});

app.post('/api/link-checks', async (request, response) => {
  const parsed = linksSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(apiError('INVALID_URLS', 'Forneça até 20 URLs HTTP(S) válidas.'));
  const diagnostics = [];
  for (const url of parsed.data.urls) diagnostics.push(await checkLink(url));
  return response.json({ diagnostics });
});

const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(path.join(distPath, 'index.html')));

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json(apiError('FILE_TOO_LARGE', 'O arquivo excede o limite de 20 MB.'));
    return;
  }
  response.status(400).json(apiError('BAD_REQUEST', error instanceof Error ? error.message : 'Requisição inválida.'));
};
app.use(errorHandler);
