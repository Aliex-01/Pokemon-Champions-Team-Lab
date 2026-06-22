import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('public/data/champions.json', 'utf8'));
const used = new Set();
for (const ids of Object.values(data.learnsets)) for (const id of ids) used.add(id);
const descs = new Set();
for (const id of used) { const d = data.moveData?.[id]?.desc; if (d) descs.add(d); }
const arr = [...descs].sort();
console.log('Descripciones únicas (usadas):', arr.length);
console.log(arr.slice(0, 60).join('\n'));
