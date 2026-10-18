export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;
const STORAGE_KEY = 'presentation-free.deck.v1';
const uid = () => globalThis.crypto?.randomUUID?.() ?? `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const number = (value, fallback, min = -10000, max = 10000) => Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : fallback;
const color = (value, fallback) => typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value) ? `#${value.replace('#', '')}` : fallback;
const safeFont = value => typeof value === 'string' && value.length <= 100 && /^[\p{L}\p{N} ,_-]+$/u.test(value) ? value : 'Arial';

export function createElement(type = 'text', overrides = {}) {
  if (!['text', 'rect', 'ellipse', 'image'].includes(type)) throw new Error('Неизвестный тип объекта');
  return {
    id: uid(), type, x: 120, y: 120, w: type === 'text' ? 640 : 280, h: type === 'text' ? 100 : 180,
    text: type === 'text' ? 'Новый текст' : '', fontSize: 40, fontFamily: 'Arial', color: '#172B36',
    bold: false, italic: false, align: 'left', fill: type === 'text' ? 'transparent' : '#D8EFE7', src: '', rotation: 0, animation: 'none',
    groupId: '', flipH: false, flipV: false, underline: false, stroke: '#202237', strokeWidth: 0, opacity: 1, hyperlink: '',
    ...overrides,
  };
}

export function createSlide(layout = 'blank') {
  const slide = { id: uid(), background: '#FFFFFF', notes: '', transition: 'none', hidden: false, comments: [], elements: [] };
  if (layout === 'title') {
    slide.elements = [
      createElement('text', { x: 100, y: 215, w: 1080, h: 150, text: 'Заголовок презентации', fontSize: 68, bold: true }),
      createElement('text', { x: 105, y: 385, w: 1000, h: 80, text: 'Расскажите свою историю', fontSize: 28, color: '#627780' }),
    ];
  } else if (layout === 'split') {
    slide.elements = [
      createElement('text', { x: 80, y: 75, w: 1120, h: 100, text: 'Большая идея', fontSize: 54, bold: true }),
      createElement('text', { x: 80, y: 230, w: 490, h: 340, text: 'Добавьте главное сообщение.\n\nКороткие мысли помогают аудитории увидеть суть.', fontSize: 30 }),
      createElement('rect', { x: 660, y: 220, w: 540, h: 370, fill: '#D8EFE7' }),
    ];
  }
  return slide;
}

export function createDeck() {
  const first = createSlide('title');
  first.background = '#F2F7F4';
  first.elements.unshift(createElement('rect', { x: 100, y: 145, w: 80, h: 9, fill: '#147D64' }));
  first.elements[1].text = 'Идеи, которые\nстоит показать.';
  first.elements[1].h = 170;
  first.elements[2].y = 425;
  first.elements[2].text = 'Создано в AI Presentation Free';
  const second = createSlide('split');
  second.elements[0].text = 'От мысли к истории';
  second.elements[1].text = '01   Сформулируйте идею\n\n02   Добавьте визуальный акцент\n\n03   Поделитесь результатом';
  second.elements.push(createElement('ellipse', { x: 820, y: 285, w: 220, h: 220, fill: '#147D64' }));
  const third = createSlide('title');
  third.background = '#173F36';
  third.elements[0] = createElement('text', { x: 110, y: 230, w: 1060, h: 120, text: 'Ваш следующий шаг?', fontSize: 68, bold: true, color: '#FFFFFF' });
  third.elements[1] = createElement('text', { x: 115, y: 385, w: 1000, h: 80, text: 'Начните с одной хорошей идеи.', fontSize: 30, color: '#B8D9CB' });
  return { id: uid(), title: 'Моя первая презентация', slides: [first, second, third] };
}

export function validateDeck(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.slides) || !input.slides.length || input.slides.length > 500) {
    throw new Error('Файл должен содержать от 1 до 500 слайдов');
  }
  const ids = new Set();
  const id = value => {
    const candidate = typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : uid();
    const result = ids.has(candidate) ? uid() : candidate;
    ids.add(result);
    return result;
  };
  return {
    id: id(input.id), title: String(input.title || 'Без названия').slice(0, 500),
    footer: { text: String(input.footer?.text || '').slice(0, 500), date: String(input.footer?.date || '').slice(0, 100), number: !!input.footer?.number, excludeTitle: !!input.footer?.excludeTitle },
    slides: input.slides.map(slide => {
      if (!slide || !Array.isArray(slide.elements) || slide.elements.length > 2000) throw new Error('Некорректные объекты слайда');
      return {
        id: id(slide.id), background: color(slide.background, '#FFFFFF'), notes: String(slide.notes || '').slice(0, 100000),
        transition: ['none', 'fade', 'push'].includes(slide.transition) ? slide.transition : 'none',
        hidden: !!slide.hidden,
        comments: Array.isArray(slide.comments) ? slide.comments.slice(0, 500).filter(c => c && typeof c === 'object').map(c => ({ id: id(c.id), text: String(c.text || '').slice(0, 10000), resolved: !!c.resolved })) : [],
        elements: slide.elements.map(el => {
          if (!el || !['text', 'rect', 'ellipse', 'image'].includes(el.type)) throw new Error('Неизвестный объект в файле');
          const src = typeof el.src === 'string' && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(el.src) ? el.src : '';
          return {
            ...createElement(el.type), id: id(el.id), x: number(el.x, 120), y: number(el.y, 120),
            w: number(el.w, 400, 1, 10000), h: number(el.h, 100, 1, 10000), text: String(el.text ?? '').slice(0, 100000),
            fontSize: number(el.fontSize, 40, 6, 400), fontFamily: safeFont(el.fontFamily),
            color: color(el.color, '#172B36'), bold: !!el.bold, italic: !!el.italic,
            align: ['left', 'center', 'right'].includes(el.align) ? el.align : 'left',
            fill: el.fill === 'transparent' ? 'transparent' : color(el.fill, el.type === 'text' ? 'transparent' : '#D8EFE7'),
            src, rotation: number(el.rotation, 0, -360, 360),
            animation: ['none', 'appear', 'fade'].includes(el.animation) ? el.animation : 'none',
            groupId: typeof el.groupId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(el.groupId) ? el.groupId : '',
            regroupId: typeof el.regroupId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(el.regroupId) ? el.regroupId : '',
            role: ['footer', 'slide-number', 'date'].includes(el.role) ? el.role : '',
            flipH: !!el.flipH, flipV: !!el.flipV, underline: !!el.underline,
            stroke: color(el.stroke, '#202237'), strokeWidth: number(el.strokeWidth, 0, 0, 30), opacity: number(el.opacity, 1, 0, 1),
            hyperlink: typeof el.hyperlink === 'string' && /^https?:\/\/[^\s<>"']{1,2000}$/i.test(el.hyperlink) ? el.hyperlink : '',
          };
        }),
      };
    }),
  };
}

export function loadLocal() {
  try { const raw = globalThis.localStorage?.getItem(STORAGE_KEY); return raw ? validateDeck(JSON.parse(raw)) : null; }
  catch { return null; }
}
export function saveLocal(deck) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(validateDeck(deck)));
    return true;
  } catch { return false; }
}
const filename = title => (title || 'AI Presentation Free').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100);
export function downloadDeck(deck) {
  const clean = validateDeck(deck);
  const url = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `${filename(clean.title)}.pfree.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readDeckFile(file) {
  if (file.size > 100 * 1024 * 1024) throw new Error('Файл слишком большой: максимум 100 МБ');
  try { return validateDeck(JSON.parse(await file.text())); }
  catch (error) { throw new Error(`Не удалось открыть презентацию: ${error.message}`); }
}

export async function exportPptx(deck) {
  const clean = validateDeck(deck);
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'PF_WIDE', width: 13.333333, height: 7.5 }); pptx.layout = 'PF_WIDE';
  pptx.author = 'AI Presentation Free'; pptx.subject = 'Presentation'; pptx.title = clean.title; pptx.company = 'AI Presentation Free'; pptx.lang = 'ru-RU';
  for (const source of clean.slides) {
    const slide = pptx.addSlide(); slide.background = { color: source.background.slice(1) };
    slide.hidden = source.hidden;
    if (source.notes) slide.addNotes(source.notes);
    for (const el of source.elements) {
      const options = { x: el.x / 96, y: el.y / 96, w: el.w / 96, h: el.h / 96, rotate: el.rotation, flipH: el.flipH, flipV: el.flipV, ...(el.hyperlink ? { hyperlink: { url: el.hyperlink } } : {}) };
      const transparency = Math.round((1 - el.opacity) * 100);
      if (el.type === 'text') slide.addText(el.text, { ...options, fontFace: el.fontFamily, fontSize: el.fontSize * .75, color: el.color.slice(1), bold: el.bold, italic: el.italic, ...(el.underline ? { underline: { style: 'sng' } } : {}), transparency, align: el.align, valign: 'top', margin: 0, breakLine: false, ...(el.fill !== 'transparent' ? { fill: { color: el.fill.slice(1), transparency } } : {}) });
      else if (el.type === 'image' && el.src) slide.addImage({ ...options, transparency, data: el.src });
      else if (el.type !== 'image') slide.addShape(el.type === 'ellipse' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect, { ...options, line: el.strokeWidth ? { color: el.stroke.slice(1), width: el.strokeWidth * .75, transparency } : { transparency: 100 }, fill: el.fill === 'transparent' ? { color: 'FFFFFF', transparency: 100 } : { color: el.fill.slice(1), transparency } });
    }
  }
  const { addPptxGroups } = await import('./pptx-groups.js');
  const data = await addPptxGroups(await pptx.write({ outputType: 'blob' }), clean);
  const url = URL.createObjectURL(data), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${filename(clean.title)}.pptx`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The PPTX reader intentionally imports the common editable drawing primitives.
// Unsupported objects (charts, SmartArt, media, animations and grouped drawings)
// remain outside this format's current editing model.
export async function importPptx(file) {
  if (file.size > 100 * 1024 * 1024) throw new Error('Файл слишком большой: максимум 100 МБ');
  const { default: JSZip } = await import('jszip');
  const { flattenPptxTree, pptxPosition } = await import('./pptx-groups.js');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  // JSZip reads the archive directory before inflating individual entries. Check
  // declared expanded sizes here so a small hostile archive cannot exhaust RAM.
  const entries = Object.values(zip.files);
  if (entries.length > 10000) throw new Error('В PPTX слишком много файлов: максимум 10 000');
  let expandedSize = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const size = entry._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Некорректный размер содержимого PPTX');
    expandedSize += size;
    if (expandedSize > 100 * 1024 * 1024) throw new Error('Распакованный PPTX слишком большой: максимум 100 МБ');
  }
  const parse = value => {
    const doc = new DOMParser().parseFromString(value, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Повреждённый XML в PPTX');
    return doc;
  };
  const all = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const first = (node, name) => all(node, name)[0];
  const attr = (node, name) => node?.getAttribute(name);
  const getXml = async path => zip.file(path) ? parse(await zip.file(path).async('string')) : null;
  const resolve = (base, relative) => {
    const parts = relative.startsWith('/') ? [] : base.split('/').slice(0, -1);
    for (const part of relative.replace(/^\//, '').split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); }
    return parts.join('/');
  };
  const rels = async path => {
    const bits = path.split('/'); const name = bits.pop();
    const xml = await getXml([...bits, '_rels', `${name}.rels`].join('/'));
    return new Map(xml ? all(xml, 'Relationship').filter(rel => attr(rel, 'TargetMode') !== 'External').map(rel => [attr(rel, 'Id'), resolve(path, attr(rel, 'Target') || '')]) : []);
  };
  const presentation = await getXml('ppt/presentation.xml');
  if (!presentation) throw new Error('Файл не является презентацией PPTX');
  const size = first(presentation, 'sldSz');
  const sx = 1280 / (Number(attr(size, 'cx')) || 12192000), sy = 720 / (Number(attr(size, 'cy')) || 6858000);
  const presentationRels = await rels('ppt/presentation.xml');
  const slidePaths = all(presentation, 'sldId').map(node => presentationRels.get(node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))).filter(Boolean);
  if (!slidePaths.length || slidePaths.length > 500) throw new Error('В PPTX должно быть от 1 до 500 слайдов');
  const themePath = [...presentationRels.values()].find(value => /theme\/theme\d+\.xml$/.test(value)) || 'ppt/theme/theme1.xml';
  const theme = await getXml(themePath);
  const themeColors = {};
  const scheme = theme && first(theme, 'clrScheme');
  for (const entry of [...(scheme?.children || [])]) {
    const srgb = first(entry, 'srgbClr'), system = first(entry, 'sysClr');
    themeColors[entry.localName] = color(attr(srgb, 'val') || attr(system, 'lastClr'), '#172B36');
  }
  const colorAliases = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };
  const themeFont = kind => theme && attr(first(first(theme, kind) || theme, 'latin'), 'typeface');
  const readColor = (node, fallback, aliases = colorAliases) => {
    const srgb = node && first(node, 'srgbClr');
    const system = node && first(node, 'sysClr');
    const themed = node && first(node, 'schemeClr');
    const key = attr(themed, 'val');
    const base = color(attr(srgb, 'val') || attr(system, 'lastClr'), themeColors[aliases[key] || key] || fallback);
    if (!/^#[0-9A-Fa-f]{6}$/.test(base)) return base;
    const tint = themed && first(themed, 'tint'), shade = themed && first(themed, 'shade');
    if (!tint && !shade) return base;
    const factor = clamp(Number(attr(tint || shade, 'val')) / 100000, 0, 1);
    const channels = base.slice(1).match(/../g).map(channel => parseInt(channel, 16));
    return `#${channels.map(channel => Math.round(tint ? channel + (255 - channel) * factor : channel * factor).toString(16).padStart(2, '0')).join('')}`;
  };
  const slides = [], importWarnings = new Set();
  for (const path of slidePaths) {
    const xml = await getXml(path); if (!xml) continue;
    const relationships = await rels(path);
    const slideRels = await getXml(path.replace(/\/([^/]+)$/, '/_rels/$1.rels'));
    const externalLinks = new Map(slideRels ? all(slideRels, 'Relationship').filter(rel => attr(rel, 'TargetMode') === 'External' && /^https?:\/\//i.test(attr(rel, 'Target') || '')).map(rel => [attr(rel, 'Id'), attr(rel, 'Target')]) : []);
    const layoutPath = [...relationships.values()].find(value => /slideLayouts\/slideLayout\d+\.xml$/.test(value));
    const layout = layoutPath ? await getXml(layoutPath) : null;
    const layoutRels = layoutPath ? await rels(layoutPath) : new Map();
    const masterPath = [...layoutRels.values()].find(value => /slideMasters\/slideMaster\d+\.xml$/.test(value));
    const master = masterPath ? await getXml(masterPath) : null;
    const aliases = { ...colorAliases };
    const masterMap = master && first(master, 'clrMap');
    for (const key of Object.keys(colorAliases)) if (attr(masterMap, key)) aliases[key] = attr(masterMap, key);
    const placeholder = (container, ph) => {
      if (!container || !ph) return null;
      const candidates = all(container, 'sp').filter(candidate => first(candidate, 'ph'));
      return candidates.find(candidate => {
        const candidatePh = first(candidate, 'ph');
        return (attr(candidatePh, 'idx') || '0') === (attr(ph, 'idx') || '0') && (!attr(ph, 'type') || (attr(candidatePh, 'type') || 'obj') === attr(ph, 'type'));
      }) || candidates.find(candidate => attr(first(candidate, 'ph'), 'type') === attr(ph, 'type'));
    };
    const slide = createSlide(); const bg = first(xml, 'bg') || (layout && first(layout, 'bg')) || (master && first(master, 'bg'));
    slide.hidden = xml.documentElement.getAttribute('show') === '0';
    if (bg) slide.background = readColor(bg, '#FFFFFF', aliases);
    const tree = first(xml, 'spTree');
    for (const { shape, matrix, groupId } of flattenPptxTree(tree, sx, sy)) {
      const ph = first(shape, 'ph');
      const layoutShape = placeholder(layout, ph);
      const masterShape = placeholder(master, layoutShape ? first(layoutShape, 'ph') : ph);
      const chain = [shape, layoutShape, masterShape].filter(Boolean);
      const transform = chain.map(node => first(node, 'xfrm')).find(Boolean); const off = transform && first(transform, 'off'); const ext = transform && first(transform, 'ext');
      const position = pptxPosition(transform, matrix, groupId);
      if (position._approximateGroupTransform) importWarnings.add('Перекос внутри группы приближён: проверьте наклон и размеры объектов.');
      const link = first(shape, 'hlinkClick');
      position.hyperlink = externalLinks.get(link?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')) || '';
      if (shape.localName === 'pic') {
        const blip = first(shape, 'blip'); const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
        const mediaPath = relationships.get(rid); const media = mediaPath && zip.file(mediaPath);
        const extension = mediaPath?.split('.').pop().toLowerCase();
        const mime = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', bmp: 'bmp' }[extension];
        const alpha = blip && first(blip, 'alphaModFix');
        if (media && mime) slide.elements.push(createElement('image', { ...position, opacity: alpha ? Number(attr(alpha, 'amt')) / 100000 : 1, src: `data:image/${mime};base64,${await media.async('base64')}` }));
        continue;
      }
      const body = first(shape, 'txBody');
      const paragraphs = body ? all(body, 'p') : [];
      const textValue = paragraphs.map(p => [...p.children].map(run => run.localName === 'br' ? '\n' : all(run, 't').map(t => t.textContent).join('')).join('')).join('\n');
      const props = first(shape, 'spPr'); const fill = props && [...props.children].find(child => child.localName === 'solidFill');
      if (body && textValue) {
        const phType = attr(ph, 'type') || attr(layoutShape && first(layoutShape, 'ph'), 'type') || 'body';
        const isTitle = ['title', 'ctrTitle'].includes(phType);
        const masterStyle = master && first(master, isTitle ? 'titleStyle' : phType === 'body' ? 'bodyStyle' : 'otherStyle');
        const runChain = chain.map(node => { const textBody = first(node, 'txBody'); return textBody && (first(textBody, 'rPr') || first(textBody, 'defRPr')); }).filter(Boolean);
        if (masterStyle && first(masterStyle, 'defRPr')) runChain.push(first(masterStyle, 'defRPr'));
        const runValue = name => runChain.map(run => attr(run, name)).find(value => value !== null && value !== undefined);
        const latin = runChain.map(run => first(run, 'latin')).find(Boolean);
        let fontFamily = attr(latin, 'typeface') || 'Arial';
        if (fontFamily.startsWith('+mj')) fontFamily = themeFont('majorFont') || 'Arial';
        if (fontFamily.startsWith('+mn')) fontFamily = themeFont('minorFont') || 'Arial';
        const pProps = chain.map(node => first(node, 'pPr')).find(Boolean);
        const coloredRun = runChain.find(run => first(run, 'solidFill'));
        const underline = runValue('u');
        slide.elements.push(createElement('text', { ...position, text: textValue, fontSize: runValue('sz') ? Number(runValue('sz')) / 100 * 4 / 3 : isTitle ? 52 : 32, fontFamily, bold: runValue('b') === '1', italic: runValue('i') === '1', underline: !!underline && underline !== 'none', align: { ctr: 'center', r: 'right' }[attr(pProps, 'algn')] || 'left', color: readColor(coloredRun, '#172B36', aliases), fill: readColor(fill, 'transparent', aliases) }));
      } else {
        const geometry = first(shape, 'prstGeom');
        const line = props && [...props.children].find(e => e.localName === 'ln');
        const alpha = fill && first(fill, 'alpha');
        slide.elements.push(createElement(attr(geometry, 'prst') === 'ellipse' ? 'ellipse' : 'rect', { ...position, fill: props && [...props.children].some(e => e.localName === 'noFill') ? 'transparent' : readColor(fill, '#D8EFE7', aliases), stroke: readColor(line, '#202237', aliases), strokeWidth: line && !first(line, 'noFill') ? Number(attr(line, 'w') || 9525) / 9525 : 0, opacity: alpha ? Number(attr(alpha, 'val')) / 100000 : 1 }));
      }
    }
    const notesPath = [...relationships.values()].find(value => /notesSlides\/notesSlide\d+\.xml$/.test(value));
    if (notesPath) {
      const notes = await getXml(notesPath);
      if (notes) slide.notes = all(notes, 'sp').filter(node => attr(first(node, 'ph'), 'type') === 'body').map(node => all(node, 't').map(t => t.textContent).join('\n')).join('\n');
    }
    slides.push(slide);
  }
  const result = validateDeck({ id: uid(), title: file.name?.replace(/\.pptx$/i, '') || 'Импортированная презентация', slides });
  result.importWarnings = [...importWarnings];
  return result;
}
