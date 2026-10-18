import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, createSlide, createElement, validateDeck, loadLocal, saveLocal, readDeckFile } from '../src/model.js';

test('demo has three valid slides and globally unique ids', () => {
  const deck = validateDeck(createDeck());
  assert.equal(deck.slides.length, 3);
  const ids = [deck.id, ...deck.slides.flatMap(slide => [slide.id, ...slide.elements.map(el => el.id)])];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(createSlide('blank').elements.length, 0);
  assert.equal(createSlide('title').elements.length, 2);
});
test('validation rejects invalid structures and normalizes unsafe values', () => {
  assert.throws(() => validateDeck({ slides: [] }));
  assert.throws(() => createElement('script'));
  const deck = createDeck();
  const el = deck.slides[0].elements[0];
  el.w = -50; el.fill = 'url(evil)'; el.src = 'https://example.com/track'; el.rotation = Infinity;
  const clean = validateDeck(deck).slides[0].elements[0];
  assert.equal(clean.w, 1); assert.equal(clean.fill, '#D8EFE7'); assert.equal(clean.src, ''); assert.equal(clean.rotation, 0);
  deck.slides[1].id = deck.slides[0].id;
  const normalized = validateDeck(deck);
  assert.notEqual(normalized.slides[0].id, normalized.slides[1].id);
});
test('local persistence handles missing, corrupt and unavailable storage', () => {
  const map = new Map();
  globalThis.localStorage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  assert.equal(loadLocal(), null);
  const deck = createDeck(); assert.equal(saveLocal(deck), true); assert.deepEqual(loadLocal(), validateDeck(deck));
  map.set('presentation-free.deck.v1', '{bad json'); assert.equal(loadLocal(), null);
  globalThis.localStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  assert.equal(loadLocal(), null); assert.equal(saveLocal(deck), false);
  delete globalThis.localStorage;
});
test('hostile identifiers and font declarations cannot enter DOM attributes or CSS', () => {
  const deck = createDeck();
  deck.id = 'deck" onmouseover="alert(1)';
  deck.slides[0].id = 'slide] .victim';
  deck.slides[0].elements[0].id = '<img src=x onerror=alert(1)>';
  deck.slides[0].elements[0].fontFamily = 'Arial; background: url(https://example.com)';
  deck.slides[0].elements[1].fontFamily = 'PT Санс, Arial';
  const clean = validateDeck(deck);
  for (const value of [clean.id, clean.slides[0].id, clean.slides[0].elements[0].id]) {
    assert.match(value, /^[A-Za-z0-9_-]{1,100}$/);
  }
  assert.equal(clean.slides[0].elements[0].fontFamily, 'Arial');
  assert.equal(clean.slides[0].elements[1].fontFamily, 'PT Санс, Arial');
});
test('JSON import round-trips editable deck and rejects malformed JSON', async () => {
  const deck = createDeck();
  const file = { size: 100, text: async () => JSON.stringify(deck) };
  assert.deepEqual(await readDeckFile(file), validateDeck(deck));
  await assert.rejects(readDeckFile({ size: 4, text: async () => 'oops' }), /Не удалось/);
  await assert.rejects(readDeckFile({ size: 101 * 1024 * 1024 }), /100 МБ/);
});
