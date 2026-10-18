const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const sharp = require(process.env.PF_SHARP_PATH || 'sharp');
  const root = path.join(__dirname, '..', 'assets');
  const svg = await fs.readFile(path.join(root, 'logo.svg'));
  const png = await sharp(svg).resize(1024, 1024).png().toBuffer();
  await fs.writeFile(path.join(root, 'icon.png'), png);
  const small = await sharp(svg).resize(256, 256).png().toBuffer();
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
  ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(small.length, 14); ico.writeUInt32LE(22, 18);
  await fs.writeFile(path.join(root, 'icon.ico'), Buffer.concat([ico, small]));
  const header = Buffer.alloc(16);
  header.write('icns'); header.writeUInt32BE(16 + png.length, 4);
  header.write('ic10', 8); header.writeUInt32BE(8 + png.length, 12);
  await fs.writeFile(path.join(root, 'icon.icns'), Buffer.concat([header, png]));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
