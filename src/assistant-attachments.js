import JSZip from 'jszip';
import { importPptx, validateDeck } from './model.js';

const cache = new Map();
export async function prepareAttachments(files) {
  const output = [];
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Вложение больше 20 МБ');
    if (cache.has(file.id)) { output.push(cache.get(file.id)); continue; }
    const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
    const item = { id: file.id, name: file.name, size: file.size };
    const ext = file.name.split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','webp','gif'].includes(ext)) {
      item.dataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${file.data}`;
      item.text = 'Изображение доступно для вставки по attachmentId. Для анализа изображения его нужно явно включить в запрос.';
    } else if (ext === 'pdf') {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
      const pdf = await task.promise;
      try {
        const pages = [];
        for (let i = 1; i <= Math.min(pdf.numPages, 100); i++) {
          const page = await pdf.getPage(i);
          pages.push(`[Страница ${i}]\n${(await page.getTextContent()).items.map(x => x.str || '').join(' ')}`);
          if (pages.join('').length > 120000) break;
        }
        item.text = pages.join('\n').slice(0, 120000) || 'PDF не содержит извлекаемого текста; OCR недоступен.';
        item.truncated = pdf.numPages > pages.length;
      } finally { await task.destroy(); }
    } else if (ext === 'docx') {
      const zip = await JSZip.loadAsync(bytes);
      const entry = zip.file('word/document.xml');
      if (!entry || entry._data?.uncompressedSize > 8 * 1024 * 1024) throw new Error('Некорректный или слишком большой DOCX');
      const doc = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('Повреждённый DOCX');
      item.text = [...doc.getElementsByTagNameNS('*', 'p')].map(p => [...p.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('')).join('\n').slice(0, 120000);
    } else if (ext === 'pptx') {
      item.deck = await importPptx(new File([bytes], file.name));
      item.text = item.deck.slides.map((s, i) => `Слайд ${i + 1}: ${s.elements.filter(e => e.type === 'text').map(e => e.text).join('\n')}\n${s.notes}`).join('\n').slice(0, 120000);
    } else if (['json', 'pfree'].includes(ext)) {
      item.deck = validateDeck(JSON.parse(new TextDecoder().decode(bytes)));
      item.text = item.deck.slides.map((s, i) => `Слайд ${i + 1}: ${s.elements.filter(e => e.type === 'text').map(e => e.text).join('\n')}`).join('\n').slice(0, 120000);
    } else item.text = new TextDecoder().decode(bytes).slice(0, 120000);
    cache.set(file.id, item);
    if (cache.size > 20) cache.delete(cache.keys().next().value);
    output.push(item);
  }
  return output;
}
