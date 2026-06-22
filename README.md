# Pokémon Champions Team Lab

Aplicación web personal para construir y analizar equipos de **Pokémon Champions** (VGC 2026 Reg M-B, dobles). Hecha con **React 19 + TypeScript + Vite + Tailwind CSS v4**.

## Secciones

- **Constructor de Equipo** — Editor estilo Pokémon Showdown: especie (con **filtro por tipo**), habilidad, objeto, naturaleza, movimientos (con **filtros de tipo y categoría** y descripción de efecto) y EVs. Stats calculadas en vivo, coloreadas según naturaleza. Soporta **stat points (Champions)** y **EVs clásicos**. **Arrastrar y soltar** para reordenar el equipo. Importar/exportar en formato Showdown.
- **Speed Tier** — Velocidades del formato agrupadas, con tu equipo resaltado. Modificadores: **Tailwind, Trick Room, climas, Liviano (Unburden)**. Filas extra automáticas para habilidades que aumentan la velocidad (Clorofila, Nado Rápido…) y para **Choice Scarf** en Pokémon tier S/A con uso >20% (toggles para mostrar/ocultar). Resumen "supera / depende / pierde" por rango de velocidad y salto a la fila desde el resumen.
- **Builds Meta** — Sets más usados (habilidad, objeto, naturaleza, spread, movimientos, compañeros) desde Smogon, aplicables al equipo con un clic.
- **Cobertura de Tipos** — Debilidades defensivas (incluye habilidades) y cobertura ofensiva supereficaz; vista defensiva/ofensiva.
- **Calculadora de Daño** — `@smogon/calc` Gen 9 Dobles. Tu Pokémon vs cualquiera del formato, ambas direcciones a la vez, con todas las condiciones de campo (clima, terreno, pantallas, gravedad, zonas mágica/extraña, crítico, **aliados KO** para General Supremo / Última Baza). Barra de HP, stats finales (con Choice Scarf y habilidades de velocidad reflejados) y mecánicas propias de Champions implementadas a mano.
- **Análisis del Equipo** *(beta)* — Dashboard con avisos de huecos, cobertura de tipos resumida, roles por Pokémon y utilidad enfocada a dobles (Fake Out, redirección, protección de área, Intimidación, apoyo a aliado, Tailwind/Trick Room, ralentizar, clima, terreno).

## Idiomas

- Botón **ES / EN** en la cabecera (persistente).
- Los nombres de movimientos, habilidades, objetos y naturalezas usan los **nombres oficiales en español (España)** de PokeAPI; los movimientos de Gen 9 que PokeAPI aún no traduce tienen su nombre oficial añadido a mano. Las descripciones de efecto también se traducen.

## Varios equipos

Crear, renombrar, eliminar y cambiar entre equipos. Todo se guarda en `localStorage` (por navegador y dominio).

## Fuentes de datos

| Fuente | Uso |
|--------|-----|
| [`@pkmn/dex` + `@pkmn/mods/champions`](https://github.com/pkmn) | Roster legal, learnsets, stats, movimientos, habilidades, objetos |
| [PokéAPI](https://pokeapi.co) | Nombres oficiales en español (CSV) y sprites de fallback |
| [Pokémon Showdown](https://play.pokemonshowdown.com) | Sprites e iconos de objeto |
| [Smogon Stats](https://www.smogon.com/stats/) | % de uso y builds meta (chaos JSON) |
| [`@smogon/calc`](https://github.com/smogon/damage-calc) | Motor de daño |

Los datos se descargan en tiempo de generación y se guardan en `public/data/` (`champions.json`, `builds.json`); la app no llama a esas APIs en tiempo de ejecución.

## Requisitos

- Node.js 20+

## Uso

```bash
npm install
npm run dev             # http://localhost:5173
npm run build           # descarga datos (Showdown/Smogon/PokeAPI) + comprueba tipos + build de producción (dist/)
```

> `npm run build` ya regenera `public/data/` antes de compilar, así que es lo único necesario para refrescar los datos (incluido cuando Smogon publique Reg M-B).

## Despliegue

Sitio estático: `npm run build` y subir la carpeta `dist/` a cualquier hosting estático (p. ej. Netlify). Incluye `public/_redirects` y `netlify.toml` para el enrutado SPA.

## Notas

- **Reg M-B** aún no está en Smogon: la generación prueba `gen9championsvgc2026regmb` y cae a Reg M-A. En cuanto Smogon la publique, basta con `npm run build` para actualizar datos y quitar el aviso automáticamente.
- Tras actualizaciones del mod Champions o para refrescar el meta, vuelve a ejecutar `npm run build` y redespliega.
- Cuando salga **Reg M-C**: actualizar la lista de formatos en `scripts/generate-data.mjs`, el roster legal (`allowed-nums.txt`) y los textos de versión.
- Las habilidades nuevas de Z-A (Fire Mane, Dragonize, Eelevate, Mega Sol, Piercing Drill…) no las implementa `@smogon/calc`, así que están codificadas a mano en `src/lib/damageCalc.ts`.
