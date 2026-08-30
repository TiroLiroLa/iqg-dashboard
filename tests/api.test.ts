import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/server/app.js';
import { analyzeFile } from '../src/server/analyzers/index.js';
import { buildSession } from '../src/shared/scoring.js';
import type { AnalysisResult, StandardId } from '../src/shared/types.js';

const fixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures');

describe('API', () => {
  it('responde ao health check', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['content-security-policy']).toContain('https://tile.openstreetmap.org');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('responde com erro padronizado para endpoints inexistentes', async () => {
    const response = await request(app).get('/api/inexistente');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } });
  });

  it('analisa upload WCMP', async () => {
    const response = await request(app).post('/api/analyses')
      .field('coverageThreshold', '.8')
      .attach('file', path.join(fixturesRoot, 'wcmp-2.json'));
    expect(response.status).toBe(201);
    expect(response.body.standard).toBe('wcmp-2');
    expect(response.body.criteria).toHaveLength(17);
  });

  it('rejeita XML com DOCTYPE', async () => {
    const malicious = Buffer.from('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><gmd:MD_Metadata>&e;</gmd:MD_Metadata>');
    const response = await request(app).post('/api/analyses').attach('file', malicious, 'danger.xml');
    expect(response.status).toBe(422);
    expect(response.body.error.message).toMatch(/DOCTYPE/);
  });

  it('bloqueia diagnóstico de endereço local sem alterar a resposta da API', async () => {
    const response = await request(app).post('/api/link-checks').send({ urls: ['http://127.0.0.1/private'] });
    expect(response.status).toBe(200);
    expect(response.body.diagnostics[0].ok).toBe(false);
    expect(response.body.diagnostics[0].message).toMatch(/privado|local/i);
  });

  it('gera um PDF paginado para uma sessão completa', async () => {
    const files: Array<[StandardId, string]> = [
      ['darwin-core', path.join(fixturesRoot, 'darwin-core.tsv')],
      ['wcmp-2', path.join(fixturesRoot, 'wcmp-2.json')],
      ['iso-19115', path.join(fixturesRoot, 'iso-19115.xml')]
    ];
    const analyses: Partial<Record<StandardId, AnalysisResult>> = {};
    for (const [standard, filePath] of files) {
      analyses[standard] = analyzeFile(fs.readFileSync(filePath), path.basename(filePath), .8);
    }
    const session = buildSession('pdf-test', analyses, .8);
    const response = await request(app).post('/api/reports/pdf').send(session).buffer(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    const pdf = Buffer.from(response.body);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const pageCount = pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(pageCount).toBeGreaterThan(1);
    expect(pageCount).toBeLessThanOrEqual(7);
  });
});
