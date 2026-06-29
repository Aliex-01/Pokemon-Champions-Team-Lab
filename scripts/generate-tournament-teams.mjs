// Genera public/data/tournament-teams.json a partir del repositorio comunitario
// "VGCPastes (Champions)" en Google Sheets. Cada equipo guarda metadatos + el id
// de su pokepaste (el paste completo se descarga al importar, vía /raw con CORS).
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SHEET_ID = '1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw';
// Pestañas por regulación (gid) del Google Sheet de VGCPastes.
const SHEETS = [
  { gid: '791705272', reg: 'M-A' },
  { gid: '1458357160', reg: 'M-B' }, // pestaña «Champions M-B»
];

// Parser CSV mínimo (maneja comillas y saltos de línea dentro de celdas).
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const pasteId = (url) => (url || '').trim().replace(/\/+$/, '').split('/').pop();

async function sheetTeams({ gid, reg }) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo leer la hoja ${gid} (${res.status})`);
  const rows = parseCSV(await res.text());

  // Fila de cabecera: la que empieza por "Team ID".
  const headerIdx = rows.findIndex((r) => r[0]?.trim() === 'Team ID');
  if (headerIdx < 0) throw new Error('No se encontró la cabecera');
  const header = rows[headerIdx].map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  const iId = 0, iName = col('Full Name'), iPaste = col('Pokepaste'), iDate = col('Date Shared');
  const iEvent = col('Tournament / Event'), iRank = col('Rank'), iSource = col('Link to Source');
  const iOwner = col('Owner'), iMons = col('Pokemon Text for Copypasta');
  // El nombre de la cabecera incluye un salto de línea: la buscamos por prefijo.
  const iCode = header.findIndex((h) => h.startsWith('Replica Code'));

  const teams = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const id = (row[iId] || '').trim();
    if (!/^(?:PC|MB)\d+/i.test(id)) continue;
    const paste = pasteId(row[iPaste]);
    if (!paste) continue;
    // 6 especies a partir de la columna de copypasta (descartando celdas vacías).
    const mons = row.slice(iMons).map((s) => s.trim()).filter(Boolean).slice(0, 6);
    if (mons.length === 0) continue;
    teams.push({
      id,
      reg,
      player: (row[iName] || row[iOwner] || '').trim() || '—',
      owner: (row[iOwner] || '').trim(),
      event: (row[iEvent] || '').trim(),
      rank: (row[iRank] || '').trim(),
      date: (row[iDate] || '').trim(),
      source: (row[iSource] || '').trim(),
      code: (() => { const c = iCode >= 0 ? (row[iCode] || '').trim() : ''; return /^(?:none|-)?$/i.test(c) ? '' : c; })(),
      paste,
      mons,
    });
  }
  return teams;
}

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'public', 'data', 'tournament-teams.json');

try {
  let all = [];
  for (const s of SHEETS) {
    const t = await sheetTeams(s);
    console.log(`✓ ${s.reg}: ${t.length} equipos`);
    all = all.concat(t);
  }
  await writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), teams: all }));
  console.log(`✓ public/data/tournament-teams.json (${all.length} equipos)`);
} catch (err) {
  // No abortar el build (deploy) si el sheet falla: se conserva el JSON actual.
  console.warn(`⚠ No se pudieron regenerar los equipos de torneo: ${err.message}. Se mantiene el archivo existente.`);
}
