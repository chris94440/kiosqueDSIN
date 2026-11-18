import { describe, expect, it } from 'vitest';
import { complete, filterBreeds, parseBreed, parseBreeds, parseImages, photoUrl, safeImageUrl } from './cat.models';

const breeds = parseBreeds([
  { id: 'siam', name: 'Siamese', alt_names: 'Siamois', country_code: 'TH', energy_level: 5 },
  { id: 'char', name: 'Chartreux', country_code: 'FR', temperament: 'Quiet', energy_level: 2 },
  { id: 'birm', name: 'Birman', country_code: 'FR', temperament: 'Quiet' },
]);

describe('catalogue et contrat', () => {
  it('recherche sur alias et filtre local par pays et tempérament', () => {
    expect(filterBreeds(breeds, 'SIAMOIS', '', '', 'name').map((breed) => breed.id)).toEqual(['siam']);
    expect(filterBreeds(breeds, '', 'France', 'Quiet', 'name-desc').map((breed) => breed.id)).toEqual(['char', 'birm']);
  });
  it('classe les valeurs absentes en dernier sans muter le catalogue', () => {
    expect(filterBreeds(breeds, '', '', '', 'energy').map((breed) => breed.id)).toEqual(['char', 'siam', 'birm']);
    expect(breeds[0].id).toBe('siam');
  });
  it('complète les noms et alias sans appel réseau', () => {
    expect(complete(breeds, 'si')[0].name).toBe('Siamese');
    expect(complete(breeds, '')).toEqual([]);
    expect(complete(parseBreeds([{ id: 'e', name: 'Écaille' }]), 'eca')[0].id).toBe('e');
  });
  it('refuse une forme de réponse inattendue et préserve les champs inconnus', () => {
    expect(() => parseBreed({ name: 'Chat sans id' })).toThrow(/id et name/);
    expect(() => parseBreeds({})).toThrow(/tableau/);
    expect(parseBreed({ id: 'x', name: 'X', extra: 'fourni' }).raw['extra']).toBe('fourni');
    expect(() => parseBreed({ id: 'x', name: 'X', energy_level: 'cinq' })).toThrow(/nombre/);
  });
  it('ne transforme pas les valeurs manquantes en caractéristiques inventées', () => {
    expect(parseBreed({ id: 'x', name: 'X' }).energy).toBeUndefined();
    expect(parseImages([])).toEqual([]);
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeImageUrl('https://cdn2.thecatapi.com/x.jpg')).toBe('https://cdn2.thecatapi.com/x.jpg');
  });
  it('demande des vignettes au BFF pour les seules photos du CDN TheCatAPI', () => {
    expect(photoUrl('https://cdn2.thecatapi.com/images/0XYvRd7oD.jpg', 'thumb')).toBe('/photos/0XYvRd7oD.jpg?size=thumb');
    expect(photoUrl('https://cdn2.thecatapi.com/images/a_b-1.png', 'med')).toBe('/photos/a_b-1.png?size=med');
    const foreign = ['https://exemple.invalid/images/x.jpg', 'https://cdn2.thecatapi.com/images/x.jpg?w=10',
      'https://cdn2.thecatapi.com/images/../x.jpg', 'https://cdn2.thecatapi.com/images/x.webp'];
    for (const url of foreign) expect(photoUrl(url, 'thumb')).toBe(url);
  });
});
