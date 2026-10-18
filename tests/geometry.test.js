import test from 'node:test';
import assert from 'node:assert/strict';
import { bounds, alignObjects, distributeObjects, rotateObjects, flipObjects, cloneObjects } from '../src/geometry.js';
const box = (id, x, y, w = 100, h = 50, groupId = '') => ({ id, x, y, w, h, rotation: 0, groupId });
test('alignment treats a group as a unit and a single object aligns to slide', () => {
  const items = [box('a', 100, 60, 100, 50, 'g'), box('b', 250, 90, 100, 50, 'g'), box('c', 500, 400)];
  alignObjects(items, 'top'); assert.equal(items[2].y, 60); assert.equal(items[1].y - items[0].y, 30);
  const single = [box('x', 15, 20)]; alignObjects(single, 'center'); assert.equal(single[0].x, 590);
});
test('distribution preserves extremes and creates equal gaps for unequal sizes', () => {
  const items = [box('a', 0, 0, 80), box('b', 200, 0, 150), box('c', 600, 0, 100)];
  assert.equal(distributeObjects(items), true);
  assert.equal(items[0].x, 0); assert.equal(items[2].x, 600);
  assert.equal(items[1].x - 80, 600 - items[1].x - 150);
  assert.equal(distributeObjects(items.slice(0, 2)), false);
});
test('rotations and flips preserve group geometry and duplicate group identities independently', () => {
  const items = [box('a', 0, 0, 100, 50, 'g'), box('b', 200, 0, 100, 50, 'g')];
  const before = structuredClone(items); rotateObjects(items, 90); rotateObjects(items, -90);
  items.forEach((e, i) => { assert.ok(Math.abs(e.x - before[i].x) < 1e-8); assert.ok(Math.abs(e.y - before[i].y) < 1e-8); });
  flipObjects(items, 'x'); assert.equal(items[0].x, 200); flipObjects(items, 'x'); assert.equal(items[0].x, 0);
  const copy = cloneObjects(items); assert.notEqual(copy[0].groupId, 'g'); assert.equal(copy[0].groupId, copy[1].groupId);
  assert.notEqual(copy[0].id, items[0].id); assert.equal(copy[0].x, 25);
  assert.equal(bounds([box('a', 10, 20)]).w, 100);
});
