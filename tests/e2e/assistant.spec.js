import { test, expect } from '@playwright/test';

test('image generation opts in per request and registers generated assets without storing bytes in history', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    document.querySelectorAll('.ai-panel,.ai-toggle').forEach(node => node.remove());
    const { mountAssistant } = await import('/src/assistant-panel.js');
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=';
    let emit;
    window.__imageRequests = []; window.__registeredAttachments = [];
    mountAssistant({
      getDocumentId: () => 'image-test-doc', getContext: () => ({}),
      setAttachments: files => { window.__registeredAttachments = files; },
    }, {
      status: async () => ({ connected: true, capabilities: { imageGeneration: true } }),
      onEvent: callback => { emit = callback; return () => {}; },
      historyLoad: async () => [], historySave: async payload => { window.__savedImageHistory = payload; },
      pickAttachments: async () => [{ id: 'source-file', name: 'source.txt', size: 4, data: btoa('data') }],
      send: async request => {
        window.__imageRequests.push(request);
        if (request.imageGeneration) await emit({ type: 'generated-image', conversationId: request.conversationId, asset: { id: 'generated-one', name: 'Codex image', dataUrl } });
        return { done: true };
      },
    });
  });
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('complementary', { name: 'AI помощник', exact: true })).toBeVisible();
  const checkbox = page.getByRole('checkbox', { name: 'Генерировать изображения в этом запросе' });
  await expect(checkbox).toBeEnabled(); await expect(checkbox).not.toBeChecked();
  await page.getByLabel('Сообщение помощнику').fill('Обычный запрос');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  expect(await page.evaluate(() => window.__imageRequests[0].imageGeneration)).toBe(false);
  await page.getByRole('button', { name: 'Прикрепить материалы', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать source.txt', exact: true })).toBeVisible();
  await checkbox.check();
  await page.getByLabel('Сообщение помощнику').fill('Сгенерируй изображение');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Codex image' })).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  expect(await page.evaluate(() => window.__imageRequests[1].imageGeneration)).toBe(true);
  expect(await page.evaluate(() => window.__registeredAttachments.map(file => file.id))).toEqual(['source-file', 'generated-one']);
  await expect.poll(() => page.evaluate(() => window.__savedImageHistory.conversations[0].messages.find(message => message.generatedAsset)?.generatedAsset)).toEqual({ id: 'generated-one', name: 'Codex image' });
  expect(await page.evaluate(() => JSON.stringify(window.__savedImageHistory))).not.toContain('data:image');
});

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
  await page.getByRole('button', { name: 'AI', exact: true }).click();
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
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(page.getByText('Codex подключён', { exact: true })).toBeVisible();
  await page.getByLabel('Сообщение помощнику').fill('Сделай презентацию');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.ai-message-assistant')).toContainText('<script>unsafe</script>Готовлю слайды');
  await expect(page.locator('.ai-message script')).toHaveCount(0);
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(page.locator('.ai-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'AI', exact: true }).click();
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
