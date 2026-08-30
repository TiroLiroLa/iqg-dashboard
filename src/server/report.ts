import PDFDocument from 'pdfkit';
import { buildSession } from '../shared/scoring.js';
import { DIMENSIONS, STANDARD_IDS, type CriterionResult, type SessionEvaluation } from '../shared/types.js';
import { DIMENSION_WEIGHTS, STANDARD_WEIGHTS } from '../shared/config.js';

const PAGE_MARGIN = 54;
const CONTENT_WIDTH = 487;
const FOOTER_Y_OFFSET = 34;

function resetCursor(doc: PDFKit.PDFDocument, y = doc.y): void {
  doc.x = PAGE_MARGIN;
  doc.y = y;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
  resetCursor(doc);
}

function textHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  size: number,
  width = CONTENT_WIDTH
): number {
  doc.font(font).fontSize(size);
  return doc.heightOfString(text, { width, lineGap: 0 });
}

function heading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 52);
  const titleY = doc.y + 10;
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f766e')
    .text(text, PAGE_MARGIN, titleY, { width: CONTENT_WIDTH, lineGap: 0 });
  const ruleY = doc.y + 5;
  doc.strokeColor('#cbd5e1').moveTo(PAGE_MARGIN, ruleY).lineTo(PAGE_MARGIN + CONTENT_WIDTH, ruleY).stroke();
  resetCursor(doc, ruleY + 12);
}

function scoreBar(doc: PDFKit.PDFDocument, label: string, score: number, color: string): void {
  ensureSpace(doc, 25);
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor('#334155')
    .text(label, PAGE_MARGIN, y, { width: 180, lineBreak: false });
  doc.roundedRect(240, y + 1, 220, 10, 5).fill('#e2e8f0');
  doc.roundedRect(240, y + 1, Math.max(2, 220 * score / 100), 10, 5).fill(color);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
    .text(`${score.toFixed(1)}%`, 470, y - 1, { width: 70, align: 'right', lineBreak: false });
  resetCursor(doc, y + 20);
}

function criterionHeight(doc: PDFKit.PDFDocument, criterion: CriterionResult): number {
  const detail = `Cobertura ${(criterion.coverage * 100).toFixed(1)}% (${criterion.validCount}/${criterion.applicableCount}) - ${criterion.message}`;
  return textHeight(doc, `${criterion.field} - ${criterion.dimension}`, 'Helvetica-Bold', 8.5, 465)
    + textHeight(doc, criterion.question, 'Helvetica', 8, 465)
    + textHeight(doc, detail, 'Helvetica', 8, 465)
    + 8;
}

function writeCriterion(doc: PDFKit.PDFDocument, criterion: CriterionResult): void {
  const height = criterionHeight(doc, criterion);
  ensureSpace(doc, height);
  const y = doc.y;
  const title = `${criterion.field} - ${criterion.dimension}`;
  const detail = `Cobertura ${(criterion.coverage * 100).toFixed(1)}% (${criterion.validCount}/${criterion.applicableCount}) - ${criterion.message}`;
  const titleHeight = textHeight(doc, title, 'Helvetica-Bold', 8.5, 465);
  const questionHeight = textHeight(doc, criterion.question, 'Helvetica', 8, 465);
  const detailHeight = textHeight(doc, detail, 'Helvetica', 8, 465);

  doc.circle(59, y + 5, 4).fill(criterion.passed ? '#10b981' : '#ef4444');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
    .text(title, 70, y, { width: 465, lineGap: 0 });
  doc.font('Helvetica').fontSize(8).fillColor('#475569')
    .text(criterion.question, 70, y + titleHeight, { width: 465, lineGap: 0 })
    .text(detail, 70, y + titleHeight + questionHeight, { width: 465, lineGap: 0 });
  resetCursor(doc, y + titleHeight + questionHeight + detailHeight + 8);
}

export function createPdfReport(input: SessionEvaluation): Promise<Buffer> {
  const session = buildSession(input.id, input.analyses, input.coverageThreshold);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: { Title: 'Relatório IQG de Qualidade de Metadados' }
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, 120).fill('#0f172a');
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#ffffff')
      .text('IQG Dashboard', PAGE_MARGIN, 42, { width: CONTENT_WIDTH, lineBreak: false });
    doc.font('Helvetica').fontSize(12).fillColor('#94a3b8')
      .text('Relatório de Qualidade de Metadados Geoespaciais', PAGE_MARGIN, 76, { width: CONTENT_WIDTH, lineBreak: false });
    resetCursor(doc, 145);
    doc.fillColor('#334155').fontSize(9)
      .text(`Gerado em ${new Date().toLocaleString('pt-BR')} - Regras ${Object.values(session.analyses)[0]?.rulesVersion ?? 'sem análises'}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    resetCursor(doc);

    heading(doc, 'Resultado geral');
    if (session.complete && session.iqg !== null) {
      const color = session.classification === 'Confiável' ? '#10b981' : session.classification === 'Aceitável' ? '#f59e0b' : '#ef4444';
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(34).fillColor(color)
        .text(session.iqg.toFixed(2), PAGE_MARGIN, y, { width: 160, lineBreak: false });
      doc.fontSize(14).fillColor(color)
        .text(session.classification ?? 'Sem classificação', 220, y + 12, { width: 300, lineBreak: false });
      resetCursor(doc, y + 42);
    } else {
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#f59e0b')
        .text('Sessão incompleta', PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.font('Helvetica').fontSize(10).fillColor('#475569')
        .text('O IQG requer um arquivo válido de cada padrão.', PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      resetCursor(doc);
    }
    doc.y += 4;
    doc.font('Helvetica').fontSize(9).fillColor('#475569')
      .text(`Limiar Darwin Core: ${(session.coverageThreshold * 100).toFixed(0)}% - Pesos: Darwin Core 20%, WCMP 40%, ISO 19115 40%.`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    resetCursor(doc);

    heading(doc, 'Arquivos e notas por padrão');
    for (const standard of STANDARD_IDS) {
      const analysis = session.analyses[standard];
      if (!analysis) {
        ensureSpace(doc, 20);
        doc.font('Helvetica').fontSize(10).fillColor('#94a3b8')
          .text(`${standard}: não carregado`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        resetCursor(doc, doc.y + 4);
        continue;
      }
      ensureSpace(doc, 52);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
        .text(`${analysis.standardName} - ${analysis.file.name}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
        .text(`${analysis.file.recordCount} registro(s) - ${analysis.passing}/${analysis.criteria.length} critérios conformes - peso ${(STANDARD_WEIGHTS[standard] * 100).toFixed(0)}%`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      resetCursor(doc, doc.y + 3);
      scoreBar(doc, 'Nota do padrão', analysis.score, '#06b6d4');
    }

    heading(doc, 'Dimensões');
    for (const dimension of DIMENSIONS) {
      const scores = STANDARD_IDS.flatMap((standard) => {
        const analysis = session.analyses[standard];
        const score = analysis?.dimensions.find((item) => item.dimension === dimension);
        return analysis && score ? [{ analysis, score }] : [];
      });
      ensureSpace(doc, 20 + scores.length * 20);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
        .text(`${dimension} (${(DIMENSION_WEIGHTS[dimension] * 100).toFixed(0)}%)`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      resetCursor(doc, doc.y + 3);
      for (const { analysis, score } of scores) {
        scoreBar(doc, analysis.standardName, score.score, '#8b5cf6');
      }
      doc.y += 3;
    }

    heading(doc, 'Resumo exploratório');
    for (const standard of STANDARD_IDS) {
      const analysis = session.analyses[standard];
      if (!analysis) continue;
      const visualization = analysis.visualization;
      const lines = [
        `Geografia: ${visualization.points.length} ponto(s)${visualization.extent ? `; extensão O ${visualization.extent.west}, L ${visualization.extent.east}, S ${visualization.extent.south}, N ${visualization.extent.north}` : ''}.`,
        `Períodos: ${visualization.temporal.map((item) => `${item.label} (${item.count})`).join(', ') || 'não informado'}.`,
        `Temas principais: ${visualization.themes.map((item) => `${item.label} (${item.count})`).join(', ') || 'não informado'}.`
      ];
      const blockHeight = textHeight(doc, analysis.standardName, 'Helvetica-Bold', 10)
        + lines.reduce((height, line) => height + textHeight(doc, line, 'Helvetica', 9), 0)
        + 10;
      ensureSpace(doc, blockHeight);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
        .text(analysis.standardName, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 0 });
      for (const line of lines) {
        doc.font('Helvetica').fontSize(9).fillColor('#475569')
          .text(line, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 0 });
      }
      resetCursor(doc, doc.y + 7);
    }

    heading(doc, 'Apêndice de critérios');
    for (const standard of STANDARD_IDS) {
      const analysis = session.analyses[standard];
      if (!analysis) continue;
      const firstCriterionHeight = analysis.criteria[0] ? criterionHeight(doc, analysis.criteria[0]) : 0;
      ensureSpace(doc, 26 + firstCriterionHeight);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a')
        .text(analysis.standardName, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 0 });
      resetCursor(doc, doc.y + 5);
      for (const criterion of analysis.criteria) {
        writeCriterion(doc, criterion);
      }
    }

    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      doc.switchToPage(index);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
        .text(`IQG Dashboard - página ${index + 1} de ${pages.count}`, PAGE_MARGIN, doc.page.height - FOOTER_Y_OFFSET, {
          width: CONTENT_WIDTH,
          align: 'center',
          lineBreak: false
        });
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}
