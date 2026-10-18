import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

async function importBytes(page, bytes) {
  return page.evaluate(async base64 => {
    const { importPptx } = await import('/src/model.js');
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    try { return { deck: await importPptx(new File([bytes], 'fixture.pptx')) }; }
    catch (error) { return { error: error.message }; }
  }, bytes.toString('base64'));
}

test('PPTX placeholder inherits layout geometry and theme font and colors', async ({ page }) => {
  const zip = new JSZip();
  const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = values => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${values.map(([id, target]) => `<Relationship Id="${id}" Target="${target}"/>`).join('')}</Relationships>`;
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slides/slide1.xml'], ['rId2', 'theme/theme1.xml']]));
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Inherited title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', '../slideLayouts/slideLayout1.xml']]));
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="952500" y="952500"/><a:ext cx="9525000" cy="952500"/></a:xfrm></p:spPr><p:txBody><a:p><a:pPr><a:defRPr sz="3600"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:pPr></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`);
  zip.file('ppt/theme/theme1.xml', `<a:theme xmlns:a="${a}"><a:themeElements><a:clrScheme name="Fixture"><a:accent1><a:srgbClr val="AB42CD"/></a:accent1></a:clrScheme><a:fontScheme name="Fixture"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`);
  await page.goto('/');
  const result = await importBytes(page, await zip.generateAsync({ type: 'nodebuffer' }));
  expect(result.error).toBeUndefined();
  const element = result.deck.slides[0].elements[0];
  expect(element.text).toBe('Inherited title');
  expect(element.x).toBeCloseTo(100); expect(element.w).toBeCloseTo(1000);
  expect(element.fontSize).toBe(48); expect(element.fontFamily).toBe('Georgia');
  expect(element.color).toBe('#AB42CD');
});

test('PPTX rejects inflated archive sizes before decompressing entries', async ({ page }) => {
  const zip = new JSZip(); zip.file('padding.txt', 'small');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(101 * 1024 * 1024, central + 24);
  await page.goto('/');
  const result = await importBytes(page, bytes);
  expect(result.error).toContain('Распакованный PPTX слишком большой');
});
