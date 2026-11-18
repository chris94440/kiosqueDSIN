import { describe, expect, it } from 'vitest';
import { API_FIRST_STEPS, GLOSSARY, PLAIN_TERMS, RICHARDSON, UBIQUITOUS_CHAIN, WEB_BASICS } from './concepts';
import { JARGON, jargonById, searchJargon } from './jargon';
import { JOURNEY } from './journey';
import { STEP_PLAIN } from './plain';
import { typo } from './typography';

const stepIds = JOURNEY.map((step) => step.id);
const rank = (id: string) => stepIds.findIndex((stepId) => stepId === id);

describe('dico du jargon', () => {
  it('donne à chaque mot un identifiant unique, une étape connue et une vraie définition', () => {
    expect(new Set(JARGON.map((item) => item.id)).size).toBe(JARGON.length);
    for (const item of JARGON) {
      expect(item.term.trim(), item.id).not.toBe('');
      expect(item.plain.trim().length, item.id).toBeGreaterThan(20);
      expect(rank(item.step), item.id).toBeGreaterThanOrEqual(0);
    }
  });
  it('retrouve un mot sans tenir compte des accents, de la casse ni des espaces autour', () => {
    for (const query of ['requete', 'REQUÊTE', '  Requête  ']) expect(searchJargon(query).map((item) => item.id)).toContain('requete');
    expect(searchJargon('403').map((item) => item.id)).toContain('statut-http');
    expect(searchJargon('api key').map((item) => item.id)).toContain('cle-api');
  });
  it('place les mots dont le nom correspond avant ceux qui n’en parlent que dans leur définition', () => {
    const ids = searchJargon('prompt').map((item) => item.id);
    expect(ids[0]).toBe('prompt');
    expect(ids.length).toBeGreaterThan(1);
  });
  it('liste tout, par ordre alphabétique, quand la recherche est vide, et rien pour un mot inconnu', () => {
    const terms = searchJargon('').map((item) => item.term);
    expect(terms).toHaveLength(JARGON.length);
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })));
    expect(searchJargon('zzz-mot-inconnu')).toEqual([]);
    expect(jargonById('zzz-mot-inconnu')).toBeUndefined();
  });
});

describe('« En deux mots » de chaque étape', () => {
  it('couvre les cinq étapes, avec uniquement des mots présents dans le dico', () => {
    expect(Object.keys(STEP_PLAIN)).toEqual(stepIds);
    for (const step of JOURNEY) {
      const plain = STEP_PLAIN[step.id];
      for (const text of [plain.question, plain.inShort, plain.analogy, plain.youWillDo]) expect(text.trim(), step.id).not.toBe('');
      expect(plain.questions.length, step.id).toBe(3);
      for (const question of plain.questions) {
        expect(question.audience.trim(), step.id).not.toBe('');
        expect(question.text.trim(), step.id).not.toBe('');
        expect(question.answer.trim(), step.id).not.toBe('');
      }
      expect(plain.words.length, step.id).toBeGreaterThan(0);
      expect(new Set(plain.words).size, step.id).toBe(plain.words.length);
      for (const word of plain.words) expect(jargonById(word), `${step.id} : ${word}`).toBeDefined();
    }
  });
  it('n’annonce jamais un mot dans une étape plus tôt que celle indiquée dans le dico', () => {
    for (const step of JOURNEY) {
      for (const word of STEP_PLAIN[step.id].words) expect(rank(jargonById(word)?.step ?? ''), `${word} dans ${step.id}`).toBeLessThanOrEqual(rank(step.id));
    }
  });
});

describe('textes pédagogiques', () => {
  it('ne contiennent jamais de clé d’API', () => {
    const texts = [
      ...JARGON.flatMap((item) => [item.term, item.plain, item.like ?? '', ...item.aka]),
      ...Object.values(STEP_PLAIN).flatMap((plain) => [
        plain.question, plain.inShort, plain.analogy, plain.youWillDo,
        ...plain.questions.flatMap((question) => [question.audience, question.text, question.answer]),
      ]),
    ];
    expect(texts.filter((text) => /live_[\w-]/i.test(text))).toEqual([]);
  });
  it('ne contiennent aucune consigne d’animateur : l’écran est diffusé en direct', () => {
    const screen = JSON.stringify([JARGON, STEP_PLAIN, JOURNEY, API_FIRST_STEPS, GLOSSARY, PLAIN_TERMS, RICHARDSON, UBIQUITOUS_CHAIN, WEB_BASICS]);
    expect(screen.match(/animat|présentat|voix haute|répétition|repère/gi) ?? []).toEqual([]);
  });
  it('colle les signes doubles à leur mot avec une espace insécable, à la française', () => {
    expect(typo('Pourquoi ? Parce que : voilà ; bravo ! « oui »')).toBe('Pourquoi\u00a0? Parce que\u00a0: voilà\u00a0; bravo\u00a0! «\u00a0oui\u00a0»');
    expect(typo('GET /breeds?limit=1')).toBe('GET /breeds?limit=1');
  });
});
