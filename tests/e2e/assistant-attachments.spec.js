import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

function minimalPdf(text) {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content).toString('base64');
}

test('actual attachment extraction reads DOCX paragraphs, PDF worker and bounded cached text', async ({ page }) => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Привет &amp; мир</w:t></w:r><w:r><w:t>!</w:t></w:r></w:p><w:p><w:r><w:t>Второй абзац</w:t></w:r></w:p></w:body></w:document>');
  const docx = await zip.generateAsync({ type: 'base64' });
  await page.goto('/');
  const result = await page.evaluate(async ({ docx, pdf }) => {
    const { prepareAttachments } = await import('/src/assistant-attachments.js');
    const [doc, documentPdf, text] = await prepareAttachments([
      { id: 'actual-docx', name: 'source.docx', size: 500, data: docx },
      { id: 'actual-pdf', name: 'source.pdf', size: 1000, data: pdf },
      { id: 'cached-text', name: 'source.txt', size: 130000, data: btoa('A'.repeat(130000)) },
    ]);
    const [cached] = await prepareAttachments([{ id: 'cached-text', name: 'source.txt', size: 10, data: btoa('changed') }]);
    return { doc: doc.text, pdf: documentPdf.text, textLength: text.text.length, cachedSameObject: cached === text, cacheLength: cached.text.length };
  }, { docx, pdf: minimalPdf('Real PDF attachment text') });
  expect(result.doc).toBe('Привет & мир!\nВторой абзац');
  expect(result.pdf).toContain('[Страница 1]');
  expect(result.pdf).toContain('Real PDF attachment text');
  expect(result.textLength).toBe(120000);
  expect(result.cachedSameObject).toBe(true);
  expect(result.cacheLength).toBe(120000);
});

test('image attachment analysis is an explicit opt-in before sending', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sentAttachments = [];
    window.presentationAI = {
      status: async () => ({ connected: true }),
      historyLoad: async () => [], historySave: async () => {}, onEvent: () => () => {},
      pickAttachments: async () => [{ id: crypto.randomUUID(), name: 'image.png', type: 'image/png', size: 68, data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=' }],
      send: async ({ attachments }) => { window.__sentAttachments.push(attachments); return { done: true }; },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '✦ Помощник', exact: true }).click();
  await page.getByRole('button', { name: 'Прикрепить материалы', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: 'Анализировать изображение (расходует больше лимита)' });
  await expect(checkbox).not.toBeChecked();
  await page.getByLabel('Сообщение помощнику').fill('Вставь изображение');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  expect(await page.evaluate(() => Boolean(window.__sentAttachments[0][0].analyzeImage))).toBe(false);
  await page.getByRole('button', { name: 'Прикрепить материалы', exact: true }).click();
  await checkbox.check();
  await page.getByLabel('Сообщение помощнику').fill('Опиши изображение');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  expect(await page.evaluate(() => window.__sentAttachments[1][0].analyzeImage)).toBe(true);
});

test('built-compatible attachment UI loads the PDF worker and sends extracted PDF and DOCX text', async ({ page }) => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX UI extraction</w:t></w:r></w:p></w:body></w:document>');
  const files = [
    { id: 'ui-pdf', name: 'input.pdf', size: 1000, data: minimalPdf('PDF worker UI extraction') },
    { id: 'ui-docx', name: 'input.docx', size: 500, data: await zip.generateAsync({ type: 'base64' }) },
  ];
  await page.addInitScript(files => {
    window.presentationAI = {
      status: async () => ({ connected: true }), historyLoad: async () => [], historySave: async () => {}, onEvent: () => () => {},
      pickAttachments: async () => files,
      send: async ({ attachments }) => { window.__extractedFiles = attachments; return { done: true }; },
    };
  }, files);
  await page.goto(process.env.PF_BUILT_URL || '/');
  await page.getByRole('button', { name: '✦ Помощник', exact: true }).click();
  await page.getByRole('button', { name: 'Прикрепить материалы', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать input.pdf', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Убрать input.docx', exact: true })).toBeVisible();
  await page.getByLabel('Сообщение помощнику').fill('Используй материалы');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  const extracted = await page.evaluate(() => window.__extractedFiles);
  expect(extracted[0].text).toContain('PDF worker UI extraction');
  expect(extracted[1].text).toBe('DOCX UI extraction');
});
