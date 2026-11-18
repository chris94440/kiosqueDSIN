import { describe, expect, it } from 'vitest';
import { BEEKAST_SAMPLE, KEY_PLACEHOLDER } from './practice';
import {
  addCall, explainError, hasKeyPlaceholder, isKeyFormat, looksLikeSecret, maskSecrets, parseBeekast, parseSandboxEvent, prepareSandboxCode,
  readCall, SANDBOX_CALLS_MAX, SANDBOX_CHANNEL, sampleCode,
} from './sandbox';

describe('clé d’API dans le bac à sable', () => {
  it('remplace chaque occurrence du texte de substitution, et rien d’autre', () => {
    const code = `const A = '${KEY_PLACEHOLDER}'; // ${KEY_PLACEHOLDER}\nconst B = 'x';`;
    expect(hasKeyPlaceholder(code)).toBe(true);
    expect(hasKeyPlaceholder('const A = 1;')).toBe(false);
    expect(prepareSandboxCode(code, 'cle_123-ABC')).toBe("const A = 'cle_123-ABC'; // cle_123-ABC\nconst B = 'x';");
  });
  it('n’interprète pas les séquences spéciales de remplacement', () => {
    expect(prepareSandboxCode(KEY_PLACEHOLDER, 'a$&b-12345')).toBe('a$&b-12345');
  });
  it('n’accepte qu’une clé sans caractère capable de sortir de la chaîne ou de la balise', () => {
    expect(isKeyFormat('live_AbC123-xyz9')).toBe(true);
    for (const hostile of ['', 'court', 'avec espace 1234', "x';alert(1);//", '</script><b>', 'a'.repeat(121), 'clé-accentuée-1']) {
      expect(isKeyFormat(hostile), hostile).toBe(false);
    }
  });
  it('signale une vraie clé collée dans le code, mais pas le texte de substitution', () => {
    expect(looksLikeSecret(`const API_KEY = '${KEY_PLACEHOLDER}';`)).toBe(false);
    expect(looksLikeSecret("headers: { 'x-api-key': API_KEY }")).toBe(false);
    expect(looksLikeSecret("const API_KEY = 'abcdefghijklmnop1234';")).toBe(true);
    expect(looksLikeSecret('const k = "live_0123456789abcdefghij";')).toBe(true);
  });
  it('masque la clé saisie et les clés passées dans l’adresse avant tout affichage', () => {
    expect(maskSecrets('https://api.example/v1/x?api_key=SECRET123&q=1')).toBe('https://api.example/v1/x?api_key=•••&q=1');
    expect(maskSecrets('https://api.example/v1/mon-secret-9999/x', 'mon-secret-9999')).toBe('https://api.example/v1/•••/x');
    expect(maskSecrets('https://api.example/v1/x', 'ab')).toBe('https://api.example/v1/x');
  });
});

describe('messages reçus du cadre isolé', () => {
  const call = { channel: SANDBOX_CHANNEL, type: 'call', method: 'GET', url: 'https://api.thecatapi.com/v1/breeds', status: 200, ms: 120 };
  it('retient un message de forme connue', () => {
    expect(parseSandboxEvent({ channel: SANDBOX_CHANNEL, type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseSandboxEvent({ channel: SANDBOX_CHANNEL, type: 'escape' })).toEqual({ type: 'escape' });
    expect(parseSandboxEvent(call)).toEqual({ type: 'call', method: 'GET', url: 'https://api.thecatapi.com/v1/breeds', status: 200, ms: 120 });
    expect(parseSandboxEvent({ channel: SANDBOX_CHANNEL, type: 'error', message: 'Boom' })).toEqual({ type: 'error', message: 'Boom' });
  });
  it('ignore tout le reste : autre canal, forme inattendue, valeurs hors bornes', () => {
    for (const hostile of [null, 'texte', 42, {}, { ...call, channel: 'autre' }, { ...call, method: 'get' }, { ...call, method: 'GET /x' },
      { ...call, status: 99999 }, { ...call, status: 2.5 }, { ...call, ms: -1 }, { ...call, url: 12 }, { ...call, type: 'exec' },
      { channel: SANDBOX_CHANNEL, type: 'error', message: { html: '<b>' } }]) {
      expect(parseSandboxEvent(hostile), JSON.stringify(hostile)).toBeNull();
    }
  });
  it('borne la longueur de ce qui sera affiché', () => {
    const long = parseSandboxEvent({ ...call, url: `https://api.thecatapi.com/${'x'.repeat(500)}` });
    expect(long?.type === 'call' && long.url.length).toBe(200);
    const message = parseSandboxEvent({ channel: SANDBOX_CHANNEL, type: 'error', message: 'e'.repeat(900) });
    expect(message?.type === 'error' && message.message.length).toBe(300);
  });
  it('tient un journal borné, numéroté, sans clé en clair', () => {
    let calls = addCall([], { type: 'call', method: 'GET', url: 'https://x/?api_key=ABC', status: 200, ms: 5 });
    expect(calls).toEqual([{ n: 1, method: 'GET', url: 'https://x/?api_key=•••', status: 200, ms: 5 }]);
    for (let i = 0; i < SANDBOX_CALLS_MAX + 5; i++) calls = addCall(calls, { type: 'call', method: 'GET', url: 'u', status: 200, ms: 1 });
    expect(calls).toHaveLength(SANDBOX_CALLS_MAX);
    expect(calls[calls.length - 1].n).toBe(SANDBOX_CALLS_MAX + 6);
  });
  it('explique en clair les statuts les plus courants', () => {
    expect(readCall(200).tone).toBe('ok');
    expect(readCall(403).text).toMatch(/clé est absente ou invalide/);
    expect(readCall(404).text).toMatch(/Introuvable/);
    expect(readCall(429).text).toMatch(/10 requêtes par minute/);
    expect(readCall(0).text).toMatch(/thecatapi\.com/);
    expect(readCall(503).tone).toBe('erreur');
  });
  it('transforme les erreurs courantes d’une page générée en conseil, et reste muet sur les autres', () => {
    expect(explainError("Uncaught SecurityError: Failed to read the 'localStorage' property from 'Window'")).toMatch(/en mémoire/);
    expect(explainError('Bloqué par la fenêtre isolée : https://fonts.googleapis.com/css')).toMatch(/thecatapi\.com/);
    expect(explainError('Promesse rejetée : Failed to fetch')).toMatch(/CORS/);
    expect(explainError('ReferenceError: x is not defined')).toBe('');
  });
});

describe('résultat Beekast lu pour l’application de vote', () => {
  it('lit l’exemple fictif en ignorant sa ligne d’avertissement', () => {
    expect(parseBeekast(BEEKAST_SAMPLE)).toEqual([
      { nom: 'Chartreux', score: 14 }, { nom: 'Maine Coon', score: 11 }, { nom: 'Bengal', score: 9 }, { nom: 'Sphynx', score: 4 },
    ]);
  });
  it('accepte les présentations courantes d’un export', () => {
    expect(parseBeekast('1. Chartreux — 14\nMaine Coon (11)\nBengal\t9\nSphynx 4,5\nPersan: 35%')).toEqual([
      { nom: 'Chartreux', score: 14 }, { nom: 'Maine Coon', score: 11 }, { nom: 'Bengal', score: 9 }, { nom: 'Sphynx', score: 4.5 }, { nom: 'Persan', score: 35 },
    ]);
  });
  it('laisse un score illisible à null au lieu de l’inventer, et borne le nombre d’options', () => {
    expect(parseBeekast('Siamois : beaucoup\nBirman : 3')).toEqual([{ nom: 'Siamois', score: null }, { nom: 'Birman', score: 3 }]);
    expect(parseBeekast(Array.from({ length: 30 }, (_, i) => `Race${i} : ${i}`).join('\n'))).toHaveLength(12);
    expect(parseBeekast('')).toEqual([]);
  });
});

describe('pages d’exemple', () => {
  it('suivent les consignes des prompts : clé en constante, textContent, erreur affichée, jamais de vraie clé', () => {
    for (const page of [sampleCode('fiche', ''), sampleCode('vote', '')]) {
      expect(page).toContain(`const API_KEY = '${KEY_PLACEHOLDER}';`);
      expect(page).toContain("'x-api-key': API_KEY");
      expect(page).toContain('textContent');
      expect(page).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write|eval\(/);
      expect(page).toMatch(/reponse\.status/);
      expect(looksLikeSecret(page)).toBe(false);
    }
    expect(sampleCode('fiche', '')).toContain('https://api.thecatapi.com/v1/breeds/char');
    expect(sampleCode('vote', '')).toContain('https://api.thecatapi.com/v1/breeds');
  });
  it('intègrent le résultat Beekast du participant, ou l’exemple fictif à défaut', () => {
    expect(sampleCode('vote', 'Persan : 7')).toContain('const RESULTAT_BEEKAST = [{"nom":"Persan","score":7}];');
    expect(sampleCode('vote', '')).toContain('"nom":"Chartreux","score":14');
    expect(sampleCode('vote', '   ')).toContain('"nom":"Sphynx","score":4');
  });
  it('ne laissent pas un nom collé refermer la balise script ni détourner le remplacement', () => {
    const page = sampleCode('vote', '</script><img src=x> : 3\n$& : 2');
    expect(page.match(/<\/script>/g)).toHaveLength(1);
    expect(page).toContain('\\u003c/script>');
    expect(page).toContain('"nom":"$&","score":2');
    expect(page).not.toContain('__RESULTAT__');
  });
});
