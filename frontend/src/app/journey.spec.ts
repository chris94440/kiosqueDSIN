import { describe, expect, it } from 'vitest';
import { adjacentStep, JOURNEY, MissionId, missionLabel, nextMission, progress, StepId, stepById, stepForKey, stepFromHash, stepStatus, TOTAL_MISSIONS } from './journey';

const none = new Set<MissionId>();
const call = stepById('appels');

describe('parcours pédagogique', () => {
  it('suit un parcours continu avec un objectif et une ou plusieurs missions par étape', () => {
    expect(JOURNEY.map((step) => step.id)).toEqual(['besoin', 'contrat', 'appels', 'ia', 'bilan']);
    expect(JOURNEY.every((step) => step.missions.length > 0 && step.goal.trim().length > 0)).toBe(true);
    expect(JOURNEY.reduce((total, step) => total + step.minutes, 0)).toBe(10);
    expect(new Set(JOURNEY.flatMap((step) => step.missions.map((mission) => mission.id))).size).toBe(TOTAL_MISSIONS);
  });
  it('lit l’étape dans l’ancre de l’URL et ignore toute valeur inconnue', () => {
    expect(stepFromHash('#ia')).toBe('ia');
    expect(stepFromHash('appels')).toBe('appels');
    for (const hash of ['', '#', '#inconnu', '#IA', '#ia/../x']) expect(stepFromHash(hash)).toBeNull();
  });
  it('navigue au clavier avec rebouclage, Début et Fin', () => {
    expect(stepForKey('besoin', 'ArrowRight')).toBe('contrat');
    expect(stepForKey('bilan', 'ArrowRight')).toBe('besoin');
    expect(stepForKey('besoin', 'ArrowLeft')).toBe('bilan');
    expect(stepForKey('appels', 'Home')).toBe('besoin');
    expect(stepForKey('appels', 'End')).toBe('bilan');
    expect(stepForKey('appels', 'Enter')).toBeNull();
  });
  it('propose une étape précédente et suivante sans rebouclage', () => {
    expect(adjacentStep('besoin', -1)).toBeNull();
    expect(adjacentStep('besoin', 1)?.id).toBe('contrat');
    expect(adjacentStep('bilan', 1)).toBeNull();
    expect(adjacentStep('bilan', -1)?.id).toBe('ia');
  });
  it('distingue à faire, en cours et terminée', () => {
    const visited = new Set<StepId>(['appels']);
    expect(stepStatus(call, none, new Set())).toBe('todo');
    expect(stepStatus(call, none, visited)).toBe('current');
    expect(stepStatus(call, new Set<MissionId>(['search']), new Set())).toBe('done');
    expect(stepStatus(call, new Set<MissionId>(['search']), visited)).toBe('done');
    expect(stepStatus(call, new Set<MissionId>(['search']), new Set())).toBe('done');
  });
  it('compte les missions réussies et désigne la suivante dans l’ordre du parcours', () => {
    expect(progress(none)).toEqual({ done: 0, total: TOTAL_MISSIONS });
    expect(nextMission(none)?.mission.id).toBe('sans-cle');
    const done = new Set<MissionId>(['sans-cle', 'contrat', 'search']);
    expect(progress(done).done).toBe(3);
    expect(nextMission(done)).toMatchObject({ step: { id: 'besoin' }, mission: { id: 'avec-cle' } });
    const practised = new Set<MissionId>(['sans-cle', 'avec-cle', 'contrat', 'page-ia', 'search']);
    expect(nextMission(practised)).toMatchObject({ step: { id: 'ia' }, mission: { id: 'vote' } });
    const all = new Set<MissionId>(JOURNEY.flatMap((step) => step.missions.map((mission) => mission.id)));
    expect(progress(all).done).toBe(TOTAL_MISSIONS);
    expect(nextMission(all)).toBeNull();
  });
  it('retrouve le libellé d’une mission', () => {
    expect(missionLabel('vote')).toMatch(/vote/i);
    expect(missionLabel('sans-cle')).toMatch(/sans clé/);
  });
  it('ne termine l’étape du contrat que lorsque la pratique curl et IA est réussie', () => {
    const contract = stepById('contrat');
    expect(stepStatus(contract, new Set<MissionId>(['contrat']), new Set())).toBe('current');
    expect(stepStatus(contract, new Set<MissionId>(['contrat', 'page-ia']), new Set())).toBe('done');
  });
});
