// Convierte scripts/og-image.svg → public/og-image.png (1200×630).
// Las plataformas sociales (Discord, WhatsApp, Twitter…) no renderizan SVG,
// así que la tarjeta de enlace necesita un PNG raster.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

// Imagen social (Open Graph).
const ogSvg = await readFile(join(here, 'og-image.svg'));
await writeFile(join(publicDir, 'og-image.png'), await sharp(ogSvg).png().toBuffer());
console.log('✓ public/og-image.png generado (1200×630)');

// Iconos de la PWA (192 y 512) a partir del favicon, sobre fondo de la marca.
const favicon = await readFile(join(publicDir, 'favicon.svg'));
for (const size of [192, 512]) {
  const buf = await sharp(favicon)
    .resize(size, size, { fit: 'contain', background: '#1a1a2e' })
    .flatten({ background: '#1a1a2e' })
    .png()
    .toBuffer();
  await writeFile(join(publicDir, `icon-${size}.png`), buf);
  console.log(`✓ public/icon-${size}.png generado`);
}
