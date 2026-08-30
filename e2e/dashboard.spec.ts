import path from 'node:path';
import { expect, test } from '@playwright/test';

const icRoot = path.resolve(process.cwd(), '..', '..', 'IC', 'padroes_para_teste');

test('carrega os três padrões e publica o IQG', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles([
    path.join(icRoot, 'occurrence.txt'),
    path.join(icRoot, 'metadados_wcmp2_inmet.json'),
    path.join(icRoot, 'dados_iso.xml')
  ]);
  await expect(page.locator('#session-status')).toContainText('IQG', { timeout: 30_000 });
  await page.getByRole('button', { name: /Visão Geral/ }).click();
  await expect(page.locator('#iqg-value')).not.toHaveText('—');
  await expect(page.locator('#overview-standards .standard-card')).toHaveCount(3);
});

test('layout móvel mantém a navegação acessível', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Carregar metadados' })).toBeVisible();
});
