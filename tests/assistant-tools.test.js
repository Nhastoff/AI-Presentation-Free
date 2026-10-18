import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, validateDeck } from '../src/model.js';
import { ASSISTANT_TOOLS, getDeckRevision, executeAssistantTool, applyProposal } from '../src/assistant-tools.js';

const edit = (deck, operations, requestId = 'test-request') => executeAssistantTool(deck, 'presentation_edit', { requestId, baseRevision: getDeckRevision(deck), operations });

test('summary provides stable references and reads omit image payloads', () => {
  const deck = validateDeck(createDeck());
  deck.slides[0].elements.push({ ...deck.slides[0].elements[0], id: 'img-1', type: 'image', src: 'data:image/png;base64,AAAA' });
  const { result: summary } = executeAssistantTool(deck, 'presentation_summary', {}, { selection: { slideId: deck.slides[0].id } });
  assert.equal(summary.documentId, deck.id);
  assert.equal(summary.revision, getDeckRevision(deck));
  assert.equal(summary.slides[0].elementCount, deck.slides[0].elements.length);
  const { result } = executeAssistantTool(deck, 'presentation_read_slides', { slideIds: [deck.slides[0].id] });
  assert.equal(result.slides[0].elements.at(-1).hasImage, true);
  assert.ok(!JSON.stringify(result).includes('base64'));
  assert.equal(result.slides[0].notes, undefined);
  assert.ok(ASSISTANT_TOOLS.every(tool => tool.inputSchema.type === 'object'));
});

test('small change stays isolated, preserves IDs, and supports applying one undoable snapshot', () => {
  const deck = validateDeck(createDeck()), before = JSON.stringify(deck);
  const slide = deck.slides[0], element = slide.elements.find(el => el.type === 'text');
  const { proposal } = edit(deck, [{ type: 'update_element', slideId: slide.id, elementId: element.id, patch: { text: 'Новая мысль' } }]);
  assert.equal(JSON.stringify(deck), before);
  assert.equal(proposal.requiresApproval, false);
  const applied = applyProposal(deck, proposal);
  assert.equal(applied.slides[0].elements.find(el => el.id === element.id).text, 'Новая мысль');
  assert.equal(applied.id, deck.id);
  assert.notEqual(getDeckRevision(applied), getDeckRevision(deck));
});

test('atomic batches fail without partial changes or identifier normalization', () => {
  const deck = validateDeck(createDeck()), before = JSON.stringify(deck);
  assert.throws(() => edit(deck, [
    { type: 'update_deck', patch: { title: 'Should not be applied' } },
    { type: 'delete_slide', slideId: 'missing' },
  ]), /не найден/);
  assert.equal(JSON.stringify(deck), before);
  assert.throws(() => edit(deck, [{ type: 'create_slide', slideId: deck.slides[0].id }]), /повторный/);
  assert.throws(() => edit(deck, [{ type: 'update_element', slideId: deck.slides[0].id, elementId: deck.slides[0].elements[0].id, patch: { id: 'replaced' } }]), /Недоступное/);
});

test('proposal rejects manual edits, another document, and repeated request identifiers', () => {
  const deck = validateDeck(createDeck());
  const { proposal } = edit(deck, [{ type: 'update_deck', patch: { title: 'New title' } }]);
  assert.throws(() => applyProposal(deck, proposal, { appliedIds: [proposal.id] }), /уже применено/);
  const manual = structuredClone(deck); manual.slides[0].notes = 'Manual edit';
  assert.throws(() => applyProposal(manual, proposal), /изменилась/);
  assert.throws(() => applyProposal(validateDeck(createDeck()), proposal), /другой презентации/);
  assert.throws(() => executeAssistantTool(manual, 'presentation_edit', { requestId: 'next', baseRevision: proposal.baseRevision, operations: [{ type: 'update_deck', patch: { title: 'Oops' } }] }), /изменилась/);
});

test('major changes require preview and editable tables/charts survive model validation', () => {
  const deck = validateDeck(createDeck());
  const { proposal } = edit(deck, [
    { type: 'create_slide', slideId: 'new-slide', elements: [{ id: 'heading', type: 'text', text: 'Data', fontSize: 60 }] },
    { type: 'insert_table', slideId: 'new-slide', data: [['Year', 'Revenue'], ['2026', '42']] },
    { type: 'insert_chart', slideId: 'new-slide', values: [20, 42], labels: ['2025', '2026'] },
    { type: 'update_slide', slideId: deck.slides[0].id, patch: { notes: 'Source: https://example.org/' } },
  ]);
  assert.equal(proposal.requiresApproval, true);
  const applied = applyProposal(deck, proposal), slide = applied.slides.at(-1);
  assert.equal(slide.id, 'new-slide');
  assert.ok(slide.elements.some(el => el.text === 'Revenue'));
  assert.ok(slide.elements.every(el => ['text', 'rect', 'ellipse', 'image'].includes(el.type)));
  assert.equal(new Set(slide.elements.map(el => el.id)).size, slide.elements.length);
});

test('replace deck keeps document identity and destructive edits cannot remove final slide', () => {
  const deck = validateDeck(createDeck());
  const { proposal } = edit(deck, [{ type: 'replace_deck', deck: { title: 'Generated', slides: [{ elements: [{ type: 'text', text: 'Generated' }] }] } }]);
  assert.equal(proposal.deck.id, deck.id);
  assert.equal(proposal.requiresApproval, true);
  const single = applyProposal(deck, proposal);
  assert.throws(() => edit(single, [{ type: 'delete_slide', slideId: single.slides[0].id }]), /от 1 до 500/);
});

test('full reorders require exact ID sets, and note/image reads stay bounded', () => {
  const deck = validateDeck(createDeck());
  assert.throws(() => edit(deck, [{ type: 'reorder_slides', ids: [deck.slides[0].id] }]), /все идентификаторы/);
  const ids = deck.slides.map(slide => slide.id).reverse();
  const { proposal } = edit(deck, [{ type: 'reorder_slides', ids }]);
  assert.deepEqual(proposal.deck.slides.map(slide => slide.id), ids);
  for (const slide of deck.slides) { slide.notes = 'n'.repeat(100000); for (const el of slide.elements) el.text = 'x'.repeat(100000); }
  const { result } = executeAssistantTool(deck, 'presentation_read_slides', { slideIds: deck.slides.map(slide => slide.id), includeNotes: true });
  assert.ok(JSON.stringify(result).length < 50000);
});

test('image attachments resolve locally without sending image bytes through commands', () => {
  const deck = validateDeck(createDeck());
  const args = { requestId: 'image-request', baseRevision: getDeckRevision(deck), operations: [{ type: 'create_elements', slideId: deck.slides[0].id, elements: [{ id: 'attached-image', type: 'image', attachmentId: 'upload-1' }] }] };
  const attachments = [{ id: 'upload-1', name: 'picture.png', dataUrl: 'data:image/png;base64,AAAA' }];
  const { proposal } = executeAssistantTool(deck, 'presentation_edit', args, { attachments });
  assert.equal(proposal.deck.slides[0].elements.at(-1).src, attachments[0].dataUrl);
  assert.equal(proposal.deck.slides[0].elements.at(-1).attachmentId, undefined);
  assert.ok(!JSON.stringify(args).includes('base64'));
  assert.throws(() => executeAssistantTool(deck, 'presentation_edit', args), /Вложение не найдено/);
  assert.throws(() => executeAssistantTool(deck, 'presentation_edit', args, { attachments: [{ id: 'upload-1', dataUrl: 'https://example.org/image.png' }] }), /поддерживаемое изображение/);
});

test('comment creation and resolving use stable IDs and bounded reading', () => {
  const deck = validateDeck(createDeck());
  const { proposal } = edit(deck, [
    { type: 'create_comment', slideId: deck.slides[0].id, commentId: 'review-note', text: 'Check source' },
    { type: 'update_comment', slideId: deck.slides[0].id, commentId: 'review-note', patch: { resolved: true } },
  ]);
  const applied = applyProposal(deck, proposal);
  const { result } = executeAssistantTool(applied, 'presentation_read_slides', { slideIds: [deck.slides[0].id] });
  assert.deepEqual(result.slides[0].comments, [{ id: 'review-note', resolved: true, text: 'Check source' }]);
});
