import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableElements, createChartElements, createLineElements } from '../src/features.js';
import { createDeck, validateDeck } from '../src/model.js';

function assertBounds(elements) {
  assert.equal(new Set(elements.map(el => el.id)).size, elements.length);
  for (const el of elements) {
    assert.ok(el.x >= 0 && el.y >= 0);
    assert.ok(el.w > 0 && el.h > 0);
    assert.ok(el.x + el.w <= 1280 && el.y + el.h <= 720);
  }
}
test('tables generate separate editable cells and labels within slide bounds', () => {
  const elements = createTableElements(3, 4);
  assert.equal(elements.length, 24);
  assert.equal(elements.filter(el => el.type === 'text').length, 12);
  assertBounds(elements);
  assertBounds(createTableElements(100, 100));
  assertBounds(createTableElements('bad', -2));
});
test('bar chart snapshots retain numbers and labels, including zero values', () => {
  const elements = createChartElements([0, 20, 40], ['A', 'B', 'C']);
  for (const expected of ['A', 'B', 'C', '0', '20', '40']) assert.ok(elements.some(el => el.text === expected));
  assertBounds(elements);
  assertBounds(createChartElements([Infinity, -10, 'bad'], null));
  assertBounds(createChartElements([]));
  assertBounds(createLineElements());
});
test('slide transitions survive normalization and unknown effects fall back to none', () => {
  const deck = createDeck();
  deck.slides[0].transition = 'fade'; deck.slides[1].transition = 'push'; deck.slides[2].transition = 'evil';
  const clean = validateDeck(JSON.parse(JSON.stringify(deck)));
  assert.deepEqual(clean.slides.map(slide => slide.transition), ['fade', 'push', 'none']);
});
test('element entry animation persists in project JSON and unknown effects normalize', () => {
  const deck = createDeck();
  deck.slides[0].elements[0].animation = 'appear';
  deck.slides[0].elements[1].animation = 'fade';
  deck.slides[0].elements[2].animation = 'unsupported';
  const clean = validateDeck(JSON.parse(JSON.stringify(deck)));
  assert.deepEqual(clean.slides[0].elements.map(element => element.animation), ['appear', 'fade', 'none']);
});
