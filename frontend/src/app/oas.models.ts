import { isRecord } from './cat.models';
import { KEY_PLACEHOLDER } from './practice';

export const NOT_PROVIDED = 'Non renseigné';

export interface KioskOperation {
  method: 'get' | 'post';
  path: string;
  /** Paramètres, ou champs du corps JSON, réellement envoyés par le kiosque : à tenir à jour avec AppComponent. */
  sent: readonly string[];
  usage: string;
}

export const KIOSK_OPERATIONS: readonly KioskOperation[] = [
  { method: 'get', path: '/breeds', sent: [], usage: 'Charge le catalogue des races.' },
  { method: 'get', path: '/breeds/search', sent: ['q'], usage: 'Recherche côté serveur : bouton « Rechercher via l’API ».' },
  { method: 'get', path: '/breeds/{id}', sent: ['id'], usage: 'Premier appel d’une fiche : la race.' },
  { method: 'get', path: '/images/search', sent: ['breed_ids', 'limit', 'include_breeds'], usage: 'Second appel d’une fiche : les photos de la race.' },
  { method: 'post', path: '/favourites', sent: ['image_id'], usage: 'Exemple d’écriture : expliqué, jamais exécuté.' },
];

export interface OasField { name: string; location: string; required: boolean; description: string; }
export interface OasOperation {
  key: string;
  method: string;
  path: string;
  summary: string;
  usage: string;
  /** Champs envoyés par le kiosque et retrouvés dans le contrat. */
  sent: OasField[];
  /** Champs envoyés par le kiosque mais absents du contrat lu. */
  notFound: string[];
  /** Champs que le contrat propose et que le kiosque n'utilise pas. */
  otherCount: number;
  statuses: string[];
  declaresErrors: boolean;
  security: string[];
  /** Vrai quand l'opération ne déclare pas sa propre `security` et reprend l'exigence globale du contrat. */
  securityInherited: boolean;
}
export interface OasSecurityScheme {
  name: string;
  type: string;
  /** Emplacement de la clé (« in » du contrat) : header, query ou cookie. */
  location: string;
  /** Nom de l'en-tête, ou du paramètre, qui porte la clé. */
  parameter: string;
  description: string;
}
export interface OasSecurity {
  /** Schémas déclarés par le contrat (components.securitySchemes). */
  schemes: OasSecurityScheme[];
  /** Exigences globales : valables pour toute opération qui ne déclare pas la sienne. */
  required: string[];
}
export interface OasFocusLine {
  /** Ligne de JSON, indentation comprise. */
  code: string;
  /** Numéro de la note qui explique cette ligne. */
  note?: number;
  /** Ligne qui dit où et comment présenter la clé. */
  hot?: boolean;
  /** Partie du contrat simplement rappelée ou masquée. */
  muted?: boolean;
  /** Commentaire affiché à côté du code, qui ne fait pas partie du contrat. */
  hint?: string;
}
export interface OasFocusNote { n: number; term: string; text: string; }
export interface OasKeyUsage {
  /** Ce que doit faire un appel pour être accepté, d'après le contrat. */
  requirement: string;
  /** Option curl équivalente, quand la clé voyage dans un en-tête. */
  curlFlag?: string;
}
/** La partie « sécurité » du contrat : extrait annoté, légende numérotée et traduction en clair. */
export interface OasSecurityFocus {
  lines: OasFocusLine[];
  notes: OasFocusNote[];
  usage?: OasKeyUsage;
}
export interface OasExcerpt {
  openapi: string;
  title: string;
  version: string;
  server: string;
  totalPaths: number;
  totalOperations: number;
  operations: OasOperation[];
  security: OasSecurity;
  securityFocus: OasSecurityFocus;
  /** Opérations du kiosque absentes du contrat : l'écart est signalé, jamais masqué. */
  missing: string[];
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const LOCATIONS: Record<string, string> = { query: 'query', path: 'chemin', header: 'en-tête', cookie: 'cookie', body: 'corps JSON' };

export function locationLabel(location: string): string {
  return LOCATIONS[location] ?? location;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Résout un `$ref` local (`#/components/...`). Les références externes ou cycliques donnent `undefined`. */
function deref(doc: Record<string, unknown>, node: unknown, depth = 0): unknown {
  if (!isRecord(node) || typeof node['$ref'] !== 'string') return node;
  const ref = node['$ref'];
  if (depth > 5 || !ref.startsWith('#/')) return undefined;
  let current: unknown = doc;
  for (const part of ref.slice(2).split('/')) {
    if (!isRecord(current)) return undefined;
    current = current[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return deref(doc, current, depth + 1);
}

function parametersOf(doc: Record<string, unknown>, pathItem: Record<string, unknown>, operation: Record<string, unknown>): OasField[] {
  const merged = new Map<string, OasField>();
  for (const list of [pathItem['parameters'], operation['parameters']]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const parameter = deref(doc, entry);
      const name = isRecord(parameter) ? text(parameter['name']) : undefined;
      const location = isRecord(parameter) ? text(parameter['in']) : undefined;
      if (!isRecord(parameter) || !name || !location) continue;
      merged.set(`${location}:${name}`, {
        name, location, required: parameter['required'] === true || location === 'path',
        description: text(parameter['description']) ?? NOT_PROVIDED,
      });
    }
  }
  return [...merged.values()];
}

function bodyFieldsOf(doc: Record<string, unknown>, operation: Record<string, unknown>): OasField[] {
  const body = deref(doc, operation['requestBody']);
  const content = isRecord(body) ? body['content'] : undefined;
  const json = isRecord(content) ? content['application/json'] : undefined;
  const schema = isRecord(json) ? deref(doc, json['schema']) : undefined;
  if (!isRecord(schema) || !isRecord(schema['properties'])) return [];
  const required = Array.isArray(schema['required']) ? schema['required'] : [];
  return Object.entries(schema['properties']).map(([name, value]) => {
    const property = deref(doc, value);
    return {
      name, location: 'body', required: required.includes(name),
      description: (isRecord(property) ? text(property['description']) : undefined) ?? NOT_PROVIDED,
    };
  });
}

function requirementNames(requirements: unknown): string[] {
  return Array.isArray(requirements) ? [...new Set(requirements.filter(isRecord).flatMap((requirement) => Object.keys(requirement)))] : [];
}

function securityOf(doc: Record<string, unknown>, operation: Record<string, unknown>): string[] {
  return requirementNames(Array.isArray(operation['security']) ? operation['security'] : doc['security']);
}

function securitySchemesOf(doc: Record<string, unknown>): OasSecurityScheme[] {
  const components = isRecord(doc['components']) ? doc['components'] : {};
  const schemes = isRecord(components['securitySchemes']) ? components['securitySchemes'] : {};
  return Object.entries(schemes).flatMap(([name, value]) => {
    const scheme = deref(doc, value);
    if (!isRecord(scheme)) return [];
    return [{
      name, type: text(scheme['type']) ?? NOT_PROVIDED, location: text(scheme['in']) ?? NOT_PROVIDED,
      parameter: text(scheme['name']) ?? NOT_PROVIDED, description: text(scheme['description']) ?? NOT_PROVIDED,
    }];
  });
}

type FocusRole = 'schemes' | 'scheme' | 'type' | 'in' | 'param' | 'security';
interface Draft { text: string; role?: FocusRole; muted?: boolean; hint?: string; }

const SCHEME_ROLES = new Map<string, FocusRole>([['type', 'type'], ['in', 'in'], ['name', 'param']]);
const SCHEME_TYPE_TEXT = new Map<string, string>([
  ['apiKey', 'une clé d’API, c’est-à-dire un mot de passe pour une application (et non pour une personne), à joindre à chaque appel.'],
  ['http', 'une authentification HTTP standard, par exemple « Basic » (identifiant et mot de passe) ou « Bearer » (un jeton).'],
  ['oauth2', 'OAuth 2 : l’utilisateur autorise l’application, qui reçoit un jeton temporaire.'],
  ['openIdConnect', 'OpenID Connect : l’identité est confiée à un fournisseur tiers, comme avec « Se connecter avec… ».'],
  ['mutualTLS', 'TLS mutuel : le client prouve son identité par un certificat.'],
]);
const FOCUS_STRING_MAX = 90;
const FOCUS_COMPACT_MAX = 64;
const FOCUS_SCHEMES_MAX = 3;
const FOCUS_ITEMS_MAX = 4;

const draft = (text: string, role?: FocusRole): Draft => (role ? { text, role } : { text });

function quoted(value: string): string {
  return JSON.stringify(value.length > FOCUS_STRING_MAX ? `${value.slice(0, FOCUS_STRING_MAX)}…` : value);
}

/** Écrit une valeur JSON sur une seule ligne, espacée pour la lecture ; la profondeur et la longueur sont bornées. */
function inline(value: unknown, depth = 0): string {
  if (typeof value === 'string') return quoted(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (depth >= 3) return '[ … ]';
    const shown = value.slice(0, FOCUS_ITEMS_MAX).map((item) => inline(item, depth + 1));
    return `[ ${[...shown, ...(value.length > FOCUS_ITEMS_MAX ? ['…'] : [])].join(', ')} ]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    if (depth >= 3) return '{ … }';
    const shown = entries.slice(0, 6).map(([key, item]) => `${quoted(key)}: ${inline(item, depth + 1)}`);
    return `{ ${[...shown, ...(entries.length > 6 ? ['…'] : [])].join(', ')} }`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Assemble des morceaux de JSON : une virgule entre deux morceaux, une seule ligne « … » pour une suite de morceaux masqués (`null`). */
function assemble(items: ReadonlyArray<Draft[] | null>, pad: string, hint: string): Draft[] {
  const groups: Array<{ lines: Draft[]; masked: boolean }> = [];
  for (const item of items) {
    if (item) groups.push({ lines: item.map((line) => ({ ...line })), masked: false });
    else if (!groups.length || !groups[groups.length - 1].masked) groups.push({ lines: [{ text: `${pad}…`, muted: true, hint }], masked: true });
  }
  groups.forEach((group, index) => {
    if (!group.masked && index < groups.length - 1) group.lines[group.lines.length - 1].text += ',';
  });
  return groups.flatMap((group) => group.lines);
}

/** Seul le premier schéma est annoté : les suivants ne feraient que répéter la même explication. */
function schemeDrafts(name: string, scheme: unknown, annotated: boolean): Draft[] {
  const pad = '      ';
  const head = `${pad}${quoted(name)}: `;
  const compact = inline(scheme);
  if (!isRecord(scheme) || compact.length <= FOCUS_COMPACT_MAX) return [{ text: head + compact }];
  const entries = Object.entries(scheme).slice(0, 8);
  const items: Array<Draft[] | null> = entries.map(([key, value]) => [draft(`${pad}  ${quoted(key)}: ${inline(value)}`, annotated ? SCHEME_ROLES.get(key) : undefined)]);
  if (Object.keys(scheme).length > entries.length) items.push(null);
  return [draft(`${head}{`, annotated ? 'scheme' : undefined), ...assemble(items, `${pad}  `, 'autres champs, masqués'), draft(`${pad}}`)];
}

function rawSchemesOf(doc: Record<string, unknown>): Array<[string, unknown]> {
  const components = isRecord(doc['components']) ? doc['components'] : {};
  return isRecord(components['securitySchemes']) ? Object.entries(components['securitySchemes']) : [];
}

/** Reconstitue, dans l'ordre du fichier, le squelette du contrat réduit à ce qui concerne la sécurité. */
function focusDrafts(doc: Record<string, unknown>, totalOperations: number): Draft[] {
  const components = isRecord(doc['components']) ? doc['components'] : {};
  const schemes = rawSchemesOf(doc);
  const globalSecurity = Array.isArray(doc['security']) ? doc['security'] : undefined;
  if (!schemes.length && !globalSecurity) return [];

  const schemesPart = [
    draft('    "securitySchemes": {', 'schemes'),
    ...assemble([
      ...schemes.slice(0, FOCUS_SCHEMES_MAX).map(([name, value], index) => schemeDrafts(name, value, index === 0)),
      ...(schemes.length > FOCUS_SCHEMES_MAX ? [null] : []),
    ], '      ', 'autres moyens, masqués'),
    draft('    }'),
  ];
  const componentsPart = [
    draft('  "components": {'),
    ...assemble(Object.keys(components).map((key) => key === 'securitySchemes' ? schemesPart : null), '    ', 'autres composants, masqués'),
    draft('  }'),
  ];
  const securityPart = globalSecurity?.length
    ? [
      draft('  "security": [', 'security'),
      ...assemble([
        ...globalSecurity.slice(0, FOCUS_ITEMS_MAX).map((requirement) => [draft(`    ${inline(requirement)}`)]),
        ...(globalSecurity.length > FOCUS_ITEMS_MAX ? [null] : []),
      ], '    ', 'autres exigences, masquées'),
      draft('  ]'),
    ]
    : [draft('  "security": []', 'security')];
  const top = Object.keys(doc).map((key): Draft[] | null => {
    if (key === 'openapi' && typeof doc['openapi'] === 'string') return [{ text: `  "openapi": ${quoted(doc['openapi'])}`, muted: true }];
    if (key === 'paths') return [{ text: '  "paths": { … }', muted: true, hint: `${totalOperations} opérations, masquées` }];
    if (key === 'components' && schemes.length) return componentsPart;
    if (key === 'security' && globalSecurity) return securityPart;
    return null;
  });
  return [draft('{'), ...assemble(top, '  ', 'autres parties du contrat, masquées'), draft('}')];
}

interface NoteContext {
  schemeCount: number;
  scheme: OasSecurityScheme | undefined;
  required: string[];
  inherited: number;
  operations: number;
  numberOf: (role: FocusRole) => number | undefined;
}

function noteText(role: FocusRole, context: NoteContext): { term: string; text: string } {
  const { scheme } = context;
  const where = scheme?.location ?? NOT_PROVIDED;
  switch (role) {
    case 'schemes':
      return { term: 'securitySchemes', text: `La liste des moyens de prouver qui l’on est que ce contrat connaît (ici : ${context.schemeCount}). Ce n’est qu’une déclaration : à ce stade, rien n’est encore exigé.` };
    case 'scheme': {
      const param = context.numberOf('param');
      const twin = scheme && scheme.name === scheme.parameter && param
        ? ` Ici, elle est identique au champ name (note ${param}), mais ce sont deux choses distinctes : l’une désigne le moyen, l’autre ce qu’on écrit dans l’appel.` : '';
      return { term: scheme?.name ?? NOT_PROVIDED, text: `Le nom de ce moyen : une simple étiquette, reprise plus bas pour l’exiger.${twin}` };
    }
    case 'type': {
      const type = scheme?.type ?? NOT_PROVIDED;
      const known = SCHEME_TYPE_TEXT.get(type);
      return { term: 'type', text: known ? `Le type de moyen : ${known}` : `Le type de moyen : ${type === NOT_PROVIDED ? 'non renseigné dans le contrat' : `« ${type} »`}.` };
    }
    case 'in':
      return { term: 'in', text: where === 'header' ? 'Où placer la clé : dans l’en-tête de la requête, c’est-à-dire les informations qui accompagnent la demande, et non dans l’adresse.'
        : where === 'query' ? 'Où placer la clé : dans l’adresse, après le « ? ».'
        : where === 'cookie' ? 'Où placer la clé : dans un cookie.'
        : `Où placer la clé : ${where === NOT_PROVIDED ? 'non renseigné dans le contrat' : `« ${where} »`}.` };
    case 'param':
      return { term: 'name', text: where === 'header' ? 'Le nom exact de l’en-tête à écrire, à la lettre : une faute de frappe et la clé n’est pas reconnue.'
        : where === 'query' ? 'Le nom exact du paramètre à ajouter dans l’adresse, à la lettre.'
        : where === 'cookie' ? 'Le nom exact du cookie, à la lettre.'
        : 'Le nom du champ qui porte la clé.' };
    case 'security': {
      if (!context.required.length) {
        return { term: 'security', text: 'Aucune exigence globale : chaque opération doit déclarer sa propre protection, faute de quoi elle reste ouverte à tous.' };
      }
      const { operations, inherited } = context;
      const reach = !operations ? ''
        : inherited === operations ? ` ${operations > 1 ? `Les ${operations} opérations utilisées par ce kiosque en héritent` : 'L’opération utilisée par ce kiosque en hérite'} : aucune ne déclare sa propre exigence.`
        : inherited === 0 ? ' Les opérations utilisées par ce kiosque déclarent chacune la leur.'
        : ` ${inherited} des ${operations} opérations utilisées par ce kiosque en héritent ; les autres déclarent la leur.`;
      return { term: 'security', text: `L’obligation : par défaut, toute opération exige ${context.required.map((name) => `« ${name} »`).join(', ')}. Les crochets « [] » listeraient des permissions précises (les « scopes ») : une clé d’API n’en a pas, ils restent vides.${reach}` };
    }
  }
}

/** Traduit en clair ce qu'exige le contrat, quand c'est une clé d'API : où la mettre et sous quel nom. */
function keyUsage(security: OasSecurity): OasKeyUsage | undefined {
  const scheme = security.schemes.find((candidate) =>
    security.required.includes(candidate.name) && candidate.type === 'apiKey' && candidate.parameter !== NOT_PROVIDED);
  if (!scheme) return undefined;
  const name = scheme.parameter;
  if (scheme.location === 'header') {
    return { requirement: `Pour être accepté, chaque appel doit porter l’en-tête « ${name} » avec votre clé.`, curlFlag: `-H "${name}: ${KEY_PLACEHOLDER}"` };
  }
  if (scheme.location === 'query') return { requirement: `Pour être accepté, chaque appel doit ajouter « ${name}=votre clé » à l’adresse, après le « ? ».` };
  if (scheme.location === 'cookie') return { requirement: `Pour être accepté, chaque appel doit envoyer un cookie « ${name} » contenant votre clé.` };
  return undefined;
}

function securityFocusOf(doc: Record<string, unknown>, security: OasSecurity, operations: readonly OasOperation[], totalOperations: number): OasSecurityFocus {
  const drafts = focusDrafts(doc, totalOperations);
  const numbers = new Map<FocusRole, number>();
  for (const line of drafts) if (line.role && !numbers.has(line.role)) numbers.set(line.role, numbers.size + 1);
  const raw = rawSchemesOf(doc);
  const context: NoteContext = {
    schemeCount: raw.length,
    scheme: security.schemes.find((scheme) => scheme.name === raw[0]?.[0]),
    required: security.required,
    inherited: operations.filter((operation) => operation.securityInherited).length,
    operations: operations.length,
    numberOf: (role) => numbers.get(role),
  };
  return {
    lines: drafts.map((line) => ({
      code: line.text,
      ...(line.role ? { note: numbers.get(line.role) } : {}),
      ...(line.role === 'in' || line.role === 'param' ? { hot: true } : {}),
      ...(line.muted ? { muted: true } : {}),
      ...(line.hint ? { hint: line.hint } : {}),
    })),
    notes: [...numbers].map(([role, n]) => ({ n, ...noteText(role, context) })),
    usage: keyUsage(security),
  };
}

/** Extrait, du contrat réel, les seules opérations utilisées par le kiosque. Une valeur absente reste « Non renseigné ». */
export function extractOasExcerpt(doc: unknown, wanted: readonly KioskOperation[] = KIOSK_OPERATIONS): OasExcerpt {
  if (!isRecord(doc) || !isRecord(doc['paths'])) throw new Error('le document reçu n’est pas un contrat OpenAPI (objet « paths » absent).');
  const paths = doc['paths'];
  const info = isRecord(doc['info']) ? doc['info'] : {};
  const servers = Array.isArray(doc['servers']) ? doc['servers'] : [];
  const server = isRecord(servers[0]) ? servers[0] : {};
  const totalOperations = Object.values(paths).reduce<number>((total, pathItem) =>
    total + (isRecord(pathItem) ? Object.entries(pathItem).filter(([key, value]) => HTTP_METHODS.has(key) && isRecord(value)).length : 0), 0);
  const security: OasSecurity = { schemes: securitySchemesOf(doc), required: requirementNames(doc['security']) };
  const operations: OasOperation[] = [];
  const missing: string[] = [];
  for (const item of wanted) {
    const pathItem = paths[item.path];
    const operation = isRecord(pathItem) ? pathItem[item.method] : undefined;
    if (!isRecord(pathItem) || !isRecord(operation)) { missing.push(`${item.method.toUpperCase()} ${item.path}`); continue; }
    const fields = [...parametersOf(doc, pathItem, operation), ...bodyFieldsOf(doc, operation)];
    const sent = item.sent.flatMap((name) => fields.filter((field) => field.name === name).slice(0, 1));
    const statuses = isRecord(operation['responses']) ? Object.keys(operation['responses']) : [];
    operations.push({
      key: `${item.method} ${item.path}`, method: item.method.toUpperCase(), path: item.path,
      summary: text(operation['summary']) ?? NOT_PROVIDED, usage: item.usage,
      sent, notFound: item.sent.filter((name) => !sent.some((field) => field.name === name)),
      otherCount: fields.length - sent.length,
      statuses, declaresErrors: statuses.some((code) => /^[45]/.test(code) || code === 'default'),
      security: securityOf(doc, operation),
      securityInherited: !Array.isArray(operation['security']),
    });
  }
  return {
    openapi: text(doc['openapi']) ?? NOT_PROVIDED, title: text(info['title']) ?? NOT_PROVIDED,
    version: text(info['version']) ?? NOT_PROVIDED, server: text(server['url']) ?? NOT_PROVIDED,
    totalPaths: Object.keys(paths).length, totalOperations,
    operations, missing, security,
    securityFocus: securityFocusOf(doc, security, operations, totalOperations),
  };
}
