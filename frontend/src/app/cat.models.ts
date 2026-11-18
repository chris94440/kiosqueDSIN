export type Mode = 'live' | 'demo';
export type SortOrder = 'name' | 'name-desc' | 'country' | 'affection' | 'energy';
export interface Breed {
  id: string;
  name: string;
  altNames?: string;
  origin?: string;
  countryCode?: string;
  temperament?: string;
  description?: string;
  lifeSpan?: string;
  weight?: string;
  imageUrl?: string;
  affection?: number;
  energy?: number;
  raw: Record<string, unknown>;
}
export interface CatImage { url: string; raw: Record<string, unknown>; }
export interface ApiLog {
  id: string; mode: Mode; path: string; status: number | string; milliseconds?: number; body?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Champ ${key} inattendu : une chaîne était attendue.`);
  return value;
}
function numberField(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Champ ${key} inattendu : un nombre était attendu.`);
  return value;
}
export function parseBreed(value: unknown): Breed {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['name'] !== 'string') {
    throw new Error('Fiche inattendue : id et name doivent être des chaînes. Consultez le JSON reçu.');
  }
  const weight = value['weight'];
  const photo = value['image'];
  return {
    id: value['id'], name: value['name'], raw: value,
    altNames: stringField(value, 'alt_names'), origin: stringField(value, 'origin'),
    countryCode: stringField(value, 'country_code') || stringField(value, 'country_codes'),
    temperament: stringField(value, 'temperament'), description: stringField(value, 'description'),
    lifeSpan: stringField(value, 'life_span'),
    weight: isRecord(weight) ? stringField(weight, 'metric') : undefined,
    imageUrl: isRecord(photo) ? safeImageUrl(photo['url']) : undefined,
    affection: numberField(value, 'affection_level'), energy: numberField(value, 'energy_level'),
  };
}
export function parseBreeds(value: unknown): Breed[] {
  if (!Array.isArray(value)) throw new Error('Réponse inattendue : un tableau de races était attendu.');
  return value.map(parseBreed);
}
export function parseImages(value: unknown): CatImage[] {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error('Réponse inattendue : un tableau d’images était attendu.');
  return value.flatMap((item) => {
    const url = safeImageUrl(item['url']);
    return url ? [{ url, raw: item }] : [];
  });
}
export function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : undefined; }
  catch { return undefined; }
}
export type PhotoSize = 'thumb' | 'med';
const CDN_PHOTO = /^https:\/\/cdn2\.thecatapi\.com\/images\/([A-Za-z0-9_-]{1,40}\.(?:jpe?g|png|gif))$/i;
/** Les photos d'origine pèsent souvent plus d'1 Mo : le BFF en sert une version réduite. Toute autre URL reste inchangée. */
export function photoUrl(original: string, size: PhotoSize): string {
  const file = CDN_PHOTO.exec(original)?.[1];
  return file ? `/photos/${file}?size=${size}` : original;
}
export function countryName(breed: Breed): string {
  return /^[A-Z]{2}$/.test(breed.countryCode || '')
    ? new Intl.DisplayNames(['fr'], { type: 'region' }).of(breed.countryCode!) || breed.origin || 'Origine non renseignée'
    : breed.origin || 'Origine non renseignée';
}
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}
export function filterBreeds(breeds: Breed[], query: string, country: string, temperament: string, sort: SortOrder): Breed[] {
  const q = normalize(query.trim());
  const result = breeds.filter((breed) =>
    (!q || normalize(`${breed.name} ${breed.altNames || ''}`).includes(q))
    && (!country || countryName(breed) === country)
    && (!temperament || (breed.temperament || '').split(',').map((item) => item.trim()).includes(temperament)));
  const name = (a: Breed, b: Breed) => a.name.localeCompare(b.name, 'fr');
  return result.sort((a, b) => {
    if (sort === 'country') return countryName(a).localeCompare(countryName(b), 'fr') || name(a, b);
    if (sort === 'affection') return (b.affection ?? -1) - (a.affection ?? -1) || name(a, b);
    if (sort === 'energy') return (a.energy ?? 99) - (b.energy ?? 99) || name(a, b);
    return sort === 'name-desc' ? name(b, a) : name(a, b);
  });
}
export function complete(breeds: Breed[], query: string): Breed[] {
  if (!query.trim()) return [];
  const q = normalize(query.trim());
  return filterBreeds(breeds, query, '', '', 'name').sort((a, b) =>
    Number(normalize(b.name).startsWith(q)) - Number(normalize(a.name).startsWith(q))
    || a.name.localeCompare(b.name, 'fr')).slice(0, 7);
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur inconnue. Consultez le journal API.';
}
