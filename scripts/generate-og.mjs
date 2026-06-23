// Convierte scripts/og-image.svg → public/og-image.png (1200×630).
// Las plataformas sociales (Discord, WhatsApp, Twitter…) no renderizan SVG,
// así que la tarjeta de enlace necesita un PNG raster.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const svg = await readFile(join(here, 'og-image.svg'));
const png = await sharp(svg).png().toBuffer();
await writeFile(join(here, '..', 'public', 'og-image.png'), png);
console.log('✓ public/og-image.png generado (1200×630)');
