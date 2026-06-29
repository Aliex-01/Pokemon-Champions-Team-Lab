# Pokémon Champions Team Lab

Aplicación web personal para construir y analizar equipos de **Pokémon Champions** (VGC 2026 Reg M-B, dobles). Hecha con **React 19 + TypeScript + Vite + Tailwind CSS v4**, con backend serverless en **Cloudflare Pages Functions + D1** para las cuentas.

## Secciones

- **Constructor de Equipo** — Editor estilo Pokémon Showdown: especie (con **filtro por tipo**), habilidad, objeto, naturaleza, movimientos (con **filtros de tipo y categoría** y descripción de efecto) y EVs. Stats calculadas en vivo, coloreadas según naturaleza. Soporta **stat points (Champions)** y **EVs clásicos**. **Arrastrar y soltar** para reordenar el equipo. Importar/exportar en formato Showdown, y **Poképaste** (crear paste en pokepast.es e importar desde URL) con modo **Completo** o **Lista abierta** (sin EVs/naturaleza).
- **Speed Tier** — Velocidades del formato agrupadas, con tu equipo resaltado. Modificadores: **Tailwind, Trick Room, climas, Liviano (Unburden)**. Filas extra automáticas para habilidades que aumentan la velocidad (Clorofila, Nado Rápido…) y para **Choice Scarf** en Pokémon tier S/A con uso >20% (toggles para mostrar/ocultar). Resumen "supera / depende / pierde" por rango de velocidad y salto a la fila desde el resumen.
- **Builds Meta** — Sets más usados (habilidad, objeto, naturaleza, spread, movimientos, compañeros) desde Smogon, aplicables al equipo con un clic.
- **Cobertura de Tipos** — Debilidades defensivas (incluye habilidades) y cobertura ofensiva supereficaz; vista defensiva/ofensiva.
- **Calculadora de Daño** — `@smogon/calc` Gen 9 Dobles. Tu Pokémon vs cualquiera del formato, ambas direcciones a la vez, con todas las condiciones de campo (clima, terreno, pantallas, gravedad, zonas mágica/extraña, crítico, **aliados KO** para General Supremo / Última Baza). Barra de HP, stats finales (con Choice Scarf y habilidades de velocidad reflejados) y mecánicas propias de Champions implementadas a mano.
- **Análisis del Equipo** *(beta)* — Dashboard con avisos de huecos, cobertura de tipos resumida, roles por Pokémon y utilidad enfocada a dobles (Fake Out, redirección, protección de área, Intimidación, apoyo a aliado, Tailwind/Trick Room, ralentizar, clima, terreno).
- **Pokédex del formato** — Lista filtrable de los Pokémon legales por movimientos que aprenden, tipos, habilidad y **mínimos por estadística**. Detalle al hacer clic (stats con barras, habilidades, megaevoluciones). Orden por número, nombre, stat o BST.
- **Optimizador de EVs** *(beta)* — EVs mínimos para alcanzar un objetivo de velocidad, supervivencia (sobrevivir un golpe) u OHKO/2HKO.
- **Repeticiones** *(beta)* — Importa repeticiones de Pokémon Showdown (por URL o automáticamente por usuario) y analiza resultados: win rate, leads, matchups, uso de Pokémon y movimientos.
- **Equipos de torneo** *(oculto)* — Equipos reales de torneos (datos de VGCPastes) filtrables por jugador/evento/Pokémon, importables al equipo activo vacío. Solo visible en local o para un usuario administrador (ver más abajo).

## Idiomas

- Botón **ES / EN** en la cabecera (persistente).
- Los nombres de movimientos, habilidades, objetos y naturalezas usan los **nombres oficiales en español (España)** de PokeAPI; los movimientos de Gen 9 que PokeAPI aún no traduce tienen su nombre oficial añadido a mano. Las descripciones de efecto también se traducen.

## Varios equipos

Crear, renombrar, eliminar y cambiar entre equipos. Todo se guarda en `localStorage` (por navegador y dominio).

## Cuentas en la nube

Registro/login opcional para guardar equipos y repeticiones en la nube y tenerlos en cualquier dispositivo. Backend en **Cloudflare Pages Functions** (`functions/api/*`) con base de datos **D1** (binding `DB`): contraseñas con PBKDF2-SHA256 (salt + pepper `SESSION_SECRET`), sesiones por cookie `HttpOnly`. Las Functions **solo corren en producción** (o con `npx wrangler pages dev dist`), no con `vite dev`.

## Páginas ocultas (dev/admin)

Algunas páginas (p. ej. *Equipos de torneo*) están ocultas en producción. Se controlan con `dev: true` en `NAV_ITEMS` ([src/components/Layout.tsx](src/components/Layout.tsx)) y se muestran solo si:
- estás en `localhost` (`import.meta.env.DEV`), o
- tu usuario es **admin**: su correo está en la variable de entorno `ADMIN_EMAILS` de Cloudflare (el backend devuelve `isAdmin`).

## Fuentes de datos

| Fuente | Uso |
|--------|-----|
| [`@pkmn/dex` + `@pkmn/mods/champions`](https://github.com/pkmn) | Roster legal, learnsets, stats, movimientos, habilidades, objetos |
| [PokéAPI](https://pokeapi.co) | Nombres oficiales en español (CSV) y sprites de fallback |
| [Pokémon Showdown](https://play.pokemonshowdown.com) | Sprites e iconos de objeto |
| [Smogon Stats](https://www.smogon.com/stats/) | % de uso y builds meta (chaos JSON) |
| [`@smogon/calc`](https://github.com/smogon/damage-calc) | Motor de daño |
| [ChampionsLab](https://www.championslab.xyz) | Roster legal y tiers (`scripts/allowed-nums.txt`, `tiers.json`) |
| [VGCPastes](https://twitter.com/VGCPastes) | Equipos de torneo (Google Sheet → `tournament-teams.json`) |
| [Poképaste](https://pokepast.es) | Crear/importar pastes de equipo |

Los datos se descargan en tiempo de generación y se guardan en `public/data/` (`champions.json`, `builds.json`, `tournament-teams.json`); la app no llama a esas APIs en tiempo de ejecución (salvo el proxy `functions/api/pokepaste` para importar un Poképaste por URL).

## Requisitos

- Node.js 20+

## Uso

```bash
npm install
npm run dev             # http://localhost:5173
npm run build           # descarga datos (Showdown/Smogon/PokeAPI) + comprueba tipos + build de producción (dist/)
```

> `npm run build` ya regenera `public/data/` antes de compilar (`generate-data` + `generate-tournament-teams` + `generate-og`), así que es lo único necesario para refrescar los datos (incluido cuando Smogon publique Reg M-B). Cada `generate-*` puede ejecutarse suelto.

## Despliegue y operación

Desplegado en **Cloudflare Pages** (build command `npm run build`, output `dist/`, rama de producción `main`). Las Functions de `functions/` se despliegan automáticamente con el sitio.

- **Deploy automático**: cada push a `main` redepliega.
- **Refresco diario de datos**: la GitHub Action [`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml) corre a diario (`0 9 * * *`) y llama al **Deploy Hook** de Cloudflare → rebuild → regenera datos (incluidos equipos de torneo) y redepliega.

### Configuración (no está en el repo)

| Dónde | Clave | Para qué |
|-------|-------|----------|
| GitHub ▸ Secrets ▸ Actions | `CLOUDFLARE_DEPLOY_HOOK` | URL del Deploy Hook que dispara la Action |
| Cloudflare Pages ▸ Variables | `SESSION_SECRET` | Pepper para hash de contraseñas/sesiones |
| Cloudflare Pages ▸ Variables | `ADMIN_EMAILS` | Correos admin (ven páginas ocultas) |
| Cloudflare Pages ▸ Bindings | `DB` (D1) | Base de datos de cuentas/equipos/repeticiones |

> Si se pierden `SESSION_SECRET` o la base D1, las cuentas dejan de funcionar.

## Notas

- **Reg M-B** aún no está en Smogon: la generación prueba `gen9championsvgc2026regmb` y cae a Reg M-A. En cuanto Smogon la publique, basta con `npm run build` para actualizar datos y quitar el aviso automáticamente.
- Tras actualizaciones del mod Champions o para refrescar el meta, vuelve a ejecutar `npm run build` y redespliega.
- Cuando salga **Reg M-C** (o posteriores): seguir el checklist con ejemplos en [`MIGRACION.md`](MIGRACION.md) (roster legal, `@pkmn`, slug de Smogon, etiquetas, pestaña del sheet de torneos).
- Las habilidades nuevas de Z-A (Fire Mane, Dragonize, Eelevate, Mega Sol, Piercing Drill…) no las implementa `@smogon/calc`, así que están codificadas a mano en `src/lib/damageCalc.ts`.
