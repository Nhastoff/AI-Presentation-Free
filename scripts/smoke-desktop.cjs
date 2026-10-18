const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const output = path.resolve('test-results', 'desktop');
  await fs.mkdir(output, { recursive: true });
  const application = await electron.launch({
    executablePath: process.env.PF_PACKAGED_EXE || require('electron'),
    args: process.env.PF_PACKAGED_EXE ? [] : ['.'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  });
  try {
    const page = await application.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.locator('#stage').waitFor();
    if (await page.locator('.slide-row').count() < 1) throw new Error('No slide rendered');
    const initialSlides = await page.locator('.slide-row').count();
    await page.keyboard.press('Control+m');
    await page.waitForFunction(count => document.querySelectorAll('.slide-row').length === count, initialSlides + 1);
    await page.keyboard.press('Control+z');
    await page.waitForFunction(count => document.querySelectorAll('.slide-row').length === count, initialSlides);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+g');
    await page.waitForFunction(() => {
      const deck = JSON.parse(localStorage.getItem('presentation-free.deck.v1'));
      return deck?.slides.some(slide => slide.elements.filter(e => e.groupId).length >= 2);
    });
    await page.keyboard.press('Control+Shift+g');
    await page.waitForFunction(() => {
      const deck = JSON.parse(localStorage.getItem('presentation-free.deck.v1'));
      return deck?.slides.every(slide => slide.elements.every(e => !e.groupId));
    });
    const security = await application.evaluate(({ BrowserWindow }) => {
      const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox };
    });
    if (security.nodeIntegration || !security.contextIsolation || !security.sandbox) throw new Error('Renderer isolation changed');
    const pdfPath = path.join(output, 'presentation.pdf');
    await application.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    }, pdfPath);
    await page.locator('[data-action="pdf"]').click();
    await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('PDF сохранён'));
    const pdf = await fs.readFile(pdfPath);
    if (pdf.subarray(0, 5).toString() !== '%PDF-' || pdf.length < 1000) throw new Error('Invalid PDF export');
    await page.screenshot({ path: path.join(output, 'presentation-free.png') });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ desktop: 'passed', pdfBytes: pdf.length, security, output }, null, 2));
  } finally { await application.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
