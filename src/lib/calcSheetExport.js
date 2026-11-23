import { getSpriteUrls, localizeName } from './championsData';

function summarizeConditions(snap, lang) {
  if (!snap) return [];
  const tags = [];
  const w = snap.field?.weather;
  if (w) tags.push(w);
  const tr = snap.field?.terrain;
  if (tr) tags.push(`${tr} Terrain`);
  if (snap.field?.crit) tags.push(lang === 'en' ? 'Crit' : 'Crítico');
  if (snap.field?.singleTarget) tags.push(lang === 'en' ? 'Single target' : 'Objetivo único');
  if (snap.yourSide?.helpingHand) tags.push('Helping Hand');
  if (snap.yourSide?.reflect || snap.rivalSide?.reflect) tags.push(lang === 'en' ? 'Reflect' : 'Reflejo');
  if (snap.yourSide?.lightScreen || snap.rivalSide?.lightScreen) tags.push(lang === 'en' ? 'Light Screen' : 'Pantalla Luz');
  for (const [k, v] of Object.entries(snap.yourBoosts ?? {})) {
    if (v) tags.push(`${v > 0 ? '+' : ''}${v} ${k.toUpperCase()}`);
  }
  if (snap.yourStatus) tags.push(snap.yourStatus.toUpperCase());
  return tags;
}

function moveLabel(moveId, data, lang) {
  if (!moveId) return '—';
  return localizeName('moves', data.moveNames?.[moveId] ?? moveId, lang);
}

/** Genera un resumen en texto plano / Markdown de todos los cálculos guardados. */
export function formatCalcSheetText({ teamName, calcs, data, lang = 'es' }) {
  const header = `=== ${teamName || 'Equipo'} — ${lang === 'en' ? 'Saved Calcs' : 'Cálculos guardados'} (VGC Reg M-C) ===`;
  const blocks = calcs.map((c, idx) => {
    const conds = summarizeConditions(c.snapshot, lang);
    const lines = [
      `${idx + 1}. ${c.yourSpeciesName} vs ${c.rivalSpeciesName}${conds.length ? ` [${conds.join(' · ')}]` : ''}`,
    ];
    if (c.yourBest) {
      lines.push(
        `   → ${moveLabel(c.yourBest.moveId, data, lang)}: ${c.yourBest.pctMin}–${c.yourBest.pctMax}% (${c.yourBest.koChance})`
      );
    }
    if (c.rivalBest) {
      lines.push(
        `   ← ${moveLabel(c.rivalBest.moveId, data, lang)}: ${c.rivalBest.pctMin}–${c.rivalBest.pctMax}% (${c.rivalBest.koChance})`
      );
    }
    return lines.join('\n');
  });
  return `${header}\n\n${blocks.join('\n\n')}`;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadSprite(speciesId) {
  for (const url of getSpriteUrls(speciesId)) {
    const img = await loadImage(url);
    if (img) return img;
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

function pctHex(pct) {
  if (pct >= 100) return '#60a5fa';
  if (pct >= 50) return '#4ade80';
  if (pct >= 33.4) return '#facc15';
  if (pct >= 25) return '#fb923c';
  return '#f87171';
}

/** Genera y descarga una imagen PNG en alta resolución con todos los cálculos guardados. */
export async function exportCalcSheetPng({ teamName, calcs, data, lang = 'es' }) {
  if (!calcs.length) return false;

  const cols = calcs.length === 1 ? 1 : 2;
  const rows = Math.ceil(calcs.length / cols);
  const padX = 36;
  const gap = 16;
  const cardH = 116;
  const startY = 92;
  const W = cols === 1 ? 660 : 1200;
  const H = startY + rows * cardH + (rows - 1) * gap + 44;
  const DPR = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.scale(DPR, DPR);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#141428');
  bg.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Cabecera
  ctx.fillStyle = '#e94560';
  roundRect(ctx, padX, 26, 6, 40, 3);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText(
    fitText(ctx, `${teamName || 'Equipo'} — ${lang === 'en' ? 'Calc Sheet' : 'Hoja de Cálculos'}`, W - padX * 2 - 20),
    padX + 18,
    51
  );
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 12px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`Pokémon Champions Team Lab · VGC Reg M-C · ${calcs.length} ${lang === 'en' ? 'calcs' : 'cálculos'}`, padX + 18, 70);

  // Precargar sprites únicos
  const uniqueIds = [...new Set(calcs.flatMap((c) => [c.yourSpeciesId, c.rivalSpeciesId]).filter(Boolean))];
  const spriteEntries = await Promise.all(uniqueIds.map(async (id) => [id, await loadSprite(id)]));
  const spriteMap = new Map(spriteEntries);

  const cardW = (W - padX * 2 - gap * (cols - 1)) / cols;

  calcs.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fillStyle = '#16213e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 52, 96, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Sprites
    const drawSpr = (id, bx, by) => {
      roundRect(ctx, bx, by, 52, 52, 8);
      ctx.fillStyle = 'rgba(26, 26, 46, 0.7)';
      ctx.fill();
      const img = spriteMap.get(id);
      if (img) {
        const sc = Math.min(46 / img.width, 46 / img.height);
        const sw = img.width * sc;
        const sh = img.height * sc;
        ctx.drawImage(img, bx + (52 - sw) / 2, by + (52 - sh) / 2, sw, sh);
      }
    };

    drawSpr(c.yourSpeciesId, x + 12, y + 32);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText('vs', x + 70, y + 61);
    drawSpr(c.rivalSpeciesId, x + 88, y + 32);

    const tx = x + 154;
    const tw = cardW - 168;

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 15px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(fitText(ctx, `${c.yourSpeciesName} vs ${c.rivalSpeciesName}`, tw), tx, y + 28);

    const conds = summarizeConditions(c.snapshot, lang);
    if (conds.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 11px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(fitText(ctx, conds.join(' · '), tw), tx, y + 46);
    }

    const drawCalcLine = (arrow, arrowColor, best, ly) => {
      if (!best) return;
      ctx.fillStyle = arrowColor;
      ctx.font = '700 13px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(arrow, tx, ly);

      const mv = moveLabel(best.moveId, data, lang);
      const pctText = `${best.pctMin}–${best.pctMax}%`;
      const koText = best.koChance ? ` (${best.koChance})` : '';

      ctx.font = '700 12px ui-monospace, SFMono-Regular, monospace';
      const rightText = `${pctText}${koText}`;
      const rightW = ctx.measureText(rightText).width;

      ctx.fillStyle = '#e5e7eb';
      ctx.font = '500 13px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(fitText(ctx, mv, Math.max(80, tw - rightW - 26)), tx + 16, ly);

      ctx.fillStyle = pctHex(best.pctMax);
      ctx.font = '700 12px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(rightText, x + cardW - 14 - rightW, ly);
    };

    drawCalcLine('→', '#e94560', c.yourBest, y + 74);
    drawCalcLine('←', '#38bdf8', c.rivalBest, y + 98);
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '500 11px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText('champions-team-lab.pages.dev', padX, H - 14);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (teamName || 'equipo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'equipo';
  a.href = url;
  a.download = `${slug}-calcs.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Abre una vista limpia lista para imprimir o guardar como PDF. */
export function printCalcSheetPdf({ teamName, calcs, data, lang = 'es' }) {
  if (!calcs.length) return false;
  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) return false;

  const cardsHtml = calcs.map((c) => {
    const conds = summarizeConditions(c.snapshot, lang);
    const ySpr = getSpriteUrls(c.yourSpeciesId)[0] ?? '';
    const rSpr = getSpriteUrls(c.rivalSpeciesId)[0] ?? '';
    const yLine = c.yourBest
      ? `<div class="line"><span class="arr-y">→</span> <b>${escHtml(moveLabel(c.yourBest.moveId, data, lang))}</b> <span class="pct">${c.yourBest.pctMin}–${c.yourBest.pctMax}%</span> <span class="ko">(${escHtml(c.yourBest.koChance)})</span></div>`
      : '';
    const rLine = c.rivalBest
      ? `<div class="line"><span class="arr-r">←</span> <b>${escHtml(moveLabel(c.rivalBest.moveId, data, lang))}</b> <span class="pct">${c.rivalBest.pctMin}–${c.rivalBest.pctMax}%</span> <span class="ko">(${escHtml(c.rivalBest.koChance)})</span></div>`
      : '';
    return `
      <div class="card">
        <div class="sprs">
          <img src="${escHtml(ySpr)}" alt="" />
          <span class="vs">vs</span>
          <img src="${escHtml(rSpr)}" alt="" />
        </div>
        <div class="info">
          <div class="title">${escHtml(c.yourSpeciesName)} <span class="vs">vs</span> ${escHtml(c.rivalSpeciesName)}</div>
          ${conds.length ? `<div class="conds">${escHtml(conds.join(' · '))}</div>` : ''}
          ${yLine}${rLine}
        </div>
      </div>`;
  }).join('');

  win.document.write(`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${escHtml(teamName || 'Equipo')} — Calc Sheet</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", system-ui, sans-serif; margin: 24px; color: #111827; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; break-inside: avoid; }
  .sprs { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .sprs img { width: 42px; height: 42px; object-fit: contain; }
  .vs { font-size: 11px; color: #6b7280; font-weight: 500; }
  .info { min-width: 0; flex: 1; }
  .title { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
  .conds { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
  .line { font-size: 12px; margin-top: 2px; }
  .arr-y { color: #e11d48; font-weight: 700; }
  .arr-r { color: #0284c7; font-weight: 700; }
  .pct { font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 700; }
  .ko { color: #4b5563; font-size: 11px; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <h1>${escHtml(teamName || 'Equipo')} — ${lang === 'en' ? 'Calc Sheet' : 'Hoja de Cálculos'}</h1>
  <div class="sub">Pokémon Champions Team Lab · VGC Reg M-C · ${calcs.length} ${lang === 'en' ? 'calcs' : 'cálculos'}</div>
  <div class="grid">${cardsHtml}</div>
  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`);
  win.document.close();
  return true;
}
