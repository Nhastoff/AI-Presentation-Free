const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
async function main() {
  const zip = new JSZip();
  const files = [];
  async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file); else if (entry.isFile()) files.push(file);
    }
  }
  await collect('research');
  await collect('docs');
  await collect('scripts');
  const manifest = [];
  for (const file of files.sort()) {
    const data = await fs.readFile(file); const name = file.replaceAll('\\', '/');
    zip.file(name, data); manifest.push({ path: name, bytes: data.length, sha256: digest(data) });
  }
  zip.file('MANIFEST.json', JSON.stringify({ description: 'PowerPoint Office12 static research; no target binaries; file-integrity manifest', files: manifest }, null, 2));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const check = await JSZip.loadAsync(bytes, { checkCRC32: true });
  for (const file of manifest) if (digest(await check.file(file.path).async('nodebuffer')) !== file.sha256) throw new Error('Archive hash mismatch: ' + file.path);
  const output = 'release/PowerPoint-Office12-Analysis.zip';
  await fs.writeFile(output, bytes);
  await fs.writeFile(output + '.sha256', digest(bytes) + '  ' + path.basename(output) + '\n');
  console.log(JSON.stringify({ output, files: manifest.length, bytes: bytes.length, sha256: digest(bytes), checked: 'CRC32 and every file SHA256' }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
