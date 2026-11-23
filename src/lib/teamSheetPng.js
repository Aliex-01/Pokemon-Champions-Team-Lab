import { getSpecies, getSpriteUrls, localizeName } from './championsData';
import { convertInvestment, formatNatureLabel } from './stats';

const TYPE_COLORS = {
  Normal: '#a8a77a',
  Fire: '#ee8130',
  Water: '#6390f0',
  Electric: '#f7d02c',
  Grass: '#7ac74c',
  Ice: '#96d9d6',
  Fighting: '#c22e28',
  Poison: '#a33ea1',
  Ground: '#e2bf65',
  Flying: '#a98ff3',
  Psychic: '#f95587',
  Bug: '#a6b91a',
  Rock: '#b6a136',
  Ghost: '#735797',
  Dragon: '#6f35fc',
  Dark: '#705746',
  Steel: '#b7b7ce',
  Fairy: '#d685ad',
};

const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadFirstSprite(speciesId) {
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
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

/**
 * Genera y descarga una imagen PNG estilo Team Sheet (2×3) del equipo.
 * `mode`: 'full' (incluye naturaleza y stat points) o 'open' (lista abierta).
 */
export async function exportTeamSheetPng({ team, data, mode = 'full', lang = 'es' }) {
  const mons = team.pokemon.filter((p) => p.speciesId);
  if (mons.length === 0) return false;

  const W = 1200;
  const H = mode === 'full' ? 760 : 700;
  const DPR = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.scale(DPR, DPR);

  // Fondo degradado oscuro acorde al tema de la app.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#141428');
  bg.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Cabecera
  ctx.fillStyle = '#e94560';
  roundRect(ctx, 36, 28, 6, 40, 3);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText(fitText(ctx, team.name || 'Equipo', 760), 54, 54);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 13px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Pokémon Champions Team Lab · VGC Reg M-C', 54, 74);

  // Badge de modo arriba a la derecha
  const modeLabel = mode === 'full'
    ? (lang === 'en' ? 'Full Team Sheet' : 'Lista Completa')
    : (lang === 'en' ? 'Open Team Sheet' : 'Lista Abierta');
  ctx.font = '600 13px Inter, "Segoe UI", system-ui, sans-serif';
  const badgeW = ctx.measureText(modeLabel).width + 28;
  roundRect(ctx, W - 36 - badgeW, 34, badgeW, 30, 8);
  ctx.fillStyle = 'rgba(233, 69, 96, 0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(233, 69, 96, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fda4af';
  ctx.fillText(modeLabel, W - 36 - badgeW + 14, 54);

  // Precargar sprites en paralelo
  const sprites = await Promise.all(mons.map((m) => loadFirstSprite(m.speciesId)));

  // Rejilla 3 columnas × 2 filas
  const cols = 3;
  const padX = 36;
  const startY = 96;
  const gap = 18;
  const cardW = (W - padX * 2 - gap * (cols - 1)) / cols;
  const cardH = mode === 'full' ? 298 : 268;

  for (let i = 0; i < 6; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    roundRect(ctx, x, y, cardW, cardH, 14);
    ctx.fillStyle = '#16213e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 52, 96, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const mon = mons[i];
    if (!mon) {
      ctx.fillStyle = 'rgba(156, 163, 175, 0.35)';
      ctx.font = '500 14px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lang === 'en' ? 'Empty slot' : 'Hueco vacío', x + cardW / 2, y + cardH / 2);
      ctx.textAlign = 'left';
      continue;
    }

    const sp = getSpecies(mon.speciesId);
    const sprite = sprites[i];

    // Caja del sprite
    roundRect(ctx, x + 14, y + 14, 78, 78, 10);
    ctx.fillStyle = 'rgba(26, 26, 46, 0.7)';
    ctx.fill();

    if (sprite) {
      const scale = Math.min(70 / sprite.width, 70 / sprite.height);
      const sw = sprite.width * scale;
      const sh = sprite.height * scale;
      ctx.drawImage(sprite, x + 14 + (78 - sw) / 2, y + 14 + (78 - sh) / 2, sw, sh);
    }

    // Nombre + tipos
    const infoX = x + 104;
    const infoW = cardW - 118;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(fitText(ctx, mon.speciesName, infoW), infoX, y + 32);

    let tx = infoX;
    for (const ty of sp?.types ?? []) {
      ctx.font = '600 10px Inter, "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(ty).width + 14;
      roundRect(ctx, tx, y + 40, tw, 18, 4);
      ctx.fillStyle = TYPE_COLORS[ty] ?? '#6b7280';
      ctx.fill();
      ctx.fillStyle = ty === 'Electric' || ty === 'Ground' || ty === 'Ice' ? '#111827' : '#ffffff';
      ctx.fillText(ty, tx + 7, y + 53);
      tx += tw + 5;
    }

    // Habilidad y objeto
    const abilityText = sp?.isMega && mon.preMegaAbility
      ? `${localizeName('abilities', mon.preMegaAbility, lang)} → ${localizeName('abilities', mon.ability, lang)}`
      : localizeName('abilities', mon.ability || '—', lang);
    const heldItem = mon.item || (sp?.isMega ? sp.megaStone : '') || '';
    const itemText = heldItem ? localizeName('items', heldItem, lang) : (lang === 'en' ? 'No item' : 'Sin objeto');

    ctx.font = '500 12px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(fitText(ctx, abilityText, infoW), infoX, y + 74);
    ctx.fillStyle = '#f9a8d4';
    ctx.fillText(fitText(ctx, `@ ${itemText}`, infoW), infoX, y + 91);

    // Separador
    ctx.strokeStyle = 'rgba(15, 52, 96, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 106);
    ctx.lineTo(x + cardW - 14, y + 106);
    ctx.stroke();

    // 4 movimientos
    const moveStartY = y + 120;
    for (let m = 0; m < 4; m++) {
      const moveId = mon.moves[m];
      const my = moveStartY + m * 32;
      roundRect(ctx, x + 14, my, cardW - 28, 26, 6);
      ctx.fillStyle = 'rgba(26, 26, 46, 0.65)';
      ctx.fill();

      if (moveId) {
        const md = data.moveData?.[moveId];
        const moveColor = TYPE_COLORS[md?.type] ?? '#6b7280';
        roundRect(ctx, x + 14, my, 5, 26, 3);
        ctx.fillStyle = moveColor;
        ctx.fill();

        const moveName = localizeName('moves', data.moveNames?.[moveId] ?? moveId, lang);
        ctx.fillStyle = '#f3f4f6';
        ctx.font = '500 13px Inter, "Segoe UI", system-ui, sans-serif';
        ctx.fillText(fitText(ctx, moveName, cardW - 52), x + 28, my + 17);
      } else {
        ctx.fillStyle = '#6b7280';
        ctx.font = '400 12px Inter, "Segoe UI", system-ui, sans-serif';
        ctx.fillText('—', x + 28, my + 17);
      }
    }

    // Naturaleza y Stat Points en modo completo
    if (mode === 'full') {
      const evs = mon.evMode === 'champions'
        ? mon.evs
        : convertInvestment(mon.evs, 'traditional', 'champions');
      const spreadParts = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
        .filter((k) => evs[k] > 0)
        .map((k) => `${evs[k]} ${STAT_LABELS[k]}`);
      const spreadStr = spreadParts.length ? spreadParts.join(' / ') : (lang === 'en' ? 'No SP' : 'Sin SP');
      const natLabel = formatNatureLabel(mon.nature, localizeName('natures', mon.nature, lang));

      ctx.fillStyle = '#9ca3af';
      ctx.font = '500 11px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(fitText(ctx, natLabel, cardW - 28), x + 14, y + 266);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(fitText(ctx, `SP: ${spreadStr}`, cardW - 28), x + 14, y + 284);
    }
  }

  // Pie de página discreto
  ctx.fillStyle = '#64748b';
  ctx.font = '500 11px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText('champions-team-lab.pages.dev', 36, H - 14);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (team.name || 'equipo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'equipo';
  a.href = url;
  a.download = `${slug}-${mode === 'full' ? 'completo' : 'open'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
