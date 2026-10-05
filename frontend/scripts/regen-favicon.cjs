// Generate favicon PNGs from favicon.jpg.
// Run: node scripts/regen-favicon.cjs
const path = require('path');
const fs = require('fs');

// Resolve sharp from server/node_modules
const sharp = require(path.join(__dirname, '..', '..', 'server', 'node_modules', 'sharp'));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SOURCE = path.join(PUBLIC_DIR, 'favicon.jpg');

// PNG targets — square, all sizes needed by index.html / manifest / browsers
const pngTargets = [
  { size: 16, file: 'favicon-16x16.png' },
  { size: 32, file: 'favicon-32x32.png' },
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 192, file: 'favicon-192x192.png' },
  { size: 512, file: 'favicon-512x512.png' },
];



async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source image not found:', SOURCE);
    process.exit(1);
  }
  const meta = await sharp(SOURCE).metadata();
  console.log(`Source: ${SOURCE} (${meta.width}x${meta.height})`);

  for (const { size, file } of pngTargets) {
    const out = path.join(PUBLIC_DIR, file);
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`Wrote ${file} (${size}x${size})`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});