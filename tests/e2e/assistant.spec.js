import { test, expect } from '@playwright/test';

test('integrated assistant applies a small tool edit once through the real editor', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const listeners = [];
    window.presentationAI = {
      status: async () => ({ connected: true }),
      historyLoad: async () => [], historySave: async () => {},
      onEvent: callback => { listeners.push(callback); return () => {}; },
      toolResult: async ({ result }) => { window.__toolResult = result; },
      send: async ({ context, conversationId }) => {
        const event = { type: 'tool', requestId: 'tool-test', conversationId, documentId: context.documentId, name: 'presentation_edit', arguments: { requestId: 'panel-test-edit', baseRevision: context.revision, summary: 'Изменён заголовок', operations: [{ type: 'update_deck', patch: { title: 'Заголовок от Codex' } }] } };
        await Promise.all(listeners.map(callback => callback(event)));
        await Promise.all(listeners.map(callback => callback({ type: 'delta', conversationId, text: 'Заголовок изменён.' })));
        await Promise.all(listeners.map(callback => callback({ type: 'done', conversationId })));
        return { turnId: 'test' };
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '✦ Помощник', exact: true }).click();
  await page.getByLabel('Сообщение помощнику').fill('Измени заголовок');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByLabel('Название презентации')).toHaveValue('Заголовок от Codex');
  await expect(page.locator('.ai-proposal-state')).toHaveText('Применено');
  await expect(page.locator('.ai-status')).toHaveText('Готово');
  expect(await page.evaluate(() => window.__toolResult.applied)).toBe(true);
  expect(errors).toEqual([]);
});

test('assistant streams, retains conversation when collapsed and previews changes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    // Isolate the panel contract from an installed/authenticated Codex process.
    document.querySelectorAll('.ai-panel,.ai-toggle').forEach(node => node.remove());
    const { mountAssistant } = await import('/src/assistant-panel.js');
    let emit;
    const stored = new Map();
    window.__assistantApplied = 0;
    window.__assistantPanel = mountAssistant({
      tools: [], getDocumentId: () => 'test-document', getContext: () => ({ documentId: 'test-document' }),
      applyProposal: async () => { window.__assistantApplied++; }, undo: async () => { window.__assistantApplied--; },
    }, {
      status: async () => ({ connected: true }),
      onEvent: callback => { emit = callback; return () => {}; },
      historyLoad: async ({ documentId }) => stored.get(documentId) || [],
      historySave: async ({ documentId, conversations }) => stored.set(documentId, structuredClone(conversations)),
      send: async ({ conversationId }) => {
        queueMicrotask(() => {
          emit({ type: 'delta', conversationId, text: '<script>unsafe</script>Готовлю слайды' });
          emit({ type: 'done', conversationId });
        });
        return { turnId: 'test-turn' };
      },
    });
  });
  await page.getByRole('button', { name: '✦ Помощник', exact: true }).click();
  await expect(page.getByText('Codex подключён', { exact: true })).toBeVisible();
  await page.getByLabel('Сообщение помощнику').fill('Сделай презентацию');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.ai-message-assistant')).toContainText('<script>unsafe</script>Готовлю слайды');
  await expect(page.locator('.ai-message script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
  await expect(page.locator('.ai-panel')).toBeHidden();
  await page.getByRole('button', { name: '✦ Помощник', exact: true }).click();
  await expect(page.locator('.ai-message-user')).toContainText('Сделай презентацию');
  await page.evaluate(() => window.__assistantPanel.receiveProposal({ id: 'p', requiresApproval: true, summary: 'Новая презентация', deck: { slides: [{ background: '#ffffff', elements: [{ type: 'text', text: 'Заголовок', x: 80, y: 50, w: 1100, h: 100 }] }] } }));
  await expect(page.getByLabel('Предпросмотр слайда 1')).toBeVisible();
  expect(await page.evaluate(() => window.__assistantApplied)).toBe(0);
  await page.getByRole('button', { name: 'Применить изменения', exact: true }).click();
  await expect(page.locator('.ai-proposal-state')).toHaveText('Применено');
  expect(await page.evaluate(() => window.__assistantApplied)).toBe(1);
  await page.getByRole('button', { name: 'Отменить изменения', exact: true }).click();
  expect(await page.evaluate(() => window.__assistantApplied)).toBe(0);
  expect(errors).toEqual([]);
});
