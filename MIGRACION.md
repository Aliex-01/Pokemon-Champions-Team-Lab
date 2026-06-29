# Migración a una nueva regulación (Reg M-C, M-D…)

Checklist para cuando salga una regulación nueva. Pensado tanto para hacerlo a mano
como para que una sesión de Claude lo siga rápido. La regeneración de datos y el
deploy son automáticos (Action diaria); lo de abajo es lo que **no** cambia solo.

> Regla rápida: si los Pokémon/objetos **ya existían** y solo cambia su legalidad,
> basta con los pasos 1, 3 y 4. Si la reg trae **contenido nuevo de un DLC/juego**,
> hace falta además el paso 2 (subir `@pkmn`).
>
> Los ejemplos usan **Reg M-C** y **Baxcalibur (nº 998)** como caso.

## 1. Roster legal y tiers
La app filtra por nº de Pokédex permitido.
- `scripts/allowed-nums.txt` → lista de números legales de la nueva reg (fuente:
  championslab.xyz u oficial). Un nº incluye sus megas y formas regionales.
- `scripts/tiers.json` → tier ("nota") por nº de Pokédex base.

**Ejemplo** — añadir Baxcalibur:
```diff
  # scripts/allowed-nums.txt
  997
+ 998
  999
```
```diff
  // scripts/tiers.json
- { "997": "B", "999": "A" }
+ { "997": "B", "998": "A", "999": "A" }
```
(Sin tier sale en Pokédex/Constructor/Cobertura/Calculadora igual, pero no como
referencia del Speed Tier.)

## 2. Pokémon / objetos nuevos (solo si hay DLC/juego nuevo)
Los datos salen de `@pkmn`:
- `scripts/generate-data.mjs:4-5` usa `@pkmn/dex` y `@pkmn/mods/champions`.
- Actualiza dependencias: `npm update @pkmn/dex @pkmn/mods @pkmn/sets` (o la versión
  que añada el contenido nuevo). Sin esto, los Pokémon/objetos nuevos **no existen**
  en los datos. Los objetos no se filtran por roster (aparecen solos tras el bump).

**Ejemplo** — Baxcalibur ya existe en Gen 9, así que **este paso NO aplica**. Solo
haría falta para algo nuevo de un DLC futuro:
```bash
npm update @pkmn/dex @pkmn/mods @pkmn/sets
```
```diff
  // package.json
-     "@pkmn/dex": "^0.9.30",
+     "@pkmn/dex": "^0.9.40",
```

## 3. Formato y stats del meta (Builds)
En `scripts/generate-data.mjs`:
- Línea ~303: `format: 'gen9championsvgc2026regmb'` → cambiar al slug de la nueva reg.
- `STATS_FORMATS` (línea ~323): añadir el/los slug(s) de Smogon de la nueva reg
  **al principio** del array (se prueban en orden). Patrón:
  `gen9championsvgc<año>reg<mc>` y su variante `...bo3`.
  Mientras Smogon no publique la nueva, caerá a la anterior automáticamente
  (BuildsView ya avisa de esto).

**Ejemplo**:
```diff
  // scripts/generate-data.mjs (~303)
-   format: 'gen9championsvgc2026regmb',
+   format: 'gen9championsvgc2026regmc',
```
```diff
  // scripts/generate-data.mjs — STATS_FORMATS (~323)
  const STATS_FORMATS = [
+   'gen9championsvgc2026regmc',
+   'gen9championsvgc2026regmcbo3',
    'gen9championsvgc2026regmb',
    'gen9championsvgc2026regmbbo3',
    'gen9championsvgc2026regmabo3',
    'gen9championsvgc2026regma',
  ];
```

## 4. Etiquetas "Reg M-B" → nueva reg
Buscar y reemplazar el texto de la reg en:
- `index.html` (título, meta description, OG, JSON-LD)
- `src/lib/seo.ts`
- `src/lib/translations.ts`
- `src/components/Layout.tsx`
- `src/views/BuildsView.tsx` (aviso "Reg M-B aún no publicada…")
- `src/lib/smogonStats.ts`
- `scripts/og-image.svg` (imagen de previsualización)
- `scripts/generate-data.mjs` (comentarios)

**Ejemplo**:
```diff
  // src/lib/seo.ts (y resto de archivos)
- ... equipos VGC Champions (Reg M-B, dobles) ...
+ ... equipos VGC Champions (Reg M-C, dobles) ...
```

## 5. Equipos de torneo
- `scripts/generate-tournament-teams.mjs` → array `SHEETS`: añadir la pestaña nueva
  del Google Sheet de VGCPastes: `{ gid: '<GID_DE_M-C>', reg: 'M-C' }`.
- El gid se saca del `htmlview` del sheet (buscar el nombre "Champions M-C").
- Los IDs de equipo por reg cambian de prefijo (M-A=`PC…`, M-B=`MB…`). El filtro
  está en `sheetTeams`: `/^(?:PC|MB)\d+/i` → añadir el prefijo nuevo (p. ej. `MC`).
- Si hay filtro de reg en la UI, `src/views/TournamentTeamsView.tsx` lo deriva de
  los datos (`regs`), así que aparece solo.

**Ejemplo**:
```diff
  // scripts/generate-tournament-teams.mjs — SHEETS
  const SHEETS = [
    { gid: '791705272', reg: 'M-A' },
    { gid: '1458357160', reg: 'M-B' },
+   { gid: '<GID_DE_M-C>', reg: 'M-C' },
  ];
```
```diff
  // scripts/generate-tournament-teams.mjs — sheetTeams (filtro de IDs)
-     if (!/^(?:PC|MB)\d+/i.test(id)) continue;
+     if (!/^(?:PC|MB|MC)\d+/i.test(id)) continue;
```
Cómo encontrar el gid (lo mismo que se hizo para M-B):
```bash
node -e "fetch('https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/htmlview').then(r=>r.text()).then(h=>{const re=/name: \"([^\"]+)\"[^}]*?gid: \"(\d+)\"/g;let m;while((m=re.exec(h)))console.log(m[2],'=>',m[1]);})"
```

## 6. Verificar y desplegar
```bash
npm run generate-data            # roster, moves, items, builds
npm run generate-tournament-teams
npm run build                    # incluye los dos generate + tsc + vite
```
Revisar que `public/data/champions.json` tiene los Pokémon nuevos y que
`tournament-teams.json` trae la reg nueva. Luego push a `main` (deploy automático).

**Ejemplo** — comprobar que Baxcalibur entró:
```bash
node -e "const d=require('./public/data/champions.json'); console.log(d.species.some(s=>s.id==='baxcalibur'));"
# -> true
```

## Qué NO hay que tocar
- La Action (`.github/workflows/refresh-data.yml`) ya corre a diario y dispara el
  rebuild → regenera todo y redepliega solo.
- Sprites de Pokémon/objetos: se resuelven en runtime desde Showdown/PokeAPI.
- Las vistas (Constructor, Pokédex, Speed Tier, Cobertura, Calculadora): todas leen
  de `champions.json`, así que un Pokémon del roster aparece en todas sin tocar nada.
