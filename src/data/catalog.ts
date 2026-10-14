import catalogData from '../catalog.json';
import craftingFameFactors from '../craftingFameFactors.json';
import { formatMaterialName, type CatalogItem } from '../domain';

const sourceCatalog = catalogData as CatalogItem[];
const sourceMaterialNames = new Map<string, string>();

for (const item of sourceCatalog) {
  for (const recipe of item.recipes) {
    for (const material of recipe.materials) {
      if (!/_LEVEL[1-4](?:@[1-4])?$/.test(material.id)) {
        sourceMaterialNames.set(material.id.replace(/@[1-4]$/, ''), material.name);
      }
    }
  }
}

export const displayMaterialName = (id: string, name: string) =>
  formatMaterialName(id, name, sourceMaterialNames);

export const catalog: CatalogItem[] = sourceCatalog.map((item) => ({
  ...item,
  craftingFameFactor:
    item.craftingFameFactor ?? (craftingFameFactors as Record<string, number>)[item.id] ?? 1,
  recipes: item.recipes.map((recipe) => ({
    ...recipe,
    materials: recipe.materials.map((material) => ({
      ...material,
      name: displayMaterialName(material.id, material.name),
    })),
  })),
}));

export const catalogById = new Map(catalog.map((item) => [item.id, item]));
