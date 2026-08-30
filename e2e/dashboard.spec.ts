import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const fixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures');

test('carrega os três padrões e publica o IQG', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles([
    path.join(fixturesRoot, 'darwin-core.tsv'),
    path.join(fixturesRoot, 'wcmp-2.json'),
    path.join(fixturesRoot, 'iso-19115.xml')
  ]);
  await expect(page.locator('#session-status')).toContainText('IQG', { timeout: 30_000 });
  await page.getByRole('button', { name: /Visão Geral/ }).click();
  await expect(page.locator('#iqg-value')).not.toHaveText('—');
  await expect(page.locator('#overview-standards .standard-card')).toHaveCount(3);
});

test('exporta o PDF sem páginas extras de rodapé', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles([
    path.join(fixturesRoot, 'darwin-core.tsv'),
    path.join(fixturesRoot, 'wcmp-2.json'),
    path.join(fixturesRoot, 'iso-19115.xml')
  ]);
  await expect(page.locator('#session-status')).toContainText('IQG', { timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(download.suggestedFilename()).toMatch(/^relatorio-iqg-.+\.pdf$/);
  expect(downloadPath).not.toBeNull();

  const pdf = fs.readFileSync(downloadPath!);
  const pageCount = countPdfPages(pdf);
  expect(pageCount).toBeGreaterThan(1);
  expect(pageCount).toBeLessThanOrEqual(7);
});

function countPdfPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
}

test('layout móvel mantém a navegação acessível', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Carregar metadados' })).toBeVisible();
});

test('usa a grade geográfica quando os tiles externos falham', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({
    status: 403,
    contentType: 'text/plain',
    body: 'blocked'
  }));
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(path.join(fixturesRoot, 'darwin-core.tsv'));
  await expect(page.locator('#session-status')).toContainText('1/3', { timeout: 30_000 });
  await page.getByRole('button', { name: /Explorar/ }).click();
  await expect(page.locator('#tile-status')).toBeVisible();
  await expect(page.locator('#tile-status')).toContainText('grade geográfica');
  await expect(page.locator('#map canvas')).toHaveCount(1);
});
