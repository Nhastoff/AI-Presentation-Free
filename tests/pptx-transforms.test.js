import test from 'node:test';
import assert from 'node:assert/strict';
import { pptxPosition } from '../src/pptx-groups.js';
function transform(angle) {
  const data = {off:{x:0,y:0},ext:{cx:100,cy:50}};
  return { getAttribute: key => key === 'rot' ? String(angle*60000) : null, getElementsByTagNameNS: (_,name) => data[name] ? [{getAttribute:key=>String(data[name][key]??0)}] : [] };
}
test('PPTX nonuniform scale composes with child rotation before decomposing dimensions', () => {
  const result = pptxPosition(transform(90),[2,0,0,1,0,0]);
  assert.ok(Math.abs(result.w-100)<1e-8);assert.ok(Math.abs(result.h-100)<1e-8);
  assert.equal(result.rotation,90);assert.equal(result._approximateGroupTransform,false);
  const shear = pptxPosition(transform(45),[2,0,0,1,0,0]);assert.equal(shear._approximateGroupTransform,true);
});
test('PPTX composed rotations normalize and preserve reflection', () => {
  const result=pptxPosition(transform(270),[-1,0,0,-1,0,0]);assert.ok(Math.abs(result.rotation-90)<1e-8);
  const mirror=pptxPosition(transform(0),[-1,0,0,1,0,0]);assert.equal(mirror.flipV,true);assert.equal(mirror.rotation,-180);
});
