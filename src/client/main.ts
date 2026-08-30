import Chart from 'chart.js/auto';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DIMENSIONS, STANDARD_IDS, type AnalysisResult, type ApiErrorPayload, type LinkDiagnostic, type SessionEvaluation, type StandardId } from '../shared/types.js';
import { buildSession } from '../shared/scoring.js';
import { DEFAULT_COVERAGE_THRESHOLD, STANDARD_NAMES, STANDARD_WEIGHTS } from '../shared/config.js';

const COLORS: Record<StandardId, string> = { 'darwin-core': '#0f8a7e', 'wcmp-2': '#557995', 'iso-19115': '#b7791f' };
const HISTORY_KEY = 'iqg.history.v1';

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento #${id} não encontrado.`);
  return node as T;
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, className: string, handler: () => void): HTMLButtonElement {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

let session = buildSession(crypto.randomUUID(), {}, DEFAULT_COVERAGE_THRESHOLD);
let activePage = 'upload';
let radarChart: Chart | null = null;
let criteriaChart: Chart | null = null;
let temporalChart: Chart | null = null;
let themesChart: Chart | null = null;
let map: L.Map | null = null;
let mapLayer: L.LayerGroup | null = null;
let toastTimer = 0;

function showToast(message: string, error = false): void {
  const toast = byId<HTMLDivElement>('toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

function analyses(): AnalysisResult[] {
  return STANDARD_IDS.flatMap((standard) => session.analyses[standard] ? [session.analyses[standard]!] : []);
}

function navigate(page: string): void {
  activePage = page;
  document.querySelectorAll<HTMLElement>('[data-page]').forEach((node) => node.classList.toggle('active', node.dataset.page === page));
  document.querySelectorAll<HTMLElement>('[data-page-target]').forEach((node) => {
    const isCurrent = node.dataset.pageTarget === page && node.classList.contains('nav-item');
    node.classList.toggle('active', isCurrent);
    if (node.classList.contains('nav-item')) node.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });
  if (page === 'overview') renderCharts();
  if (page === 'explore') window.setTimeout(() => { renderExplore(); map?.invalidateSize(); }, 50);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

function loadHistory(): SessionEvaluation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as SessionEvaluation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistSession(): void {
  if (!analyses().length) return;
  const history = loadHistory().filter((item) => item.id !== session.id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([session, ...history].slice(0, 10)));
}

function setSession(next: SessionEvaluation, persist = true): void {
  session = buildSession(next.id, next.analyses, next.coverageThreshold);
  if (persist) persistSession();
  renderAll();
}

function renderSlots(): void {
  const container = byId<HTMLDivElement>('upload-slots');
  container.replaceChildren();
  for (const standard of STANDARD_IDS) {
    const analysis = session.analyses[standard];
    if (!analysis) {
      const empty = element('article', 'card slot missing');
      empty.append(element('div', '', `${STANDARD_NAMES[standard]} - aguardando arquivo`));
      container.append(empty);
      continue;
    }
    const card = element('article', 'card slot');
    const top = element('div', 'slot-top');
    top.append(element('span', 'tag', analysis.standardName));
    const actions = element('div', 'slot-actions');
    actions.append(button('Remover', 'button ghost', () => {
      const next = { ...session.analyses };
      delete next[standard];
      setSession(buildSession(session.id, next, session.coverageThreshold));
    }));
    top.append(actions);
    card.append(top, element('h3', '', analysis.file.name), element('p', '', `${analysis.file.recordCount.toLocaleString('pt-BR')} registro(s) · ${(analysis.file.size / 1024).toFixed(1)} KB`));
    card.append(element('div', 'score', `${analysis.score.toFixed(1)}%`));
    const progress = element('div', 'progress');
    const fill = element('i'); fill.style.width = `${analysis.score}%`; progress.append(fill);
    card.append(progress, element('p', '', `${analysis.passing} conformes · ${analysis.failing} não conformes`));
    container.append(card);
  }
}

function renderHistory(): void {
  const container = byId<HTMLDivElement>('history-list');
  const history = loadHistory();
  container.replaceChildren();
  if (!history.length) { container.append(element('div', 'empty', 'Nenhuma sessão salva neste navegador.')); return; }
  for (const item of history) {
    const row = element('div', 'history-row');
    const info = element('div');
    info.append(element('strong', '', item.complete && item.iqg !== null ? `IQG ${item.iqg.toFixed(1)} · ${item.classification}` : 'Sessão incompleta'));
    info.append(element('p', '', `${Object.keys(item.analyses).length}/3 padrões · ${new Date(item.updatedAt).toLocaleString('pt-BR')}`));
    row.append(info, button('Restaurar', 'button secondary', () => { setSession(item, false); showToast('Sessão restaurada.'); }), button('Excluir', 'button ghost', () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(loadHistory().filter((entry) => entry.id !== item.id)));
      renderHistory();
    }));
    container.append(row);
  }
}

function renderSummary(): void {
  const all = analyses();
  const total = all.reduce((sum, item) => sum + item.criteria.length, 0);
  const passing = all.reduce((sum, item) => sum + item.passing, 0);
  const failing = all.reduce((sum, item) => sum + item.failing, 0);
  const stats = [
    ['Padrões carregados', `${all.length}/3`], ['Critérios avaliados', String(total)], ['Conformes', String(passing)], ['Não conformes', String(failing)]
  ];
  const grid = byId<HTMLDivElement>('summary-stats'); grid.replaceChildren();
  for (const [label, value] of stats) { const card = element('article', 'card stat-card'); card.append(element('span', '', label), element('strong', '', value)); grid.append(card); }
  const gauge = byId<HTMLDivElement>('iqg-gauge');
  const value = byId<HTMLElement>('iqg-value');
  const classification = byId<HTMLElement>('iqg-class');
  const help = byId<HTMLElement>('iqg-help');
  const score = session.iqg ?? 0;
  gauge.style.setProperty('--score', String(score));
  const color = session.classification === 'Confiável' ? '#10b981' : session.classification === 'Aceitável' ? '#f59e0b' : session.classification === 'Perigoso' ? '#ef4444' : '#22d3ee';
  gauge.style.setProperty('--gauge-color', color);
  value.textContent = session.iqg === null ? '-' : session.iqg.toFixed(1);
  classification.textContent = session.classification ?? 'Incompleto';
  help.textContent = session.complete ? 'IQG ponderado: Darwin Core 20%, WCMP 40% e ISO 19115 40%.' : `Faltam ${3 - all.length} padrão(ões) para calcular o IQG.`;
  byId<HTMLElement>('nav-iqg').textContent = session.iqg === null ? '-' : session.iqg.toFixed(0);
  byId<HTMLElement>('session-status').textContent = session.complete ? `IQG ${session.iqg!.toFixed(1)} · ${session.classification}` : `${all.length}/3 padrões carregados`;
  const canExport = all.length > 0;
  byId<HTMLButtonElement>('export-json').disabled = !canExport;
  byId<HTMLButtonElement>('export-pdf').disabled = !canExport;

  const standardGrid = byId<HTMLDivElement>('overview-standards'); standardGrid.replaceChildren();
  for (const standard of STANDARD_IDS) {
    const analysis = session.analyses[standard];
    const card = element('article', 'card standard-card');
    card.append(element('h3', '', STANDARD_NAMES[standard]));
    if (!analysis) card.append(element('p', 'empty', 'Não carregado'));
    else {
      card.append(element('div', 'score', `${analysis.score.toFixed(1)}%`));
      const progress = element('div', 'progress'); const fill = element('i'); fill.style.width = `${analysis.score}%`; fill.style.background = COLORS[standard]; progress.append(fill);
      const meta = element('div', 'meta'); meta.append(element('span', '', `${analysis.passing} conformes`), element('span', '', `${analysis.failing} falhas`)); card.append(progress, meta);
    }
    standardGrid.append(card);
  }
}

function renderDimensions(): void {
  const grid = byId<HTMLDivElement>('dimension-grid'); grid.replaceChildren();
  for (const dimension of DIMENSIONS) {
    const card = element('article', 'card dimension-card');
    card.append(element('h3', '', dimension));
    const weight = analyses()[0]?.dimensions.find((item) => item.dimension === dimension)?.weight ?? 0;
    card.append(element('p', '', `Peso na nota de cada padrão: ${(weight * 100).toFixed(0)}%`));
    for (const standard of STANDARD_IDS) {
      const analysis = session.analyses[standard];
      if (!analysis) continue;
      const score = analysis.dimensions.find((item) => item.dimension === dimension)!;
      const row = element('div', 'dimension-row');
      row.append(element('span', '', analysis.standardName));
      const progress = element('div', 'progress'); const fill = element('i'); fill.style.width = `${score.score}%`; fill.style.background = COLORS[standard]; progress.append(fill); row.append(progress, element('strong', '', `${score.score.toFixed(1)}%`));
      card.append(row);
    }
    if (!analyses().length) card.append(element('div', 'empty', 'Aguardando análises.'));
    grid.append(card);
  }
}

function renderStandards(): void {
  const container = byId<HTMLDivElement>('standards-detail'); container.replaceChildren();
  for (const standard of STANDARD_IDS) {
    const analysis = session.analyses[standard];
    const card = element('article', 'card standard-detail');
    const header = element('header'); header.append(element('h2', '', STANDARD_NAMES[standard]), element('span', 'weight-note', `Peso no IQG: ${(STANDARD_WEIGHTS[standard] * 100).toFixed(0)}%`)); card.append(header);
    if (!analysis) card.append(element('div', 'empty', 'Padrão ainda não carregado.'));
    else {
      card.append(element('div', 'score', `${analysis.score.toFixed(2)}%`));
      for (const dimension of analysis.dimensions) {
        const row = element('div', 'dimension-row'); row.style.gridTemplateColumns = '180px 1fr 150px';
        row.append(element('span', '', dimension.dimension));
        const progress = element('div', 'progress'); const fill = element('i'); fill.style.width = `${dimension.score}%`; fill.style.background = COLORS[standard]; progress.append(fill);
        row.append(progress, element('strong', '', `${dimension.score.toFixed(1)}% · +${dimension.contribution.toFixed(1)}`)); card.append(row);
      }
    }
    container.append(card);
  }
}

function filteredCriteria() {
  const standard = byId<HTMLSelectElement>('filter-standard').value;
  const dimension = byId<HTMLSelectElement>('filter-dimension').value;
  const result = byId<HTMLSelectElement>('filter-result').value;
  const search = byId<HTMLInputElement>('criteria-search').value.trim().toLowerCase();
  return analyses().flatMap((analysis) => analysis.criteria.map((criterion) => ({ analysis, criterion }))).filter(({ analysis, criterion }) => {
    if (standard && analysis.standard !== standard) return false;
    if (dimension && criterion.dimension !== dimension) return false;
    if (result === 'pass' && !criterion.passed) return false;
    if (result === 'fail' && criterion.passed) return false;
    return !search || `${criterion.field} ${criterion.question} ${criterion.message}`.toLowerCase().includes(search);
  });
}

function renderCriteria(): void {
  const rows = filteredCriteria();
  const body = byId<HTMLTableSectionElement>('criteria-body'); body.replaceChildren();
  for (const { analysis, criterion } of rows) {
    const tr = element('tr');
    const values = [analysis.standardName, criterion.dimension, criterion.field, criterion.question, `${(criterion.coverage * 100).toFixed(1)}% (${criterion.validCount}/${criterion.applicableCount})`];
    values.forEach((value, index) => { const td = element('td', index === 2 ? 'field' : index === 4 ? 'coverage' : '', value); tr.append(td); });
    const status = element('td'); status.append(element('span', `badge ${criterion.passed ? 'pass' : 'fail'}`, criterion.passed ? 'Sim' : 'Não')); tr.append(status);
    tr.append(element('td', 'evidence', criterion.evidence.join(' · ') || criterion.message));
    body.append(tr);
  }
  byId<HTMLElement>('criteria-count').textContent = `${rows.length} critérios · ${rows.filter((row) => row.criterion.passed).length} conformes · ${rows.filter((row) => !row.criterion.passed).length} não conformes`;
}

function renderCharts(): void {
  radarChart?.destroy(); criteriaChart?.destroy();
  const all = analyses();
  radarChart = new Chart(byId<HTMLCanvasElement>('radar-chart'), { type: 'radar', data: { labels: [...DIMENSIONS], datasets: all.map((analysis) => ({ label: analysis.standardName, data: DIMENSIONS.map((dimension) => analysis.dimensions.find((item) => item.dimension === dimension)?.score ?? 0), borderColor: COLORS[analysis.standard], backgroundColor: `${COLORS[analysis.standard]}22`, pointBackgroundColor: COLORS[analysis.standard], borderWidth: 2 })) }, options: chartOptions(true) });
  criteriaChart = new Chart(byId<HTMLCanvasElement>('criteria-chart'), { type: 'bar', data: { labels: all.map((analysis) => analysis.standardName), datasets: [{ label: 'Conformes', data: all.map((analysis) => analysis.passing), backgroundColor: '#10b98199' }, { label: 'Não conformes', data: all.map((analysis) => analysis.failing), backgroundColor: '#ef444499' }] }, options: chartOptions(false) });
}

function chartOptions(radial: boolean): object {
  const styles = getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue('--ink-soft').trim();
  const faint = styles.getPropertyValue('--ink-faint').trim();
  const line = styles.getPropertyValue('--line').trim();
  return { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: text, usePointStyle: true, pointStyle: 'circle', boxWidth: 7, font: { size: 10 } } } }, scales: radial ? { r: { min: 0, max: 100, ticks: { color: faint, backdropColor: 'transparent' }, grid: { color: line }, angleLines: { color: line }, pointLabels: { color: text, font: { size: 10 } } } } : { x: { ticks: { color: text }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: faint }, grid: { color: line } } } };
}

function setupMap(): void {
  if (map) return;
  map = L.map('map', { preferCanvas: true }).setView([-15, -52], 3);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  mapLayer = L.layerGroup().addTo(map);
}

function renderExplore(): void {
  setupMap();
  const select = byId<HTMLSelectElement>('explore-standard');
  const previous = select.value;
  select.replaceChildren();
  for (const analysis of analyses()) { const option = element('option', '', analysis.standardName); option.value = analysis.standard; select.append(option); }
  if (previous && session.analyses[previous as StandardId]) select.value = previous;
  const analysis = session.analyses[select.value as StandardId] ?? analyses()[0];
  mapLayer?.clearLayers();
  if (!analysis) {
    byId<HTMLElement>('sampling-note').textContent = 'Carregue um padrão para explorar.';
    temporalChart?.destroy(); themesChart?.destroy();
    return;
  }
  const bounds: L.LatLngExpression[] = [];
  for (const point of analysis.visualization.points) { L.circleMarker([point.latitude, point.longitude], { radius: 4, color: COLORS[analysis.standard], fillOpacity: .65 }).bindTooltip(point.label ?? `${point.latitude}, ${point.longitude}`).addTo(mapLayer!); bounds.push([point.latitude, point.longitude]); }
  if (analysis.visualization.geometry) {
    const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: analysis.visualization.geometry } as unknown as GeoJSON.Feature, { style: { color: COLORS[analysis.standard], weight: 2, fillOpacity: .16 } }).addTo(mapLayer!);
    const layerBounds = layer.getBounds(); if (layerBounds.isValid()) map!.fitBounds(layerBounds, { padding: [20, 20] });
  } else if (analysis.visualization.extent) {
    const value = analysis.visualization.extent;
    const rectangle = L.rectangle([[value.south, value.west], [value.north, value.east]], { color: COLORS[analysis.standard], weight: 2, fillOpacity: .15 }).addTo(mapLayer!);
    map!.fitBounds(rectangle.getBounds(), { padding: [20, 20] });
  } else if (bounds.length) map!.fitBounds(L.latLngBounds(bounds), { padding: [20, 20], maxZoom: 10 });
  else map!.setView([-15, -52], 3);
  byId<HTMLElement>('sampling-note').textContent = analysis.visualization.sampledPoints ? 'Mapa limitado a uma amostra de 2.000 pontos.' : `${analysis.visualization.points.length} ponto(s) exibido(s).`;
  temporalChart?.destroy(); themesChart?.destroy();
  temporalChart = new Chart(byId<HTMLCanvasElement>('temporal-chart'), { type: 'bar', data: { labels: analysis.visualization.temporal.map((item) => item.label), datasets: [{ label: 'Registros/datas', data: analysis.visualization.temporal.map((item) => item.count), backgroundColor: COLORS[analysis.standard] }] }, options: chartOptions(false) });
  themesChart = new Chart(byId<HTMLCanvasElement>('themes-chart'), { type: 'bar', data: { labels: analysis.visualization.themes.map((item) => item.label), datasets: [{ label: 'Ocorrências', data: analysis.visualization.themes.map((item) => item.count), backgroundColor: COLORS[analysis.standard] }] }, options: { ...chartOptions(false), indexAxis: 'y' } });
}

async function analyzeFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files).slice(0, 3);
  for (const file of list) {
    const data = new FormData(); data.append('file', file); data.append('coverageThreshold', String(session.coverageThreshold));
    showToast(`Analisando ${file.name}…`);
    try {
      const response = await fetch('/api/analyses', { method: 'POST', body: data });
      const payload = await response.json() as AnalysisResult | ApiErrorPayload;
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error.message : 'Falha na análise.');
      if (session.analyses[payload.standard] && !window.confirm(`Já existe um arquivo ${payload.standardName}. Deseja substituí-lo por ${file.name}?`)) continue;
      setSession(buildSession(session.id, { ...session.analyses, [payload.standard]: payload }, session.coverageThreshold));
      showToast(`${file.name} analisado como ${payload.standardName}.`);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Falha ao analisar arquivo.', true); }
  }
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

async function checkLinks(): Promise<void> {
  const standard = byId<HTMLSelectElement>('explore-standard').value as StandardId;
  const urls = session.analyses[standard]?.visualization.links.filter((url) => /^https?:/i.test(url)).slice(0, 20) ?? [];
  if (!urls.length) { showToast('Nenhum link HTTP(S) disponível para verificar.', true); return; }
  const container = byId<HTMLDivElement>('link-diagnostics'); container.replaceChildren(element('p', '', 'Verificando links…'));
  try {
    const response = await fetch('/api/link-checks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
    const payload = await response.json() as { diagnostics?: LinkDiagnostic[] } & Partial<ApiErrorPayload>;
    if (!response.ok) throw new Error(payload.error?.message ?? 'Falha no diagnóstico.');
    container.replaceChildren();
    for (const item of payload.diagnostics ?? []) { const row = element('div', 'diagnostic-row'); row.append(element('strong', item.ok ? 'ok' : 'fail', item.ok ? 'Ativo' : 'Falha'), element('span', '', `${item.url} - ${item.message}`)); container.append(row); }
  } catch (error) { container.replaceChildren(element('p', '', error instanceof Error ? error.message : 'Falha no diagnóstico.')); }
}

function renderAll(): void {
  byId<HTMLInputElement>('coverage-threshold').value = String(Math.round(session.coverageThreshold * 100));
  byId<HTMLElement>('threshold-label').textContent = `${Math.round(session.coverageThreshold * 100)}%`;
  renderSlots(); renderHistory(); renderSummary(); renderDimensions(); renderStandards(); renderCriteria();
  if (activePage === 'overview') renderCharts();
  if (activePage === 'explore') renderExplore();
}

function initializeFilters(): void {
  const standard = byId<HTMLSelectElement>('filter-standard');
  for (const id of STANDARD_IDS) { const option = element('option', '', STANDARD_NAMES[id]); option.value = id; standard.append(option); }
  const dimension = byId<HTMLSelectElement>('filter-dimension');
  for (const name of DIMENSIONS) { const option = element('option', '', name); option.value = name; dimension.append(option); }
  [standard, dimension, byId<HTMLSelectElement>('filter-result'), byId<HTMLInputElement>('criteria-search')].forEach((input) => input.addEventListener('input', renderCriteria));
}

function initialize(): void {
  initializeFilters();
  document.querySelectorAll<HTMLElement>('[data-page-target]').forEach((node) => node.addEventListener('click', () => navigate(node.dataset.pageTarget!)));
  const zone = byId<HTMLDivElement>('upload-zone'); const input = byId<HTMLInputElement>('file-input');
  zone.addEventListener('click', () => input.click()); zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') input.click(); });
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (event) => { event.preventDefault(); zone.classList.remove('dragging'); if (event.dataTransfer?.files) void analyzeFiles(event.dataTransfer.files); });
  input.addEventListener('change', () => { if (input.files) void analyzeFiles(input.files); input.value = ''; });
  const threshold = byId<HTMLInputElement>('coverage-threshold');
  threshold.addEventListener('input', () => { byId<HTMLElement>('threshold-label').textContent = `${threshold.value}%`; });
  threshold.addEventListener('change', () => setSession(buildSession(session.id, session.analyses, Number(threshold.value) / 100)));
  byId<HTMLButtonElement>('clear-history').addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); showToast('Histórico removido.'); });
  byId<HTMLButtonElement>('export-json').addEventListener('click', () => download(new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }), `avaliacao-iqg-${session.id}.json`));
  byId<HTMLButtonElement>('export-pdf').addEventListener('click', async () => {
    try { const response = await fetch('/api/reports/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session) }); if (!response.ok) throw new Error('Não foi possível gerar o PDF.'); download(await response.blob(), `relatorio-iqg-${session.id}.pdf`); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Falha ao exportar PDF.', true); }
  });
  byId<HTMLSelectElement>('explore-standard').addEventListener('change', renderExplore);
  byId<HTMLButtonElement>('check-links').addEventListener('click', () => void checkLinks());
  renderAll();
}

initialize();
