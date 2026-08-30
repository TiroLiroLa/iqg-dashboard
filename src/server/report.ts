import PDFDocument from 'pdfkit';
import { buildSession } from '../shared/scoring.js';
import { DIMENSIONS, STANDARD_IDS, type SessionEvaluation } from '../shared/types.js';
import { DIMENSION_WEIGHTS, STANDARD_WEIGHTS } from '../shared/config.js';

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > doc.page.height - 54) doc.addPage();
}

function heading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 42);
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(15).fillColor('#0f766e').text(text);
  doc.moveDown(0.3).strokeColor('#cbd5e1').moveTo(54, doc.y).lineTo(541, doc.y).stroke().moveDown(0.4);
}

function scoreBar(doc: PDFKit.PDFDocument, label: string, score: number, color: string): void {
  ensureSpace(doc, 28);
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor('#334155').text(label, 54, y, { width: 180 });
  doc.roundedRect(240, y + 1, 220, 10, 5).fill('#e2e8f0');
  doc.roundedRect(240, y + 1, Math.max(2, 220 * score / 100), 10, 5).fill(color);
  doc.font('Helvetica-Bold').fillColor('#0f172a').text(`${score.toFixed(1)}%`, 470, y - 1, { width: 70, align: 'right' });
  doc.y = y + 20;
}

export function createPdfReport(input: SessionEvaluation): Promise<Buffer> {
  const session = buildSession(input.id, input.analyses, input.coverageThreshold);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 54,
      bufferPages: true,
      info: { Title: 'Relatório IQG de Qualidade de Metadados' }
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, 120).fill('#0f172a');
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#ffffff').text('IQG Dashboard', 54, 42);
    doc.font('Helvetica').fontSize(12).fillColor('#94a3b8').text('Relatório de Qualidade de Metadados Geoespaciais', 54, 76);
    doc.y = 145;
    doc.fillColor('#334155').fontSize(9).text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Regras ${Object.values(session.analyses)[0]?.rulesVersion ?? 'sem análises'}`);

    heading(doc, 'Resultado geral');
    if (session.complete && session.iqg !== null) {
      const color = session.classification === 'Confiável' ? '#10b981' : session.classification === 'Aceitável' ? '#f59e0b' : '#ef4444';
      doc.font('Helvetica-Bold').fontSize(34).fillColor(color).text(session.iqg.toFixed(2), { continued: true });
      doc.fontSize(14).text(`  ${session.classification}`);
    } else {
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#f59e0b').text('Sessão incompleta');
      doc.font('Helvetica').fontSize(10).fillColor('#475569').text('O IQG requer um arquivo válido de cada padrão.');
    }
    doc.moveDown(0.4).font('Helvetica').fontSize(9).fillColor('#475569')
      .text(`Limiar Darwin Core: ${(session.coverageThreshold * 100).toFixed(0)}% · Pesos: Darwin Core 20%, WCMP 40%, ISO 19115 40%.`);

    heading(doc, 'Arquivos e notas por padrão');
    for (const standard of STANDARD_IDS) {
      const analysis = session.analyses[standard];
      if (!analysis) {
        doc.font('Helvetica').fontSize(10).fillColor('#94a3b8').text(`${standard}: não carregado`).moveDown(0.3);
        continue;
      }
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(`${analysis.standardName} — ${analysis.file.name}`);
      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
        .text(`${analysis.file.recordCount} registro(s) · ${analysis.passing}/${analysis.criteria.length} critérios conformes · peso ${(STANDARD_WEIGHTS[standard] * 100).toFixed(0)}%`);
      scoreBar(doc, 'Nota do padrão', analysis.score, '#06b6d4');
    }

    heading(doc, 'Dimensões');
    for (const dimension of DIMENSIONS) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
        .text(`${dimension} (${(DIMENSION_WEIGHTS[dimension] * 100).toFixed(0)}%)`);
      for (const standard of STANDARD_IDS) {
        const analysis = session.analyses[standard];
        const score = analysis?.dimensions.find((item) => item.dimension === dimension);
        if (analysis && score) scoreBar(doc, analysis.standardName, score.score, '#8b5cf6');
      }
      doc.moveDown(0.2);
    }

    heading(doc, 'Resumo exploratório');
    for (const standard of STANDARD_IDS) {
      const analysis = session.analyses[standard];
      if (!analysis) continue;
      ensureSpace(doc, 52);
      const visualization = analysis.visualization;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(analysis.standardName);
      doc.font('Helvetica').fontSize(9).fillColor('#475569')
        .text(`Geografia: ${visualization.points.length} ponto(s)${visualization.extent ? `; extensão O ${visualization.extent.west}, L ${visualization.extent.east}, S ${visualization.extent.south}, N ${visualization.extent.north}` : ''}.`)
        .text(`Períodos: ${visualization.temporal.map((item) => `${item.label} (${item.count})`).join(', ') || 'não informado'}.`)
        .text(`Temas principais: ${visualization.themes.map((item) => `${item.label} (${item.count})`).join(', ') || 'não informado'}.`);
    }

    heading(doc, 'Apêndice de critérios');
    for (const standard of STANDARD_IDS) {
      const analysis = session.analyses[standard];
      if (!analysis) continue;
      ensureSpace(doc, 30);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(analysis.standardName).moveDown(0.2);
      for (const criterion of analysis.criteria) {
        ensureSpace(doc, 42);
        const y = doc.y;
        doc.circle(59, y + 5, 4).fill(criterion.passed ? '#10b981' : '#ef4444');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
          .text(`${criterion.field} · ${criterion.dimension}`, 70, y, { width: 465 });
        doc.font('Helvetica').fontSize(8).fillColor('#475569')
          .text(criterion.question, 70, doc.y + 1, { width: 465 })
          .text(`Cobertura ${(criterion.coverage * 100).toFixed(1)}% (${criterion.validCount}/${criterion.applicableCount}) · ${criterion.message}`, 70, doc.y + 1, { width: 465 });
        doc.moveDown(0.35);
      }
    }

    const pages = doc.bufferedPageRange?.();
    if (pages) {
      for (let index = pages.start; index < pages.start + pages.count; index += 1) {
        doc.switchToPage(index);
        doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
          .text(`IQG Dashboard · página ${index + 1}`, 54, doc.page.height - 34, { width: 487, align: 'center' });
      }
    }
    doc.end();
  });
}
