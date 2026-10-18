import { createElement } from './model.js';

const count = (value, fallback, max) => Number.isFinite(Number(value)) ? Math.max(1, Math.min(max, Math.floor(Number(value)))) : fallback;

/** Tables are independent editable cells and labels, with no hidden data model. */
export function createTableElements(rows = 3, cols = 3) {
  rows = count(rows, 3, 10); cols = count(cols, 3, 8);
  const elements = [];
  const x = 120, y = 185, width = 1040, height = Math.min(440, rows * 76);
  const cellW = width / cols, cellH = height / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      elements.push(createElement('rect', { x: x + col * cellW, y: y + row * cellH, w: cellW - 2, h: cellH - 2, fill: row === 0 ? '#6554C0' : row % 2 ? '#F0EDF9' : '#F8F7FC' }));
      elements.push(createElement('text', { x: x + col * cellW + 12, y: y + row * cellH + Math.max(5, (cellH - 30) / 2), w: cellW - 26, h: Math.min(34, cellH - 8), text: row === 0 ? `Столбец ${col + 1}` : `Данные ${row}.${col + 1}`, fontSize: Math.min(24, cellH * .42, cellW / 6.5), color: row === 0 ? '#FFFFFF' : '#302A45', bold: row === 0 }));
    }
  }
  return elements;
}

/** Values generate a visual snapshot; bars and labels remain ordinary shapes. */
export function createChartElements(values = [40, 70, 55, 90], labels = ['Q1', 'Q2', 'Q3', 'Q4']) {
  if (!Array.isArray(values) || !values.length) values = [40, 70, 55, 90];
  values = values.slice(0, 12).map(value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1e9, Number(value))) : 0);
  const max = Math.max(...values, 1), left = 190, bottom = 570, plotW = 930, plotH = 320;
  const slot = plotW / values.length, barW = Math.min(110, slot * .64);
  const elements = [createElement('text', { x: 150, y: 105, w: 980, h: 70, text: 'Результаты по периодам', fontSize: 42, bold: true, color: '#302A45' })];
  for (let tick = 0; tick <= 4; tick++) {
    const y = bottom - plotH * tick / 4;
    elements.push(createElement('rect', { x: left, y, w: plotW, h: 2, fill: tick ? '#E8E5F0' : '#A69CB8' }));
    elements.push(createElement('text', { x: 115, y: y - 12, w: 62, h: 28, fontSize: 17, align: 'right', color: '#80758E', text: `${Math.round(max * tick / 4)}` }));
  }
  for (let i = 0; i < values.length; i++) {
    const height = Math.max(2, plotH * values[i] / max), x = left + slot * i + (slot - barW) / 2;
    elements.push(createElement('rect', { x, y: bottom - height, w: barW, h: height, fill: i % 2 ? '#A294DA' : '#6554C0' }));
    elements.push(createElement('text', { x: left + slot * i, y: bottom + 16, w: slot, h: 35, text: String(Array.isArray(labels) ? labels[i] ?? `${i + 1}` : i + 1).slice(0, 50), fontSize: Math.min(22, slot / 3.5), align: 'center', color: '#514760' }));
    elements.push(createElement('text', { x: left + slot * i, y: bottom - height - 35, w: slot, h: 30, text: `${values[i]}`, fontSize: Math.min(20, slot / 3.5), bold: true, align: 'center', color: '#514760' }));
  }
  return elements;
}

export function createLineElements() {
  return [createElement('rect', { x: 320, y: 355, w: 640, h: 5, fill: '#6554C0' })];
}
