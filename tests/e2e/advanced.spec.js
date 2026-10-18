import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import JSZip from 'jszip';

async function fixture(page, slides = 1) {
  await page.goto('/');
  const deck = await page.evaluate(async count => {
    const { createDeck, createSlide, createElement } = await import('/src/model.js');
    const deck = createDeck(); deck.title = 'Команды PowerPoint'; deck.slides = [];
    for (let i=0;i<count;i++) { const s=createSlide(); s.elements = [createElement('text',{text:i?'Слайд '+(i+1):'Alpha alpha',x:80,y:70,w:500,h:80})]; deck.slides.push(s); }
    if(count===1) deck.slides[0].elements = [createElement('rect',{x:80,y:100,w:100,h:70}),createElement('rect',{x:300,y:160,w:150,h:70}),createElement('rect',{x:800,y:240,w:100,h:70})];
    return deck;
  }, slides);
  await page.locator('#open-file').setInputFiles({ name: 'fixture.pfree.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(deck)) });
  await expect(page.locator('.toast')).toContainText('открыта');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('presentation-free.deck.v1') || '{}').title)).toBe(deck.title);
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('presentation-free.deck.v1')));

test('selection, grouping, alignment, distribution and native PPTX groups', async ({ page }, info) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page);
  await page.keyboard.press('Control+a');
  await expect(page.locator('#stage .is-selected')).toHaveCount(3);
  await page.keyboard.press('Control+g');
  await expect.poll(async()=>new Set((await stored(page)).slides[0].elements.map(e=>e.groupId)).size).toBe(1);
  await expect.poll(async()=>(await stored(page)).slides[0].elements[0].groupId).not.toBe('');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async()=>(await stored(page)).slides[0].elements[0].x).toBe(81);
  await page.locator('[data-tab="Формат"]').click();
  await page.locator('[data-action="flip-h"]').click();
  await expect.poll(async()=>(await stored(page)).slides[0].elements.every(e=>e.flipH)).toBe(true);
  const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();
  const download=await pending, file=info.outputPath('groups.pptx');await download.saveAs(file);
  const zip=await JSZip.loadAsync(await fs.readFile(file));const xml=await zip.file('ppt/slides/slide1.xml').async('string');
  expect(xml).toContain('<p:grpSp>');expect(xml).toContain('flipH="1"');
  await page.locator('#open-file').setInputFiles(file);
  await expect(page.locator('.toast')).toContainText('открыта');
  await page.keyboard.press('Control+a');
  await expect.poll(async()=>new Set((await stored(page)).slides[0].elements.map(e=>e.groupId)).size).toBe(1);
  await expect.poll(async()=>(await stored(page)).slides[0].elements.every(e=>e.groupId)).toBe(true);
  await page.keyboard.press('Control+Shift+g');
  await expect.poll(async()=>(await stored(page)).slides[0].elements.every(e=>!e.groupId)).toBe(true);
  await page.locator('.arrange-menu summary').first().click();
  await page.locator('[data-action="object-align-top"]').first().click();
  await expect.poll(async()=>new Set((await stored(page)).slides[0].elements.map(e=>Math.round(e.y))).size).toBe(1);
  await page.locator('.arrange-menu summary').first().click();
  await page.locator('[data-action="distribute-x"]').first().click();
  await expect.poll(async()=>{const e=(await stored(page)).slides[0].elements.sort((a,b)=>a.x-b.x);return Math.round((e[1].x-e[0].x-e[0].w)-(e[2].x-e[1].x-e[1].w));}).toBe(0);
  expect(errors).toEqual([]);
});

test('headers, comments, literal replace, hidden slides and PPTX persistence', async ({ page }, info) => {
  await fixture(page,3);
  await page.locator('[data-tab="Вставка"]').click();await page.locator('[data-action="headers"]').click();
  await page.getByLabel('Нижний колонтитул',{exact:true}).fill('Presentation Free');
  await page.locator('[name="number"]').check();await page.getByRole('button',{name:'Применить ко всем',exact:true}).click();
  await expect.poll(async()=>(await stored(page)).slides.every(s=>s.elements.some(e=>e.role==='slide-number'))).toBe(true);
  await page.locator('[data-tab="Главная"]').click();await page.locator('[data-action="replace"]').click();
  await page.getByLabel('Найти для замены').fill('alpha');await page.getByLabel('Заменить на',{exact:true}).fill('$1');
  await page.getByRole('button',{name:'Заменить всё',exact:true}).click();await expect(page.locator('#stage')).toContainText('$1 $1');
  await page.locator('[data-tab="Рецензирование"]').click();await page.locator('[data-action="comments"]').click();
  await page.getByLabel('Новое примечание',{exact:true}).fill('Проверить заголовок');await page.getByRole('button',{name:'Добавить',exact:true}).click();
  await page.getByRole('button',{name:'Отметить как решённое'}).click();await expect(page.locator('.comment.resolved')).toHaveCount(1);
  await page.getByLabel('Закрыть',{exact:true}).click();
  await page.locator('[data-slide="1"]').click();await page.locator('[data-tab="Показ слайдов"]').click();await page.locator('[data-action="hide-slide"]').click();
  await expect(page.locator('[data-slide="1"]')).toHaveClass(/hidden-slide/);
  await page.locator('[data-action="present-start"]').click();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.presentation-controls')).toContainText('3 / 3');await page.keyboard.press('Escape');
  const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await pending,file=info.outputPath('hidden.pptx');await download.saveAs(file);
  const zip=await JSZip.loadAsync(await fs.readFile(file));expect(await zip.file('ppt/slides/slide2.xml').async('string')).toContain('show="0"');
  await page.reload();await page.locator('[data-tab="Рецензирование"]').click();await page.locator('[data-action="comments"]').click();
  await expect(page.locator('.comment.resolved')).toContainText('Проверить заголовок');
});
