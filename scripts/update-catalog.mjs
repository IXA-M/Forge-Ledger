import { readFile, writeFile } from 'node:fs/promises';
import { mkdir, unlink } from 'node:fs/promises';

const source = 'data/items-source.json';
const formatted = 'data/items-formatted-source.json';
if (process.argv.includes('--fetch')) {
  await mkdir('data', { recursive: true });
  for (const [url, destination] of [
    ['https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json', source],
    ['https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json', formatted],
  ]) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
    console.log(`Downloaded ${destination}`);
  }
}

const sourceData = JSON.parse(await readFile(source, 'utf8')).items;
const formattedData = JSON.parse(await readFile(formatted, 'utf8'));
const nameById = new Map(formattedData.map((item) => [item.UniqueName, item.LocalizedNames?.['EN-US']]).filter(([, name]) => name));
const prettify = (id) => id.replace(/^T\d+_/, '').replace(/@\d+$/, '').replaceAll('_', ' ').toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const categoryNames = {
  weapons: 'Weapons', armors: 'Armor', head: 'Headgear', shoes: 'Footwear', offhands: 'Off-hand',
  bags: 'Bags', capes: 'Capes', consumables: 'Consumables', crafting: 'Crafting materials',
  gathering: 'Gathering', farming: 'Farming', furniture: 'Furniture', vanity: 'Vanity',
  other: 'Other', artefacts: 'Artifacts', mounts: 'Mounts',
};
const toList = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const parseMaterialId = (resource) => {
  const id = resource['@uniquename'];
  const enchant = Number(resource['@enchantmentlevel'] || 0);
  return enchant > 0 && !id.includes('@') ? `${id}@${enchant}` : id;
};
const materialRows = (requirement) => toList(requirement?.craftresource).map((resource) => ({
  id: parseMaterialId(resource),
  name: nameById.get(resource['@uniquename']) || prettify(resource['@uniquename']),
  count: Number(resource['@count'] || 0),
  returnable: resource['@maxreturnamount'] !== '0',
})).filter((resource) => resource.count > 0);

const catalog = [];
const itemGroups = Object.entries(sourceData).filter(([, value]) => Array.isArray(value));
for (const [sourceType, group] of itemGroups) {
  for (const item of group) {
    const id = item['@uniquename'];
    if (!id || item['@showinmarketplace'] === 'false') continue;
    const recipes = [];
    const addRecipes = (requirements, suffix = '') => {
      toList(requirements).forEach((req, index) => {
        const materials = materialRows(req);
        if (!materials.length) return;
        recipes.push({
          id: `${id}${suffix}${toList(requirements).length > 1 ? `#${index + 1}` : ''}`,
          label: toList(requirements).length > 1 ? `Recipe ${index + 1}` : 'Standard recipe',
          outputCount: Math.max(1, Number(req['@amountcrafted'] || req['@craftamount'] || 1)),
          materials,
        });
      });
    };
    addRecipes(item.craftingrequirements);
    const enchantments = toList(item.enchantments?.enchantment);
    for (const enchantment of enchantments) {
      const level = Number(enchantment['@enchantmentlevel'] || 0);
      if (level > 0) addRecipes(enchantment.craftingrequirements, `@${level}`);
    }
    // ao-bin-dumps contains the standard Dragonslayer artifact recipe separately:
    // each tiered Dragonhide artifact is crafted from 50 same-tier Fire Dragon Scales.
    // Expose that procurement path only for the three leather Dragonslayer slots.
    const dragonTier = id.match(/^T([4-8])_(?:ARMOR|HEAD|SHOES)_LEATHER_DRAGON$/)?.[1];
    if (dragonTier && recipes.length) {
      const scaleId = `T${dragonTier}_SHARD_FIRE_DRAGON`;
      for (const recipe of [...recipes]) {
        const artifactIndex = recipe.materials.findIndex((material) => /^T[4-8]_ARTEFACT_(?:ARMOR|HEAD|SHOES)_LEATHER_DRAGON$/.test(material.id));
        if (artifactIndex < 0) continue;
        const materials = recipe.materials.map((material, index) => index === artifactIndex
          ? { id: scaleId, name: nameById.get(scaleId) || 'Fire Dragon Scale', count: 50, returnable: false }
          : material);
        recipes.push({ ...recipe, id: `${recipe.id}:fire-scales`, label: 'Alternative: 50 Fire Dragon Scales', materials });
      }
    }
    if (!recipes.length) continue;
    const categoryId = item['@shopcategory'] || sourceType;
    const category = /_TOOL_/.test(id) ? 'Tools' : categoryNames[categoryId] || prettify(categoryId);
    const tier = Number(item['@tier'] || id.match(/^T(\d)_/)?.[1] || 0);
    const itemName = nameById.get(id) || prettify(id);
    const journalType = /^T[4-8]_(?:ARMOR|HEAD|SHOES)_LEATHER_DRAGON$/.test(id) || item['@craftingcategory'] === 'leather_armor' ? 'Fletcher' : null;
    catalog.push({ id, name: itemName, category, subcategory: prettify(item['@shopsubcategory1'] || sourceType), tier, sourceType, recipes, journalType, craftingFameFactor: Number(item['@destinyandjournalcraftfamefactor'] || 0) || null });
  }
}
catalog.sort((a, b) => a.category.localeCompare(b.category) || a.tier - b.tier || a.name.localeCompare(b.name));
await writeFile('src/catalog.json', JSON.stringify(catalog));
console.log(`Wrote ${catalog.length.toLocaleString()} craftable items (${catalog.reduce((n, item) => n + item.recipes.length, 0).toLocaleString()} recipes) to src/catalog.json`);
if (process.argv.includes('--fetch')) await Promise.all([source, formatted].map((file) => unlink(file).catch(() => {})));
