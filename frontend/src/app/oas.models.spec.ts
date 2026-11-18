import { describe, expect, it } from 'vitest';
import { extractOasExcerpt, KioskOperation, locationLabel, NOT_PROVIDED } from './oas.models';

const contract = {
  openapi: '3.0.0', info: { title: 'Mini', version: '9.9' }, servers: [{ url: 'https://api.example/v1' }],
  security: [{ 'x-api-key': [] }],
  components: {
    securitySchemes: {
      'x-api-key': { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'Clé requise' },
      Alias: { $ref: '#/components/securitySchemes/x-api-key' },
      Cassé: 'pas un schéma',
      Vide: {},
    },
    parameters: { Limit: { name: 'limit', in: 'query', description: 'Maximum' }, Loop: { $ref: '#/components/parameters/Loop' } },
    schemas: { NewFavourite: { type: 'object', required: ['image_id'], properties: { image_id: { type: 'string', description: 'Image' }, sub_id: { type: 'string' } } } },
    requestBodies: { Fav: { content: { 'application/json': { schema: { $ref: '#/components/schemas/NewFavourite' } } } } },
  },
  paths: {
    '/breeds': { get: { summary: 'List breeds', parameters: [{ $ref: '#/components/parameters/Limit' }, { $ref: '#/components/parameters/Loop' }, { name: 'page', in: 'query' }], responses: { '200': { description: 'ok' } } } },
    '/breeds/search': { parameters: [{ name: 'q', in: 'query', required: true, description: 'Nom' }], get: { security: [], responses: { '200': {}, '429': {} } } },
    '/favourites': { post: { requestBody: { $ref: '#/components/requestBodies/Fav' }, responses: { default: {} } } },
    '/broken': { get: 'pas une opération' },
  },
};
const wanted: KioskOperation[] = [
  { method: 'get', path: '/breeds', sent: [], usage: 'catalogue' },
  { method: 'get', path: '/breeds/search', sent: ['q', 'fantome'], usage: 'recherche' },
  { method: 'post', path: '/favourites', sent: ['image_id'], usage: 'écriture' },
  { method: 'get', path: '/broken', sent: [], usage: 'cassé' },
  { method: 'get', path: '/absent', sent: [], usage: 'absent' },
];

describe('extrait du contrat OpenAPI', () => {
  const excerpt = extractOasExcerpt(contract, wanted);
  const [list, search, favourite] = excerpt.operations;

  it('lit l’en-tête et compte les chemins et opérations du contrat entier', () => {
    expect(excerpt).toMatchObject({ openapi: '3.0.0', title: 'Mini', version: '9.9', server: 'https://api.example/v1', totalPaths: 4, totalOperations: 3 });
  });
  it('signale les opérations absentes ou illisibles au lieu de les inventer', () => {
    expect(excerpt.operations.map((operation) => operation.path)).toEqual(['/breeds', '/breeds/search', '/favourites']);
    expect(excerpt.missing).toEqual(['GET /broken', 'GET /absent']);
  });
  it('résout les $ref, les paramètres du chemin et les champs du corps, sans boucler sur une référence cyclique', () => {
    expect(list).toMatchObject({ summary: 'List breeds', sent: [], otherCount: 2 });
    expect(search.sent).toEqual([{ name: 'q', location: 'query', required: true, description: 'Nom' }]);
    expect(search.notFound).toEqual(['fantome']);
    expect(favourite.sent).toEqual([{ name: 'image_id', location: 'body', required: true, description: 'Image' }]);
    expect(favourite.otherCount).toBe(1);
  });
  it('annonce les statuts déclarés, leur absence d’erreur et la sécurité applicable', () => {
    expect(list).toMatchObject({ statuses: ['200'], declaresErrors: false, security: ['x-api-key'] });
    expect(search).toMatchObject({ statuses: ['200', '429'], declaresErrors: true, security: [], summary: NOT_PROVIDED });
    expect(favourite).toMatchObject({ statuses: ['default'], declaresErrors: true });
  });
  it('lit les schémas de sécurité déclarés et l’exigence globale, sans rien inventer', () => {
    expect(excerpt.security.required).toEqual(['x-api-key']);
    expect(excerpt.security.schemes).toEqual([
      { name: 'x-api-key', type: 'apiKey', location: 'header', parameter: 'x-api-key', description: 'Clé requise' },
      { name: 'Alias', type: 'apiKey', location: 'header', parameter: 'x-api-key', description: 'Clé requise' },
      { name: 'Vide', type: NOT_PROVIDED, location: NOT_PROVIDED, parameter: NOT_PROVIDED, description: NOT_PROVIDED },
    ]);
    expect(extractOasExcerpt({ paths: {} }, []).security).toEqual({ schemes: [], required: [] });
  });
  it('refuse un document qui n’est pas un contrat et affiche « Non renseigné » pour l’en-tête manquant', () => {
    for (const value of ['texte', null, [], {}, { paths: [] }]) expect(() => extractOasExcerpt(value)).toThrow(/OpenAPI/);
    expect(extractOasExcerpt({ paths: {} }, [])).toMatchObject({ openapi: NOT_PROVIDED, title: NOT_PROVIDED, version: NOT_PROVIDED, server: NOT_PROVIDED });
  });
  it('traduit les emplacements des paramètres', () => {
    expect(locationLabel('path')).toBe('chemin');
    expect(locationLabel('body')).toBe('corps JSON');
    expect(locationLabel('autre')).toBe('autre');
  });
  it('distingue l’opération qui hérite de la sécurité globale de celle qui déclare la sienne', () => {
    expect(list.securityInherited).toBe(true);
    expect(search.securityInherited).toBe(false);
    expect(favourite.securityInherited).toBe(true);
  });
});

describe('focus sur la sécurité du contrat', () => {
  // Même ordre de clés que le vrai contrat de TheCatAPI : paths avant components, security en dernier.
  const realistic = {
    openapi: '3.0.0',
    paths: { '/breeds': { get: { responses: { '200': {} } } }, '/breeds/{id}': { get: { responses: { '200': {} } } } },
    info: { title: 'Cat', version: '1' }, tags: [], servers: [{ url: 'https://api.example/v1' }],
    components: {
      securitySchemes: { 'x-api-key': { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'API key required to access protected resources' } },
      schemas: { Breed: {} },
    },
    security: [{ 'x-api-key': [] }],
  };
  const both: KioskOperation[] = [
    { method: 'get', path: '/breeds', sent: [], usage: 'catalogue' },
    { method: 'get', path: '/breeds/{id}', sent: ['id'], usage: 'fiche' },
  ];
  const withScheme = (scheme: Record<string, unknown>) => ({ ...realistic, components: { securitySchemes: { 'x-api-key': scheme } } });

  it('réduit le contrat à ce qui concerne la sécurité, dans l’ordre du fichier, en signalant ce qui est masqué', () => {
    const { lines } = extractOasExcerpt(realistic, both).securityFocus;
    expect(lines.map((line) => line.code)).toEqual([
      '{',
      '  "openapi": "3.0.0",',
      '  "paths": { … },',
      '  …',
      '  "components": {',
      '    "securitySchemes": {',
      '      "x-api-key": {',
      '        "type": "apiKey",',
      '        "in": "header",',
      '        "name": "x-api-key",',
      '        "description": "API key required to access protected resources"',
      '      }',
      '    },',
      '    …',
      '  },',
      '  "security": [',
      '    { "x-api-key": [] }',
      '  ]',
      '}',
    ]);
    expect(lines.find((line) => line.code.includes('"paths"'))).toMatchObject({ muted: true, hint: '2 opérations, masquées' });
    expect(lines.filter((line) => line.hot).map((line) => line.code.trim())).toEqual(['"in": "header",', '"name": "x-api-key",']);
  });
  it('numérote les lignes annotées dans l’ordre de lecture, et la légende suit la même numérotation', () => {
    const { lines, notes } = extractOasExcerpt(realistic, both).securityFocus;
    expect(lines.filter((line) => line.note).map((line) => [line.note, line.code.trim()])).toEqual([
      [1, '"securitySchemes": {'], [2, '"x-api-key": {'], [3, '"type": "apiKey",'], [4, '"in": "header",'], [5, '"name": "x-api-key",'], [6, '"security": ['],
    ]);
    expect(notes.map((note) => [note.n, note.term])).toEqual([[1, 'securitySchemes'], [2, 'x-api-key'], [3, 'type'], [4, 'in'], [5, 'name'], [6, 'security']]);
    expect(notes[1].text).toMatch(/identique au champ name \(note 5\)/);
    expect(notes[2].text).toMatch(/une clé d’API/);
    expect(notes[3].text).toMatch(/dans l’en-tête de la requête/);
    expect(notes[5].text).toMatch(/toute opération exige « x-api-key »[\s\S]*Les 2 opérations utilisées par ce kiosque en héritent/);
  });
  it('traduit en clair où mettre la clé et propose l’option curl équivalente', () => {
    expect(extractOasExcerpt(realistic, both).securityFocus.usage).toEqual({
      requirement: 'Pour être accepté, chaque appel doit porter l’en-tête « x-api-key » avec votre clé.',
      curlFlag: '-H "x-api-key: VOTRE_CLE_API"',
    });
    const inQuery = extractOasExcerpt(withScheme({ type: 'apiKey', in: 'query', name: 'api_key' }), both).securityFocus.usage;
    expect(inQuery?.requirement).toContain('« api_key=votre clé » à l’adresse');
    expect(inQuery?.curlFlag).toBeUndefined();
    expect(extractOasExcerpt(withScheme({ type: 'http', scheme: 'bearer' }), both).securityFocus.usage).toBeUndefined();
  });
  it('reste lisible quand le contrat est inhabituel : références, schémas en trop, ordre des clés', () => {
    const { lines, notes } = extractOasExcerpt(contract, wanted).securityFocus;
    expect(lines.map((line) => line.code)).toEqual([
      '{',
      '  "openapi": "3.0.0",',
      '  …',
      '  "security": [',
      '    { "x-api-key": [] }',
      '  ],',
      '  "components": {',
      '    "securitySchemes": {',
      '      "x-api-key": {',
      '        "type": "apiKey",',
      '        "in": "header",',
      '        "name": "x-api-key",',
      '        "description": "Clé requise"',
      '      },',
      '      "Alias": { "$ref": "#/components/securitySchemes/x-api-key" },',
      '      "Cassé": "pas un schéma",',
      '      …',
      '    },',
      '    …',
      '  },',
      '  "paths": { … }',
      '}',
    ]);
    expect(notes[0]).toMatchObject({ n: 1, term: 'security' });
    expect(notes[0].text).toMatch(/2 des 3 opérations utilisées par ce kiosque en héritent ; les autres déclarent la leur/);
  });
  it('tronque les textes trop longs et n’invente rien quand la sécurité n’est pas déclarée', () => {
    const long = withScheme({ type: 'apiKey', in: 'header', name: 'k', description: 'x'.repeat(200) });
    const description = extractOasExcerpt(long, both).securityFocus.lines.find((line) => line.code.includes('"description"'));
    expect(description?.code.trim()).toBe(`"description": "${'x'.repeat(90)}…"`);
    expect(extractOasExcerpt({ paths: {} }, []).securityFocus).toEqual({ lines: [], notes: [] });
  });
  it('signale l’absence d’exigence globale au lieu d’affirmer que tout est protégé', () => {
    const open = { ...realistic, security: [] };
    const { lines, notes, usage } = extractOasExcerpt(open, both).securityFocus;
    expect(lines.some((line) => line.code === '  "security": []')).toBe(true);
    expect(notes.at(-1)?.text).toMatch(/Aucune exigence globale/);
    expect(usage).toBeUndefined();
  });
});
