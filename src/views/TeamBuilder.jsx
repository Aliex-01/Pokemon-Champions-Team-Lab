import { useState, useEffect, useMemo, useRef } from 'react';
import { useTeam } from '../store/teamStore';
import { PokemonEditor } from '../components/PokemonEditor';
import { Toast } from '../components/Toast';
import { SegmentedControl } from '../components/SegmentedControl';
import { InfoTooltip } from '../components/InfoTooltip';
import { useLang } from '../lib/i18n';
import { getSpecies, localizeName } from '../lib/championsData';
import { convertInvestment, totalInvestment, maxInvestment } from '../lib/stats';
import { parseShowdownTeam } from '../lib/showdownImport';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { exportTeamSheetPng } from '../lib/teamSheetPng';
import { createEmptyPokemon } from '../types/pokemon';

const SHOWDOWN_STAT_LABELS = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

function cloneTeamPokemon(list) {
  return list.map((p) => ({
    ...p,
    evs: { ...p.evs },
    ivs: { ...p.ivs },
    moves: [...p.moves],
  }));
}

export function TeamBuilder({ data }) {
  const { activeTeam, updatePokemon, setActiveTeamPokemon } = useTeam();
  const [activeSlot, setActiveSlot] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [dropped, setDropped] = useState(null);
  const [builds, setBuilds] = useState(null);
  const [undo, setUndo] = useState(null);
  const [showChecks, setShowChecks] = useState(false);
  const undoTimerRef = useRef(null);
  // Al cambiar de equipo, deseleccionar (sin hueco activo).
  const [prevTeamId, setPrevTeamId] = useState(activeTeam?.id);

  const { t, lang } = useLang();

  useEffect(() => {
    loadMetaBuilds().then((b) => { if (b) setBuilds(b); });
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, []);

  const teamPokemon = activeTeam?.pokemon;
  const validation = useMemo(() => computeTeamValidation(teamPokemon ?? [], t, lang), [teamPokemon, t, lang]);

  if (!activeTeam) return null;

  if (prevTeamId !== activeTeam.id) {
    setPrevTeamId(activeTeam.id);
    setActiveSlot(null);
    setUndo(null);
    setShowChecks(false);
  }

  const pushUndo = (label, snapshot) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ label, pokemon: cloneTeamPokemon(snapshot) });
    undoTimerRef.current = setTimeout(() => setUndo(null), 8000);
  };

  const applyUndo = () => {
    if (!undo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setActiveTeamPokemon(undo.pokemon);
    setUndo(null);
  };

  const handleDeleteSlot = (slotIndex) => {
    const mon = activeTeam.pokemon[slotIndex];
    if (!mon?.speciesId) return;
    pushUndo(`${t('Eliminado')}: ${mon.speciesName}`, activeTeam.pokemon);
    updatePokemon(slotIndex, createEmptyPokemon(mon.slotId));
  };

  // Reordena el equipo moviendo el Pokémon de `from` a la posición `to`.
  const reorder = (from, to) => {
    if (from === to) return;
    const arr = [...activeTeam.pokemon];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setActiveTeamPokemon(arr);
    setActiveSlot(to);
    setDropped(to);
    setTimeout(() => setDropped(null), 350);
  };

  // Reordenar con teclado cuando una tarjeta tiene el foco.
  const onCardKeyDown = (e, i) => {
    // Solo si el foco está en la tarjeta misma, no en inputs/botones internos.
    if (e.target !== e.currentTarget) return;
    const last = activeTeam.pokemon.length - 1;
    let to = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = Math.max(0, i - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = Math.min(last, i + 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = last;
    if (to !== null) { e.preventDefault(); reorder(i, to); }
  };

  return (
    <div className="page-enter">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {t('Constructor de Equipo')}
          <InfoTooltip side="bottom" label={t('Más información')}>
            {lang === 'en'
              ? 'Build your active team: pick species, ability, item, nature, moves and EVs for each of the 6 slots. Drag to reorder, and import/export in Showdown or Poképaste format.'
              : 'Monta tu equipo activo: elige especie, habilidad, objeto, naturaleza, movimientos y EVs de cada uno de los 6 slots. Arrastra para reordenar, e importa/exporta en formato Showdown o Poképaste.'}
          </InfoTooltip>
        </h2>

        {validation.filledCount > 0 && (
          validation.issues.length === 0 && validation.filledCount === 6 ? (
            <span className="text-xs font-medium text-emerald-300 bg-emerald-950/40 border border-emerald-700/40 rounded-lg px-2.5 py-1">
              ✓ {t('VGC válido')}
            </span>
          ) : validation.issues.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowChecks((s) => !s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 transition-colors ${
                validation.ruleErrors > 0
                  ? 'bg-red-950/50 border-red-700/60 text-red-300 hover:bg-red-900/50'
                  : 'bg-poke-panel border-poke-accent text-amber-200 hover:border-amber-500/50'
              }`}
            >
              <span>
                {validation.ruleErrors > 0
                  ? `⚠ ${validation.ruleErrors} ${t('regla VGC')}`
                  : `• ${validation.incompleteCount} ${t('incompletos')}`}
              </span>
              <span className={`text-[10px] transition-transform ${showChecks ? 'rotate-180' : ''}`}>▾</span>
            </button>
          ) : null
        )}
      </div>

      {showChecks && validation.issues.length > 0 && (
        <div className="panel p-3 mb-4 space-y-1.5 animate-fade-in-up">
          {validation.issues.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => { setActiveSlot(it.slot); setShowChecks(false); }}
              className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                it.tone === 'error'
                  ? 'bg-red-950/40 text-red-300 hover:bg-red-900/40'
                  : 'bg-poke-dark/50 text-amber-200 hover:bg-poke-accent/40'
              }`}
            >
              <span>{it.tone === 'error' ? '⚠ ' : '• '}{it.text}</span>
              <span className="text-[11px] text-gray-400 shrink-0">{t('Editar')} →</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {activeTeam.pokemon.map((mon, i) => (
          <div
            key={`${activeTeam.id}-${mon.slotId}`}
            draggable
            tabIndex={0}
            role="button"
            aria-label={`${mon.speciesName || t('Hueco vacío')} — ${t('posición')} ${i + 1}. ${t('Usa las flechas para reordenar.')}`}
            onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null) setOverIndex(i); }}
            onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorder(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            onKeyDown={(e) => onCardKeyDown(e, i)}
            className={`animate-fade-in-up transition-all cursor-grab active:cursor-grabbing rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-poke-pink ${
              dragIndex === i ? 'opacity-40' : ''
            } ${overIndex === i && dragIndex !== i ? 'ring-2 ring-poke-pink scale-105' : ''}`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {/* drop-pop en un elemento aparte para no reiniciar el fade-in de entrada */}
            <div className={`h-full ${dropped === i ? 'drop-pop' : ''}`}>
              <PokemonEditor
                data={data}
                pokemon={mon}
                slotIndex={i}
                slotStatus={validation.slotStatuses[i] ?? null}
                isActive={false}
                isSelected={i === activeSlot}
                onSelect={() => setActiveSlot(i)}
                onUpdate={(updates) => updatePokemon(i, updates)}
              />
            </div>
          </div>
        ))}
      </div>

      {activeSlot !== null && (
        <PokemonEditor
          key={`${activeTeam.id}-${activeSlot}`}
          data={data}
          builds={builds}
          teamPokemon={activeTeam.pokemon}
          pokemon={activeTeam.pokemon[activeSlot]}
          slotIndex={activeSlot}
          isActive
          onSelect={() => {}}
          onUpdate={(updates) => updatePokemon(activeSlot, updates)}
          onDelete={() => handleDeleteSlot(activeSlot)}
        />
      )}

      <ShowdownImport
        data={data}
        activeSlot={activeSlot}
        teamPokemon={activeTeam.pokemon}
        onImportSlot={(slotIndex, mon) => {
          const prev = activeTeam.pokemon[slotIndex];
          if (prev?.speciesId) pushUndo(`${t('Reemplazado')}: ${prev.speciesName}`, activeTeam.pokemon);
          updatePokemon(slotIndex, { ...mon, slotId: prev?.slotId ?? `slot-${slotIndex}` });
          setActiveSlot(slotIndex);
        }}
        onBeforeImport={() => {
          if (activeTeam.pokemon.some((p) => p.speciesId)) {
            pushUndo(t('Equipo reemplazado al importar'), activeTeam.pokemon);
          }
        }}
      />
      <ShowdownExport team={activeTeam} data={data} />

      {undo && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-2xl border border-poke-pink/60 bg-poke-panel/95 text-sm text-white backdrop-blur animate-fade-in-up"
        >
          <span>{undo.label}</span>
          <button
            type="button"
            onClick={applyUndo}
            className="px-2.5 py-1 rounded-lg bg-poke-pink hover:bg-poke-pink/90 text-white text-xs font-semibold transition-colors"
          >
            {t('Deshacer')}
          </button>
          <button
            type="button"
            aria-label={t('Cerrar')}
            onClick={() => setUndo(null)}
            className="text-gray-400 hover:text-white text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function computeTeamValidation(pokemon, t, lang) {
  const filled = pokemon
    .map((mon, slot) => ({ mon, slot, sp: mon.speciesId ? getSpecies(mon.speciesId) : null }))
    .filter((x) => x.mon.speciesId && x.sp);

  const issues = [];
  const slotStatuses = {};
  const addSlotNote = (slot, tone, note) => {
    const cur = slotStatuses[slot];
    if (!cur) slotStatuses[slot] = { tone, notes: [note] };
    else {
      if (tone === 'error') cur.tone = 'error';
      cur.notes.push(note);
    }
  };

  let ruleErrors = 0;

  // 1. Species Clause (nº de Pokédex repetido)
  const byNum = new Map();
  for (const x of filled) {
    const arr = byNum.get(x.sp.num) ?? [];
    arr.push(x);
    byNum.set(x.sp.num, arr);
  }
  for (const arr of byNum.values()) {
    if (arr.length > 1) {
      ruleErrors++;
      const text = `${t('Especie repetida')}: ${arr.map((a) => a.mon.speciesName).join(' / ')}`;
      issues.push({ key: `species-${arr[0].sp.num}`, tone: 'error', slot: arr[1].slot, text });
      for (const a of arr) addSlotNote(a.slot, 'error', t('Especie repetida'));
    }
  }

  // 2. Item Clause (objeto repetido)
  const byItem = new Map();
  for (const x of filled) {
    const held = x.mon.item || (x.sp.isMega ? x.sp.megaStone : '') || '';
    if (!held) continue;
    const arr = byItem.get(held) ?? [];
    arr.push(x);
    byItem.set(held, arr);
  }
  for (const [item, arr] of byItem.entries()) {
    if (arr.length > 1) {
      ruleErrors++;
      const locItem = localizeName('items', item, lang);
      const text = `${t('Objeto repetido')}: ${locItem}`;
      issues.push({ key: `item-${item}`, tone: 'error', slot: arr[1].slot, text });
      for (const a of arr) addSlotNote(a.slot, 'error', `${t('Objeto repetido')}: ${locItem}`);
    }
  }

  // 3. Pokémon incompletos (movimientos, objeto, habilidad, EVs/SP sin repartir)
  let incompleteCount = 0;
  for (const { mon, slot, sp } of filled) {
    const missing = [];
    const moveCount = mon.moves.filter(Boolean).length;
    if (moveCount < 4) missing.push(`${moveCount}/4 ${t('movs')}`);
    const held = mon.item || (sp.isMega ? sp.megaStone : '') || '';
    if (!held) missing.push(t('sin objeto'));
    if (!mon.ability) missing.push(t('sin habilidad'));
    const evMode = mon.evMode ?? 'champions';
    const inv = totalInvestment(mon.evs, evMode);
    const max = maxInvestment(evMode);
    if (inv < max) missing.push(`${inv}/${max} ${evMode === 'champions' ? 'SP' : 'EVs'}`);
    if (missing.length > 0) {
      incompleteCount++;
      issues.push({
        key: `inc-${slot}`,
        tone: 'warn',
        slot,
        text: `${mon.speciesName}: ${missing.join(', ')}`,
      });
      addSlotNote(slot, 'warn', missing.join(' · '));
    }
  }

  const formattedStatuses = {};
  for (const [slot, st] of Object.entries(slotStatuses)) {
    formattedStatuses[slot] = { tone: st.tone, tip: st.notes.join(' · ') };
  }

  return { filledCount: filled.length, ruleErrors, incompleteCount, issues, slotStatuses: formattedStatuses };
}

function ShowdownImport({ data, activeSlot, teamPokemon, onImportSlot, onBeforeImport }) {
  const { setActiveTeamPokemon } = useTeam();
  const { t, lang } = useLang();
  // null = cerrado · 'team' = importar equipo entero · 'slot' = importar 1 slot
  const [openMode, setOpenMode] = useState(null);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [tone, setTone] = useState('success');
  const [busy, setBusy] = useState(false);

  const toggleMode = (mode) => setOpenMode((cur) => (cur === mode ? null : mode));

  const resolveInput = async () => {
    let teamText = text;
    // Si pegan una URL de pokepast.es, la descargamos vía proxy (evita CORS).
    if (/^https?:\/\/(?:www\.)?pokepast\.es\/[a-zA-Z0-9]+/.test(text.trim())) {
      setBusy(true);
      try {
        const res = await fetch(`/api/pokepaste?url=${encodeURIComponent(text.trim())}`);
        const d = (await res.json());
        if (!res.ok || !d.paste) throw new Error();
        teamText = d.paste;
      } catch {
        setBusy(false);
        setTone('error');
        setFeedback(t('No se pudo cargar el Poképaste.'));
        return null;
      }
      setBusy(false);
    }
    const parsed = parseShowdownTeam(teamText, data);
    if (parsed.length === 0) {
      setTone('error');
      setFeedback(t('No se reconoció ningún Pokémon. Pega un equipo en formato Showdown.'));
      return null;
    }
    return parsed;
  };

  const doImport = async () => {
    const parsed = await resolveInput();
    if (!parsed) return;
    if (onBeforeImport) onBeforeImport();
    setActiveTeamPokemon(parsed);
    setTone('success');
    setFeedback(`${t('Importados')} ${parsed.length} ${t('Pokémon al equipo activo.')}`);
    setText('');
    setOpenMode(null);
  };

  const targetSlot = activeSlot !== null
    ? activeSlot
    : (() => {
        const emptyIdx = teamPokemon.findIndex((p) => !p.speciesId);
        return emptyIdx >= 0 ? emptyIdx : 0;
      })();

  const doImportSlot = async () => {
    const parsed = await resolveInput();
    if (!parsed) return;
    onImportSlot(targetSlot, parsed[0]);
    setTone('success');
    setFeedback(`${parsed[0].speciesName} → Slot ${targetSlot + 1}`);
    setText('');
    setOpenMode(null);
  };

  return (
    <div className="panel p-4 mt-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h3 className="font-semibold flex items-center gap-1.5">
          {t('Importar desde Showdown')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Paste a team (or a single Pokémon) in Showdown format, or a pokepast.es URL, to load it into the active team or active slot.'
              : 'Pega un equipo (o un solo Pokémon) en formato Showdown, o una URL de pokepast.es, para cargarlo en el equipo o en el slot activo.'}
          </InfoTooltip>
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn-secondary text-sm text-center ${openMode === 'team' ? 'ring-1 ring-poke-pink text-poke-pink' : ''}`}
            onClick={() => toggleMode('team')}
          >
            {openMode === 'team' ? t('Cerrar') : t('Importar Equipo')}
          </button>
          <button
            type="button"
            className={`btn-secondary text-sm text-center ${openMode === 'slot' ? 'ring-1 ring-poke-pink text-poke-pink' : ''}`}
            onClick={() => toggleMode('slot')}
          >
            {openMode === 'slot' ? t('Cerrar') : t('Importar Slot')}
          </button>
        </div>
      </div>
      {openMode && (
        <div className="mt-3 space-y-2 animate-fade-in-up">
          <textarea
            className="input-field w-full h-48 font-mono text-xs"
            placeholder={
              openMode === 'slot'
                ? 'Pega 1 Pokémon en formato Showdown...\n\nIncineroar @ Sitrus Berry\nAbility: Intimidate\nEVs: 252 HP / 4 Atk / 100 Def / 148 SpD / 4 Spe\nCareful Nature\n- Fake Out\n- Flare Blitz\n- Knock Off\n- Parting Shot'
                : 'Pega tu equipo de Showdown o una URL de pokepast.es...\n\nGarchomp @ Life Orb\nAbility: Rough Skin\nLevel: 50\nEVs: 252 Atk / 4 Def / 252 Spe\nJolly Nature\n- Earthquake\n- ...'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-3">
            {openMode === 'team' ? (
              <>
                <button type="button" className="btn-primary text-sm" onClick={doImport} disabled={!text.trim() || busy}>
                  {busy ? t('Cargando…') : t('Reemplazar equipo activo')}
                </button>
                <span className="text-xs text-gray-400">{t('Sobrescribe los 6 slots del equipo actual.')}</span>
              </>
            ) : (
              <>
                <button type="button" className="btn-primary text-sm" onClick={doImportSlot} disabled={!text.trim() || busy}>
                  {busy ? t('Cargando…') : `${t('Importar Slot')} (${targetSlot + 1})`}
                </button>
                <span className="text-xs text-gray-400">
                  {t('Carga el Pokémon solo en el slot')} {targetSlot + 1}.
                </span>
              </>
            )}
          </div>
        </div>
      )}
      <Toast message={feedback} onClose={() => setFeedback('')} tone={tone} />
    </div>
  );
}

function ShowdownExport({ team, data }) {
  const { t, lang } = useLang();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  // 'full' = todo (EVs, naturaleza…); 'open' = lista abierta (sin EVs/naturaleza).
  const [mode, setMode] = useState('full');

  const exportText = team.pokemon
    .filter((p) => p.speciesId)
    .map((p) => {
      const sp = getSpecies(p.speciesId);
      const item = p.item || (sp?.isMega ? sp.megaStone : '') || '';
      const lines = [`${p.speciesName}${item ? ` @ ${item}` : ''}`];
      if (p.ability) lines.push(`Ability: ${p.ability}`);
      if (mode === 'full' && sp?.isMega && p.preMegaAbility) {
        lines.push(`Ability (base): ${p.preMegaAbility}`);
      }
      if (p.level && p.level !== 100) lines.push(`Level: ${p.level}`);
      if (mode === 'full') {
        // El formato Champions usa Stat Points: exportamos siempre en stat points
        // (si el Pokémon estuviera en EVs tradicionales, lo convertimos).
        const evs = p.evMode === 'champions' ? p.evs : convertInvestment(p.evs, 'traditional', 'champions');
        const evLine = (['hp', 'atk', 'def', 'spa', 'spd', 'spe'])
          .filter((k) => evs[k] > 0)
          .map((k) => `${evs[k]} ${SHOWDOWN_STAT_LABELS[k]}`)
          .join(' / ');
        if (evLine) lines.push(`EVs: ${evLine}`);
        lines.push(`${p.nature} Nature`);
      }
      for (const move of p.moves.filter(Boolean)) {
        lines.push(`- ${data.moveNames?.[move] ?? move}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const copy = () => {
    navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Crea un Poképaste enviando el equipo a pokepast.es (form POST en pestaña
  // nueva: evita CORS y devuelve directamente la página del paste creado).
  const createPokepaste = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://pokepast.es/create';
    form.target = '_blank';
    const add = (name, value) => {
      const inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = name;
      inp.value = value;
      form.appendChild(inp);
    };
    add('paste', exportText);
    add('title', team.name || 'Equipo');
    add('author', '');
    add('notes', mode === 'open' ? 'Lista abierta' : '');
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const downloadPng = async () => {
    setExportingPng(true);
    try {
      await exportTeamSheetPng({ team, data, mode, lang });
    } finally {
      setExportingPng(false);
    }
  };

  if (!exportText) return null;

  return (
    <div className="panel p-4 mt-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h3 className="font-semibold flex items-center gap-1.5">
          {t('Exportar a Showdown')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Copy the team in Showdown format, or create a Poképaste (a shareable pokepast.es link). “Open list” omits EVs, IVs and items.'
              : 'Copia el equipo en formato Showdown, o crea un Poképaste (enlace de pokepast.es para compartir). «Lista abierta» omite EVs, IVs y objetos.'}
          </InfoTooltip>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'full', label: t('Completo') },
              { value: 'open', label: t('Lista abierta') },
            ]}
          />
          <button type="button" className="btn-primary text-sm min-w-[104px] text-center" onClick={copy}>
            {copied ? t('¡Copiado!') : t('Copiar')}
          </button>
          <button type="button" className="btn-secondary text-sm" onClick={createPokepaste}>
            {t('Crear Poképaste')}
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={exportingPng}
            onClick={downloadPng}
          >
            {exportingPng ? t('Generando…') : t('Descargar PNG')}
          </button>
          <button type="button" className="btn-secondary text-sm min-w-[90px] text-center" onClick={() => setOpen((o) => !o)}>
            {open ? t('Ocultar') : t('Mostrar')}
          </button>
        </div>
      </div>
      {open && (
        <pre className="text-xs text-gray-300 bg-poke-dark/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap mt-3">
          {exportText}
        </pre>
      )}
    </div>
  );
}
