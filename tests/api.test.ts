import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/server/app.js';
import { analyzeFile } from '../src/server/analyzers/index.js';
import { buildSession } from '../src/shared/scoring.js';
import type { AnalysisResult, StandardId } from '../src/shared/types.js';

const icRoot = path.resolve(process.cwd(), '..', '..', 'IC');

describe('API', () => {
  it('responde ao health check', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('analisa upload WCMP', async () => {
    const response = await request(app).post('/api/analyses')
      .field('coverageThreshold', '.8')
      .attach('file', path.join(icRoot, 'padroes_para_teste', 'metadados_wcmp2_inmet.json'));
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
      ['darwin-core', path.join(icRoot, 'padroes_para_teste', 'occurrence.txt')],
      ['wcmp-2', path.join(icRoot, 'padroes_para_teste', 'metadados_wcmp2_inmet.json')],
      ['iso-19115', path.join(icRoot, 'padroes_para_teste', 'dados_iso.xml')]
    ];
    const analyses: Partial<Record<StandardId, AnalysisResult>> = {};
    for (const [standard, filePath] of files) {
      analyses[standard] = analyzeFile(fs.readFileSync(filePath), path.basename(filePath), .8);
    }
    const session = buildSession('pdf-test', analyses, .8);
    const response = await request(app).post('/api/reports/pdf').send(session).buffer(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.from(response.body).subarray(0, 4).toString()).toBe('%PDF');
  });
});
