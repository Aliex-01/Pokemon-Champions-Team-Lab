# Resumen del proyecto — Pokémon Champions Team Lab

Guía de referencia rápida: qué es cada carpeta y cada archivo, y para qué sirve.
Pensado para orientarte rápido sin tener que releer todo el código.

> Para cómo desplegar, secretos de Cloudflare y automatizaciones, mira el
> [README.md](README.md). Para migrar a una regulación nueva, mira
> [MIGRACION.md](MIGRACION.md). Esto es un mapa del código en sí.

---

## 1. Cómo está montada la app, en una frase

Es una **SPA de React** (Vite + TypeScript + Tailwind) que se despliega como
sitio estático en **Cloudflare Pages**. Los datos de Pokémon (roster, movimientos,
stats del meta, equipos de torneo…) **no vienen de una API en vivo**: se generan
antes del build con scripts en Node (`scripts/*.mjs`) y se guardan como JSON en
`public/data/`. Lo único dinámico en producción son las **cuentas de usuario**
(login, guardar equipos en la nube), que corren como funciones serverless en
`functions/` sobre una base de datos **D1** (SQL de Cloudflare).

```
Petición del navegador
        │
        ▼
 index.html + JS/CSS (React)  ←── generado por `vite build`
        │
        ├─→ fetch /data/*.json          (datos estáticos, precalculados)
        └─→ fetch /api/*                (Cloudflare Pages Functions + D1, solo cuentas)
```

---

## 2. Mapa de carpetas

| Carpeta | Qué hay |
|---|---|
| `src/` | Todo el código de la aplicación React (lo que ves y usas). |
| `src/views/` | Una página por cada sección del menú (Constructor, Pokédex, Speed Tier…). |
| `src/components/` | Piezas de UI reutilizables entre varias páginas (modales, buscadores, sprites…). |
| `src/lib/` | Lógica pura: cálculos, formato de datos, acceso a `localStorage`, traducciones. |
| `src/store/` | Estado global compartido (los equipos guardados). |
| `src/types/` | Los `interface`/`type` de TypeScript que describen los datos (un Pokémon, un equipo…). |
| `functions/` | Backend serverless (Cloudflare Pages Functions) para las cuentas de usuario. |
| `scripts/` | Scripts de Node que se ejecutan **antes** del build para generar los `.json` de datos. |
| `public/` | Archivos servidos tal cual: los `.json` generados, iconos, manifest de PWA. |

---

## 3. `src/views/` — una página por sección

Cada archivo es la pantalla completa de una entrada del menú.

| Archivo | Página | Qué hace |
|---|---|---|
| `TeamBuilder.tsx` | **Equipo** (`/`) | Editor del equipo activo: elegir Pokémon, especie, habilidad, objeto, naturaleza, movimientos y EVs (en *stat points* o EVs clásicos). Arrastrar y soltar para reordenar. Importar/exportar en formato Showdown y **Poképaste** (crear/importar). |
| `PokedexView.tsx` | **Pokédex** (`/dex`) | Lista filtrable de todos los Pokémon legales del formato: por nombre, tipo, habilidad, movimientos y mínimos por estadística. Clic en una card abre un modal con el detalle (stats, habilidades, megaevoluciones). |
| `SpeedTier.tsx` | **Speed Tier** (`/speed`) | Tabla de velocidades de todo el formato con tu equipo resaltado. Toggles para Tailwind, Trick Room, clima, Liviano, Choice Scarf. Las filas se reordenan con animación (FLIP) al cambiar un toggle. |
| `BuildsView.tsx` | **Builds Meta** (`/builds`) | Sets más usados (según Smogon) para cada Pokémon de tu equipo: habilidad, objeto, naturaleza, EVs, movimientos, compañeros. Aplicable con un clic. |
| `CoverageView.tsx` | **Cobertura** (`/coverage`) | Debilidades defensivas de tu equipo (incluye habilidades) y qué tipos golpeas supereficaz ofensivamente. |
| `DamageCalcView.tsx` | **Calculadora** (`/damage`) | Calculadora de daño Gen 9 dobles (`@smogon/calc`): tu Pokémon contra cualquiera del formato, con clima, terreno, pantallas, gravedad, crítico, aliados debilitados, etc. |
| `TeamAnalysisView.tsx` | **Análisis** (`/analysis`) | Dashboard del equipo: puntuación por categorías, arquetipo, roles de cada Pokémon, sinergias, amenazas del meta que tu equipo no cubre. |
| `OptimizerView.tsx` | **Optimizador** (`/optimizer`) | Calcula los EVs mínimos para: alcanzar una velocidad objetivo, sobrevivir un ataque concreto (con habilidad del rival y golpe único/de área), u OHKO/2HKO a un objetivo. |
| `ReplaysView.tsx` | **Repeticiones** (`/replays`) | Importa repeticiones de Pokémon Showdown (por URL o automáticamente por tu usuario) y calcula estadísticas: win rate, leads, matchups, uso de Pokémon y de movimientos. |
| `TournamentTeamsView.tsx` | **Equipos de torneo** (`/tournament`) | Equipos reales usados en torneos (datos de VGCPastes), filtrables por jugador/evento/Pokémon/regulación. Clic abre el detalle del equipo (con movimientos, EVs si están disponibles, código de alquiler). Botón para importarlo al equipo activo si está vacío. |

---

## 4. `src/components/` — piezas reutilizables

| Archivo | Qué es |
|---|---|
| `Layout.tsx` | El armazón de toda la app: menú lateral, cabecera (selector de equipo, idioma), footer, y el `<Outlet>` donde se monta la vista activa según la ruta. |
| `PokemonEditor.tsx` | El editor de un Pokémon dentro del equipo (usado por `TeamBuilder`): especie, habilidad, objeto, movimientos, EVs. |
| `PokemonSprite.tsx` | `<PokemonSprite>` (imagen de un Pokémon, con fallback entre varias fuentes y opción de skeleton de carga) e `<ItemSprite>` (icono de objeto recortado de una hoja de sprites). |
| `Combobox.tsx` | Selector genérico con búsqueda por texto (base reutilizada por `MoveSearch`, habilidades, etc.). |
| `MoveSearch.tsx` | Selector de movimiento (envuelve `Combobox`). |
| `ItemSearch.tsx` | Selector de objeto, con icono, búsqueda por texto. |
| `Dropdown.tsx` | Desplegable con la estética oscura de la app (sustituye al `<select>` nativo). |
| `SegmentedControl.tsx` | Control de pestañas/opciones con una "pastilla" que se desliza a la opción activa (usado en el filtro de Mega, las pestañas del Optimizador…). |
| `Modal.tsx` | Ventana modal genérica (fondo oscurecido, cierre con Escape o clic fuera). La usan el detalle de la Pokédex, los equipos de torneo, crear/renombrar/eliminar equipo, etc. |
| `Toast.tsx` | Aviso flotante que aparece abajo a la derecha y se autooculta. |
| `InfoTooltip.tsx` | Icono (i) que muestra un texto explicativo al hacer hover o al recibir foco por teclado (accesible, tema oscuro, respeta `prefers-reduced-motion`). |
| `AccountMenu.tsx` | Menú de cuenta: login, registro, cerrar sesión, subir/bajar equipos y repeticiones a la nube. |
| `Logo.tsx` | El logo SVG de la app (una Poké Ball estilizada). |

---

## 5. `src/lib/` — la lógica, sin interfaz

Aquí vive el "cerebro" de la app: cálculos y utilidades, sin JSX.

| Archivo | Qué hace |
|---|---|
| `championsData.ts` | Carga `public/data/champions.json` y expone getters: `getSpecies`, `getSpeciesByName`, `searchSpecies`, `getLearnset`, `getSpriteUrls`, `localizeName` (traduce nombres EN→ES), megapiedras, etc. Es el punto de acceso a **todos los datos de Pokémon**. |
| `stats.ts` | Cálculo de estadísticas: fórmula de stats Gen 9, conversión entre *stat points* (Champions) y EVs tradicionales, formateo de EVs, efecto de naturaleza. |
| `damageCalc.ts` | Envoltorio sobre `@smogon/calc` para calcular daño: define `CalcMon`/`FieldState`/`SideState` y la función `calcMove`, más las mecánicas propias de Champions que la librería no cubre. |
| `typeChart.ts` | Efectividad de tipos: `getTypeEffectiveness`, análisis de cobertura defensiva y ofensiva del equipo. |
| `i18n.tsx` | Contexto de idioma (`LanguageProvider`/`useLang`): guarda ES/EN en `localStorage` y expone `t()`, que además pone el texto en *Title Case* (mayúscula inicial salvo preposiciones). |
| `translations.ts` | El diccionario ES→EN. La clave es el texto español tal cual aparece en el código; si falta una clave, se muestra en español. |
| `seo.ts` | `useRouteSeo`: actualiza `<title>`, meta description, canonical y Open Graph según la ruta activa y el idioma (para que cada página tenga sus propios metadatos en una SPA). |
| `auth.tsx` | Contexto de autenticación (`AuthProvider`/`useAuth`): login, registro, logout, y subir/bajar equipos y repeticiones a la nube. Habla con `/api/auth/*`, `/api/teams`, `/api/replays`. |
| `devPages.ts` | `canSeeDevPages`: helper minúsculo que decide si una página "oculta" se muestra (en local o si el usuario es admin). |
| `showdownImport.ts` | `parseShowdownTeam`: convierte un pegado de texto en formato Showdown a `TeamPokemon[]`. |
| `metaBuilds.ts` | Carga `public/data/builds.json` (sets más usados por Pokémon, generados desde Smogon). |
| `smogonStats.ts` | Descarga en vivo estadísticas de uso de Smogon (usado en algún cálculo puntual, no en la carga principal de datos). |
| `replay.ts` | Parseo de una repetición de Showdown (log de batalla) a un `MatchRecord` resumido: equipos, leads, movimientos usados, ganador, mega/tera, etc. |
| `replayStats.ts` | A partir de varios `MatchRecord`, calcula agregados: win rate por equipo, uso de Pokémon, matchups contra rivales, leads más usados, uso de movimientos. |
| `useFlip.ts` | Hook de animación **FLIP**: cuando una lista cambia de orden, los elementos que permanecen se deslizan a su nueva posición en vez de saltar (usado en Pokédex, Speed Tier, Equipos de torneo). |

---

## 6. `src/store/` y `src/types/`

| Archivo | Qué hace |
|---|---|
| `store/teamStore.tsx` | Contexto de equipos (`TeamProvider`/`useTeam`): crear, renombrar, eliminar equipos, cambiar el equipo activo, editar un Pokémon de un slot. Todo persiste en `localStorage`. |
| `types/pokemon.ts` | Todas las interfaces de datos: `TeamPokemon`, `SavedTeam`, `SpeciesData`, `ChampionsData`, `MetaBuildsData`, `EvSpread`, etc. Es el "diccionario de tipos" que usa el resto del proyecto. |

---

## 7. `src/App.tsx` y `src/main.tsx` — el arranque

- **`main.tsx`**: punto de entrada real; monta `<App>` en el `#root` del `index.html`.
- **`App.tsx`**: define las rutas (`react-router-dom`) — qué vista se muestra en
  cada URL —, envuelve todo en los providers (`LanguageProvider`, `AuthProvider`,
  `TeamProvider`), carga `champions.json` al arrancar y muestra un skeleton de
  carga mientras tanto.

---

## 8. `functions/` — backend de cuentas (Cloudflare Pages Functions)

Solo corren en producción (o con `wrangler pages dev`), nunca con `vite dev`.
Cada archivo es un endpoint; el nombre de archivo/carpeta define la URL.

| Archivo | Endpoint | Qué hace |
|---|---|---|
| `_lib/auth.ts` | *(no es endpoint)* | Utilidades compartidas: hash de contraseña (PBKDF2), cookies de sesión, rate limiting de login, y `isAdminEmail` (para las páginas ocultas). |
| `api/auth/register.ts` | `POST /api/auth/register` | Crea una cuenta nueva. |
| `api/auth/login.ts` | `POST /api/auth/login` | Inicia sesión. |
| `api/auth/logout.ts` | `POST /api/auth/logout` | Cierra sesión. |
| `api/auth/me.ts` | `GET /api/auth/me` | Devuelve el usuario de la sesión actual (o `null`). |
| `api/teams.ts` | `GET`/`PUT /api/teams` | Lee o reemplaza los equipos guardados en la nube del usuario. |
| `api/replays.ts` | `GET`/`PUT /api/replays` | Lee o guarda el historial de repeticiones del usuario. |
| `api/pokepaste.ts` | `GET /api/pokepaste?url=…` | Proxy que descarga un Poképaste (evita el bloqueo de CORS al importar por URL). |

La base de datos es **D1** (SQL de Cloudflare), con tablas `users`, `sessions`,
`teams`, `user_replays`, `login_attempts` (el binding se llama `DB`).

---

## 9. `scripts/` — generación de datos (se ejecutan antes del build)

Todo lo que ves en la app (roster, movimientos, equipos de torneo…) sale de
aquí, no de una API en tiempo real.

| Archivo | Genera | Qué hace |
|---|---|---|
| `generate-data.mjs` | `public/data/champions.json`, `public/data/builds.json` | El más importante. Usa `@pkmn/dex` + `@pkmn/mods/champions` para sacar el roster legal (filtrado por `allowed-nums.txt`), learnsets, movimientos, habilidades, objetos; añade nombres en español (PokeAPI) y descarga estadísticas de uso de Smogon. |
| `generate-tournament-teams.mjs` | `public/data/tournament-teams.json` | Descarga el Google Sheet público de VGCPastes (una pestaña por regulación) y lo convierte en la lista de equipos de torneo. |
| `generate-og.mjs` | `public/og-image.png`, iconos de la PWA | Convierte SVGs a PNG (con `sharp`) para la tarjeta de Open Graph y los iconos de la PWA. |
| `translateDesc.mjs` | *(usado por `generate-data.mjs`)* | Traduce las descripciones de efecto de los movimientos al español (diccionario + traductor por reglas para los que no están listados). |
| `allowed-nums.txt` | *(dato, no script)* | Lista de números de Pokédex legales en la regulación actual. |
| `tiers.json` | *(dato, no script)* | Tier ("nota") de cada Pokémon, por número de Pokédex. |

---

## 10. `public/` — lo que se sirve tal cual

- `data/champions.json`, `data/builds.json`, `data/tournament-teams.json` — los
  datos generados por los scripts de arriba; la app los pide con `fetch` al cargar.
- Iconos, `favicon.svg`, manifest de la PWA, `_headers` (cabeceras HTTP, p. ej.
  que `/data/*` no se cachee de más), `_redirects` (enrutado SPA).

---

## 11. Otros archivos de raíz

| Archivo | Qué es |
|---|---|
| `index.html` | HTML base: fuente (Inter), metadatos SEO/Open Graph por defecto, monta `src/main.tsx`. |
| `vite.config.ts` | Configuración de Vite: plugin de React, Tailwind, PWA (`vite-plugin-pwa`, con las reglas de caché de cada tipo de recurso), separación de chunks. |
| `src/index.css` | Tema visual: colores de la marca (`--color-poke-*`), clases de tipo (`.type-fire`, etc.), todas las animaciones (`@keyframes`) y utilidades compartidas (`.panel`, `.btn-primary`…). |
| `package.json` | Dependencias y scripts (`npm run dev`, `build`, `generate-data`…). |
| `.github/workflows/refresh-data.yml` | Action de GitHub que corre a diario y dispara el redeploy (para que los datos se refresquen solos). |
| `README.md` | Documentación de referencia: cómo desplegar, dónde están los secretos, fuentes de datos. |
| `MIGRACION.md` | Checklist paso a paso para cuando salga una regulación nueva (Reg M-C…). |
