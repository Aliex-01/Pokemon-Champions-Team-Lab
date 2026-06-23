import { useState } from 'react';
import { useTeam } from '../store/teamStore';
import { PokemonEditor } from '../components/PokemonEditor';
import { Toast } from '../components/Toast';
import { useLang } from '../lib/i18n';
import { getSpecies } from '../lib/championsData';
import { toTraditionalEvs } from '../lib/stats';
import { parseShowdownTeam } from '../lib/showdownImport';
import type { ChampionsData, EvSpread, SavedTeam } from '../types/pokemon';

const SHOWDOWN_STAT_LABELS: Record<keyof EvSpread, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

interface TeamBuilderProps {
  data: ChampionsData;
}

export function TeamBuilder({ data }: TeamBuilderProps) {
  const { activeTeam, updatePokemon, setActiveTeamPokemon } = useTeam();
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dropped, setDropped] = useState<number | null>(null);
  // Al cambiar de equipo, deseleccionar (sin hueco activo).
  const [prevTeamId, setPrevTeamId] = useState(activeTeam?.id);

  const { t } = useLang();

  if (!activeTeam) return null;

  if (prevTeamId !== activeTeam.id) {
    setPrevTeamId(activeTeam.id);
    setActiveSlot(null);
  }

  // Reordena el equipo moviendo el Pokémon de `from` a la posición `to`.
  const reorder = (from: number, to: number) => {
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
  const onCardKeyDown = (e: React.KeyboardEvent, i: number) => {
    // Solo si el foco está en la tarjeta misma, no en inputs/botones internos.
    if (e.target !== e.currentTarget) return;
    const last = activeTeam.pokemon.length - 1;
    let to: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = Math.max(0, i - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = Math.min(last, i + 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = last;
    if (to !== null) { e.preventDefault(); reorder(i, to); }
  };

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">{t('Constructor de Equipo')}</h2>
      </div>

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
          pokemon={activeTeam.pokemon[activeSlot]}
          slotIndex={activeSlot}
          isActive
          onSelect={() => {}}
          onUpdate={(updates) => updatePokemon(activeSlot, updates)}
        />
      )}

      <ShowdownImport data={data} />
      <ShowdownExport team={activeTeam} data={data} />
    </div>
  );
}

function ShowdownImport({ data }: { data: ChampionsData }) {
  const { setActiveTeamPokemon } = useTeam();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [tone, setTone] = useState<'success' | 'error'>('success');

  const doImport = () => {
    const parsed = parseShowdownTeam(text, data);
    if (parsed.length === 0) {
      setTone('error');
      setFeedback(t('No se reconoció ningún Pokémon. Pega un equipo en formato Showdown.'));
      return;
    }
    setActiveTeamPokemon(parsed);
    setTone('success');
    setFeedback(`${t('Importados')} ${parsed.length} ${t('Pokémon al equipo activo.')}`);
    setText('');
    setOpen(false);
  };

  return (
    <div className="panel p-4 mt-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t('Importar desde Showdown')}</h3>
        <button type="button" className="btn-secondary text-sm min-w-[96px] text-center" onClick={() => setOpen((o) => !o)}>
          {open ? t('Cerrar') : t('Importar')}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            className="input-field w-full h-48 font-mono text-xs"
            placeholder={'Pega aquí tu equipo de Showdown...\n\nGarchomp @ Life Orb\nAbility: Rough Skin\nLevel: 50\nEVs: 252 Atk / 4 Def / 252 Spe\nJolly Nature\n- Earthquake\n- ...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary text-sm" onClick={doImport} disabled={!text.trim()}>
              {t('Reemplazar equipo activo')}
            </button>
            <span className="text-xs text-gray-400">{t('Sobrescribe los 6 slots del equipo actual.')}</span>
          </div>
        </div>
      )}
      <Toast message={feedback} onClose={() => setFeedback('')} tone={tone} />
    </div>
  );
}

function ShowdownExport({ team, data }: { team: SavedTeam; data: ChampionsData }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const exportText = team.pokemon
    .filter((p) => p.speciesId)
    .map((p) => {
      const sp = getSpecies(p.speciesId);
      const item = p.item || (sp?.isMega ? sp.megaStone : '') || '';
      const lines = [`${p.speciesName}${item ? ` @ ${item}` : ''}`];
      if (p.ability) lines.push(`Ability: ${p.ability}`);
      if (sp?.isMega && p.preMegaAbility) {
        lines.push(`Ability (base): ${p.preMegaAbility}`);
      }
      if (p.level && p.level !== 100) lines.push(`Level: ${p.level}`);
      // En modo Champions los EVs son stat points; Showdown espera EVs tradicionales.
      const evs = p.evMode === 'champions' ? toTraditionalEvs(p.evs) : p.evs;
      const evLine = (['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const)
        .filter((k) => evs[k] > 0)
        .map((k) => `${evs[k]} ${SHOWDOWN_STAT_LABELS[k]}`)
        .join(' / ');
      if (evLine) lines.push(`EVs: ${evLine}`);
      lines.push(`${p.nature} Nature`);
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

  if (!exportText) return null;

  return (
    <div className="panel p-4 mt-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{t('Exportar a Showdown')}</h3>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary text-sm min-w-[104px] text-center" onClick={copy}>
            {copied ? t('¡Copiado!') : t('Copiar')}
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
