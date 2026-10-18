import { test, expect } from '@playwright/test';

async function openEditor(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const listeners = [], replies = new Map();
    let counter = 0;
    window.presentationAI = {
      status: async () => ({ connected: true, authenticated: true }),
      historyLoad: async () => [], historySave: async () => {}, stop: async () => {},
      onEvent: callback => { listeners.push(callback); return () => {}; },
      toolResult: async ({ requestId, result }) => { replies.set(requestId, result); },
      send: async request => { window.__lastAIRequest = request; return { done: true }; },
    };
    // Exercise the callbacks registered by the real app, without importing or replacing them.
    window.__emitTool = async (name, args, documentId) => {
      const requestId = `integration-${++counter}`;
      const event = { type: 'tool', name, arguments: args, requestId, documentId: documentId || window.__lastAIRequest.documentId, conversationId: window.__lastAIRequest.conversationId };
      for (const callback of listeners) await callback(event);
      return replies.get(requestId);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '✦ Помощник', exact: true }).click();
  await expect(page.getByText('Codex подключён', { exact: true })).toBeVisible();
  await page.getByLabel('Сообщение помощнику').fill('Начать работу с презентацией');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__lastAIRequest))).toBe(true);
  return errors;
}

const tool = (page, name, args = {}, documentId) => page.evaluate(async ({ name, args, documentId }) => window.__emitTool(name, args, documentId), { name, args, documentId });
const summary = page => tool(page, 'presentation_summary');
const edit = (page, state, operations, requestId) => tool(page, 'presentation_edit', { requestId, baseRevision: state.revision, summary: requestId, operations });

test('real editor reads, creates editable objects, applies once and undoes a small batch', async ({ page }) => {
  const errors = await openEditor(page);
  const initial = await summary(page);
  expect(initial.slides).toHaveLength(3);
  const first = initial.slides[0].id;
  const before = await tool(page, 'presentation_read_slides', { slideIds: [first], includeNotes: true });
  expect(before.slides[0].elements.length).toBeGreaterThan(0);
  const operations = [
    { type: 'create_elements', slideId: first, elements: [{ id: 'integration-object', type: 'text', text: 'Редактируемый текст от Codex', x: 80, y: 80, w: 900, h: 70 }] },
    { type: 'update_slide', slideId: first, patch: { notes: 'Integration note' } },
  ];
  const result = await edit(page, initial, operations, 'small-integration-batch');
  expect(result.applied).toBe(true);
  await expect(page.locator('#stage [data-element="integration-object"]')).toContainText('Редактируемый текст от Codex');
  await expect(page.getByLabel('Заметки к слайду')).toHaveValue('Integration note');
  const after = await tool(page, 'presentation_read_slides', { slideIds: [first], includeNotes: true });
  expect(after.slides[0].elements.at(-1).id).toBe('integration-object');
  expect(after.revision).not.toBe(initial.revision);
  await page.getByRole('button', { name: 'Отменить изменения', exact: true }).click();
  await expect(page.locator('#stage [data-element="integration-object"]')).toHaveCount(0);
  await expect(page.locator('.ai-proposal-state')).toHaveText('Отменено');
  const restored = await summary(page);
  expect(restored.revision).toBe(initial.revision);
  const replay = await edit(page, restored, operations, 'small-integration-batch');
  expect(replay.ok).toBe(false);
  expect(replay.error).toContain('уже обработан');
  await expect(page.locator('#stage [data-element="integration-object"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('real editor previews major batches, applies accepted changes and discards rejected ones', async ({ page }) => {
  const errors = await openEditor(page);
  const initial = await summary(page);
  const proposal = await edit(page, initial, [
    { type: 'create_slide', slideId: 'approved-slide-one', elements: [{ type: 'text', text: 'Первый новый слайд' }] },
    { type: 'create_slide', slideId: 'approved-slide-two', elements: [{ type: 'text', text: 'Второй новый слайд' }] },
  ], 'major-accepted');
  expect(proposal.requiresApproval).toBe(true);
  expect(proposal.applied).toBeUndefined();
  await expect(page.locator('.slide-row')).toHaveCount(3);
  await expect(page.getByLabel('Предпросмотр слайда 5')).toBeVisible();
  await page.getByRole('button', { name: 'Применить изменения', exact: true }).click();
  await expect(page.locator('.slide-row')).toHaveCount(5);
  await expect(page.locator('.ai-proposal-state')).toHaveText('Применено');
  const applied = await summary(page);
  expect(applied.slides.slice(-2).map(slide => slide.id)).toEqual(['approved-slide-one', 'approved-slide-two']);
  await edit(page, applied, [{ type: 'delete_slide', slideId: 'approved-slide-one' }], 'major-rejected');
  await page.getByRole('button', { name: 'Отклонить изменения', exact: true }).click();
  await expect(page.locator('.ai-proposal-state').last()).toHaveText('Отклонено');
  await expect(page.locator('.slide-row')).toHaveCount(5);
  expect((await summary(page)).revision).toBe(applied.revision);
  expect(errors).toEqual([]);
});

test('real editor protects manual changes from stale tool calls and stale preview approval', async ({ page }) => {
  const errors = await openEditor(page);
  const initial = await summary(page);
  await edit(page, initial, [{ type: 'delete_slide', slideId: initial.slides[2].id }], 'stale-preview');
  await expect(page.getByRole('button', { name: 'Применить изменения', exact: true })).toBeVisible();
  await page.getByLabel('Название презентации').fill('Ручное изменение');
  await page.getByLabel('Название презентации').press('Tab');
  const stale = await edit(page, initial, [{ type: 'update_deck', patch: { title: 'Устаревший результат' } }], 'stale-tool');
  expect(stale.ok).toBe(false);
  expect(stale.error).toContain('изменилась');
  await page.getByRole('button', { name: 'Применить изменения', exact: true }).click();
  await expect(page.locator('.ai-status')).toContainText('изменилась');
  await expect(page.getByLabel('Название презентации')).toHaveValue('Ручное изменение');
  await expect(page.locator('.slide-row')).toHaveCount(3);
  expect((await summary(page)).title).toBe('Ручное изменение');
  expect(errors).toEqual([]);
});

test('real editor rejects late operations targeting a previously opened document', async ({ page }) => {
  const errors = await openEditor(page);
  const initial = await summary(page);
  await edit(page, initial, [{ type: 'delete_slide', slideId: initial.slides[2].id }], 'old-document-preview');
  const replacement = { id: 'integration-other-document', title: 'Другой документ', slides: [{ id: 'other-slide', background: '#FFFFFF', elements: [] }] };
  await page.locator('#open-file').setInputFiles({ name: 'other.pfree.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
  await expect(page.getByLabel('Название презентации')).toHaveValue('Другой документ');
  await expect(page.locator('.slide-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Применить изменения', exact: true })).toHaveCount(0);
  const late = await tool(page, 'presentation_edit', { requestId: 'late-edit', baseRevision: initial.revision, operations: [{ type: 'update_deck', patch: { title: 'Wrong document' } }] }, initial.documentId);
  expect(late.ok).toBe(false);
  expect(late.error).toContain('другая презентация');
  const current = await tool(page, 'presentation_summary', {}, replacement.id);
  expect(current.documentId).toBe(replacement.id);
  expect(current.title).toBe('Другой документ');
  expect(errors).toEqual([]);
});
