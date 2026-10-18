// Independent geometry commands; document coordinates are pixels at 96 dpi.
export function bounds(elements) {
  if (!elements.length) return { x: 0, y: 0, w: 0, h: 0 };
  const boxes = elements.map(e => {
    const radians = (e.rotation || 0) * Math.PI / 180;
    const w = Math.abs(e.w * Math.cos(radians)) + Math.abs(e.h * Math.sin(radians));
    const h = Math.abs(e.w * Math.sin(radians)) + Math.abs(e.h * Math.cos(radians));
    return { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h / 2, w, h };
  });
  const x = Math.min(...boxes.map(e => e.x)), y = Math.min(...boxes.map(e => e.y));
  return { x, y, w: Math.max(...boxes.map(e => e.x + e.w)) - x, h: Math.max(...boxes.map(e => e.y + e.h)) - y };
}
export function units(elements) {
  const groups = new Map();
  for (const e of elements) { const key = e.groupId || e.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
  return [...groups.values()].map(members => ({ ...bounds(members), members }));
}
export function translate(elements, dx, dy) { elements.forEach(e => { e.x += dx; e.y += dy; }); }
export function alignObjects(elements, mode, toSlide = false) {
  const items = units(elements);
  const area = toSlide || items.length === 1 ? { x: 0, y: 0, w: 1280, h: 720 } : bounds(elements);
  for (const item of items) {
    let dx = 0, dy = 0;
    if (mode === 'left') dx = area.x - item.x;
    if (mode === 'center') dx = area.x + area.w / 2 - item.x - item.w / 2;
    if (mode === 'right') dx = area.x + area.w - item.x - item.w;
    if (mode === 'top') dy = area.y - item.y;
    if (mode === 'middle') dy = area.y + area.h / 2 - item.y - item.h / 2;
    if (mode === 'bottom') dy = area.y + area.h - item.y - item.h;
    translate(item.members, dx, dy);
  }
}
export function distributeObjects(elements, axis = 'x') {
  const items = units(elements).sort((a, b) => a[axis] - b[axis]);
  if (items.length < 3) return false;
  const size = axis === 'x' ? 'w' : 'h', first = items[0], last = items.at(-1);
  const gap = (last[axis] + last[size] - first[axis] - items.reduce((sum, item) => sum + item[size], 0)) / (items.length - 1);
  let next = first[axis];
  for (const item of items) { translate(item.members, axis === 'x' ? next - item.x : 0, axis === 'y' ? next - item.y : 0); next += item[size] + gap; }
  return true;
}
export function rotateObjects(elements, degrees) {
  const area = bounds(elements), cx = area.x + area.w / 2, cy = area.y + area.h / 2;
  const angle = degrees * Math.PI / 180;
  for (const e of elements) {
    const dx = e.x + e.w / 2 - cx, dy = e.y + e.h / 2 - cy;
    e.x = cx + dx * Math.cos(angle) - dy * Math.sin(angle) - e.w / 2;
    e.y = cy + dx * Math.sin(angle) + dy * Math.cos(angle) - e.h / 2;
    e.rotation = ((e.rotation || 0) + degrees) % 360;
  }
}
export function flipObjects(elements, axis) {
  const area = bounds(elements);
  for (const e of elements) {
    if (axis === 'x') { e.x = area.x * 2 + area.w - e.x - e.w; e.flipH = !e.flipH; }
    else { e.y = area.y * 2 + area.h - e.y - e.h; e.flipV = !e.flipV; }
    e.rotation = -(e.rotation || 0);
  }
}
export function cloneObjects(elements, offset = 25, preserveRoles = false) {
  const groups = new Map();
  return elements.map(source => {
    const e = structuredClone(source); e.id = crypto.randomUUID(); e.x += offset; e.y += offset;
    if (!preserveRoles) e.role = '';
    if (e.groupId) { if (!groups.has(e.groupId)) groups.set(e.groupId, crypto.randomUUID()); e.groupId = groups.get(e.groupId); }
    if (e.regroupId) { if (!groups.has(e.regroupId)) groups.set(e.regroupId, crypto.randomUUID()); e.regroupId = groups.get(e.regroupId); }
    return e;
  });
}
