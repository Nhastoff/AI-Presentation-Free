import { test, expect } from '@playwright/test';

test('familiar ribbon creates tables, moves slides, and plays effects', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('[data-action="add"]').first().click();
  await page.locator('[data-tab="Вставка"]').click();
  await page.locator('[data-action="insert-table"]').click();
  await page.locator('.insert-modal input[name="rows"]').fill('2');
  await page.locator('.insert-modal input[name="cols"]').fill('2');
  await page.locator('.insert-modal [type="submit"]').click();
  await expect(page.locator('#stage [data-element]')).toHaveCount(8);
  await expect(page.locator('#stage')).toContainText('Столбец 1');
  await page.locator('[data-tab="Анимация"]').click();
  await page.locator('[data-animation="fade"]').click();
  await expect(page.locator('#stage .animation-fade')).toHaveCount(8);
  await page.locator('[data-tab="Переходы"]').click();
  await page.locator('[data-transition="push"]').click();
  await page.locator('[data-action="move-slide-down"]').click();
  await expect(page.locator('.slide-row.selected')).toHaveAttribute('data-slide', '2');
  await page.locator('[data-tab="Главная"]').click();
  await page.locator('[data-action="text"]').click();
  await page.getByLabel('Текст объекта', { exact: true }).fill('Проверка буфера');
  await page.getByLabel('Текст объекта', { exact: true }).press('Tab');
  await page.locator('[data-action="copy"]').click();
  await page.locator('[data-action="paste"]').click();
  await expect(page.locator('#stage [data-element]')).toHaveCount(10);
  await page.locator('[data-action="present"]').first().click();
  await expect(page.locator('.presentation-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('presentation-free.deck.v1') || '{}').slides?.[2]?.transition)).toBe('push');
  expect(errors).toEqual([]);
});

test('an object can be dragged and resized and undo restores geometry', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="add"]').first().click();
  await page.locator('[data-action="rect"]').click();
  const element = page.locator('#stage [data-element]');
  const initial = await element.boundingBox();
  await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await page.mouse.down(); await page.mouse.move(initial.x + initial.width / 2 + 60, initial.y + initial.height / 2 + 30, { steps: 4 }); await page.mouse.up();
  const moved = await element.boundingBox();
  expect(moved.x).toBeGreaterThan(initial.x + 50);
  const handle = page.locator('[data-resize="se"]'); const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 4 }); await page.mouse.up();
  expect((await element.boundingBox()).width).toBeGreaterThan(moved.width + 30);
  await page.locator('[data-action="undo"]').click();
  expect((await element.boundingBox()).width).toBeCloseTo(moved.width, 0);
});

test('SVG images convert to portable PNG and persist after reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-tab="Вставка"]').click();
  await page.locator('#image-file').setInputFiles({ name: 'image.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#7564dd"/></svg>') });
  await expect(page.locator('#stage .image img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('presentation-free.deck.v1') || '{}').slides?.[0]?.elements?.filter(e => e.type === 'image').length)).toBe(1);
  await page.reload();
  await expect(page.locator('#stage .image img')).toHaveCount(1);
});
