import { test, expect } from '@playwright/test';

test('AI has a reserved rail and never covers inspector actions when toggled or resized', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'AI', exact: true });
  for (const viewport of [{ width: 1000, height: 700 }, { width: 1280, height: 720 }, { width: 1480, height: 950 }]) {
    await page.setViewportSize(viewport);
    for (const open of [false, true]) {
      if ((await toggle.getAttribute('aria-expanded')) !== String(open)) await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', String(open));
      await page.locator('.inspector-bottom [data-action="save-json"]').scrollIntoViewIfNeeded();
      const bounds = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
        const hit = selector => { const node = document.querySelector(selector), r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); };
        return { app: rect('#app'), rail: rect('.ai-launcher'), toggle: rect('.ai-toggle'), save: rect('.inspector-bottom [data-action="save-json"]'), panel: rect('.ai-panel'), saveClickable: hit('.inspector-bottom [data-action="save-json"]'), toggleClickable: hit('.ai-toggle') };
      });
      expect(bounds.toggle.left).toBeGreaterThanOrEqual(bounds.rail.left);
      expect(bounds.app.right).toBeLessThanOrEqual(bounds.rail.left);
      expect(bounds.save.right).toBeLessThanOrEqual(bounds.rail.left);
      expect(bounds.toggle.bottom).toBeLessThan(bounds.save.top);
      expect(bounds.saveClickable, JSON.stringify({ viewport, open, bounds })).toBe(true);
      expect(bounds.toggleClickable).toBe(true);
      if (open) {
        expect(bounds.app.right).toBeCloseTo(bounds.panel.left, 0);
        expect(bounds.panel.right).toBeCloseTo(bounds.rail.left, 0);
      }
    }
    await toggle.click();
  }
  await toggle.click();
  const separator = page.getByRole('separator', { name: 'Ширина помощника' });
  const before = await page.locator('.ai-panel').boundingBox();
  await separator.press('ArrowLeft');
  const after = await page.locator('.ai-panel').boundingBox();
  expect(after.width).toBeGreaterThan(before.width);
  const save = await page.locator('.inspector-bottom [data-action="save-json"]').boundingBox();
  const ai = await toggle.boundingBox();
  expect(ai.x).toBeGreaterThan(save.x + save.width);
});
