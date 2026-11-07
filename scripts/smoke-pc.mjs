import { chromium, expect } from '@playwright/test';

const target = process.env.GAME_URL || 'http://127.0.0.1:8765/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400 && response.url().startsWith(target)) {
    errors.push('HTTP ' + response.status() + ': ' + response.url());
  }
});

try {
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!response || response.status() !== 200) throw new Error('No se entrego index.html: ' + response?.status());
  await expect(page.locator('#play-button')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.fighter-card')).toHaveCount(6);
  await expect(page.locator('.stage-card')).toHaveCount(5);
  await expect(page.locator('#loading-message')).toBeHidden();
  const drawn = await page.locator('#game-canvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 3; index < pixels.length; index += 400) {
      if (pixels[index] > 100) colored += 1;
    }
    return colored;
  });
  if (drawn < 100) throw new Error('El escenario esta vacio: ' + drawn);

  await page.locator('#play-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#arena-state')).toHaveText('EN COMBATE');
  await page.keyboard.down('d');
  await page.waitForTimeout(450);
  await page.keyboard.up('d');
  await page.keyboard.press('j');
  await page.waitForTimeout(1250);
  await expect(page.locator('#timer')).not.toHaveText('45');
  if (errors.length) throw new Error('Errores navegador: ' + errors.join(' | '));
  console.log('PC SMOKE OK: inicio, 6 personajes, 5 escenarios, render, botones y teclado');
} catch (error) {
  await page.screenshot({ path: 'windows-smoke-failed.png', fullPage: true }).catch(() => {});
  console.error('Fallo PC: ' + error.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
