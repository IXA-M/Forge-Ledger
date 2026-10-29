import { readFile, writeFile } from 'node:fs/promises';

const source = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json';
const catalog = JSON.parse(await readFile('src/catalog.json', 'utf8'));
const response = await fetch(source);
if (!response.ok) throw new Error(`Could not download Albion item data: ${response.status}`);
const data = (await response.json()).items;
const ids = new Set();
for (const item of catalog) {
  ids.add(item.id);
  for (const recipe of item.recipes || []) {
    for (const material of recipe.materials || []) ids.add(material.id.replace(/@\d+$/, ''));
  }
}

const values = {};
for (const rows of Object.values(data)) {
  if (!Array.isArray(rows)) continue;
  for (const row of rows) {
    const id = row['@uniquename'];
    if (!id || !ids.has(id)) continue;
    // Albion's data dump omits @itemvalue for zero-value ingredients. Keep
    // those as explicit zeroes so recipe Item Values can still be derived.
    const rawValue = row['@itemvalue'];
    const value = rawValue == null || rawValue === '' ? 0 : Number(rawValue);
    if (Number.isFinite(value) && value >= 0) values[id] = value;
  }
}
await writeFile('src/data/itemValues.json', `${JSON.stringify(values)}\n`);
console.log(`Wrote ${Object.keys(values).length} Albion item values to src/data/itemValues.json`);
