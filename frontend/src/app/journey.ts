export type StepId = 'besoin' | 'contrat' | 'appels' | 'ia' | 'bilan';
export type MissionId = 'mots' | 'contrat' | 'sans-cle' | 'avec-cle' | 'page-ia' | 'search' | 'local' | 'fiche' | 'prompt' | 'vote';
export type StepStatus = 'todo' | 'current' | 'done';

export interface Mission { id: MissionId; label: string; }
export interface JourneyStep {
  id: StepId;
  number: number;
  title: string;
  /** Sigle ou thème technique, tel qu'on le rencontre dans les documents : DDD, API first… */
  theme: string;
  /** Le même thème en mots de tous les jours. */
  themePlain: string;
  minutes: number;
  /** Ce que le visiteur sait faire à la fin de l'étape. */
  goal: string;
  missions: readonly Mission[];
}

/** Les étapes suivent le conducteur de SYNOPSIS.md ; chaque étape porte une thématique et un objectif. */
export const JOURNEY: readonly JourneyStep[] = [
  { id: 'besoin', number: 1, title: 'Découvrir', theme: 'Phase 1', themePlain: 'Découvrir l’API des chats',   minutes: 2,
    goal: 'Tester un premier appel curl sans clé puis avec clé, et lire ce que la réponse raconte vraiment.',
    missions: [
      { id: 'sans-cle', label: 'Lancer un appel sans clé et constater le 403 attendu' },
      { id: 'avec-cle', label: 'Relancer avec une clé et observer la réponse 200' },
    ] },
  { id: 'contrat', number: 2, title: 'Atelier IA', theme: 'Phase 2', themePlain: 'Du curl à la page web',   minutes: 2,
    goal: 'Avec Copilot Covéa, passer d’un appel curl à une page web qui appelle l’API en gardant la clé sous contrôle.',
    missions: [
      { id: 'contrat', label: 'Ouvrir une ligne du contrat pour voir ce qu’elle permet' },
      { id: 'page-ia', label: 'Copier le prompt (la consigne) qui fait écrire une page web à l’IA' },
    ] },
  { id: 'appels', number: 3, title: 'Concepts', theme: 'Phase 3', themePlain: 'Standards web & architecture',   minutes: 2,
    goal: 'Voir comment API first, Richardson N2 et SPA permettent d’intégrer vite, avec un front séparé du BFF.',
    missions: [
      { id: 'search', label: 'Lire un appel dans « L’API à la loupe »' },
    ] },
  { id: 'ia', number: 4, title: 'Autre application', theme: 'Phase 4', themePlain: 'Vote de chat partagé',   minutes: 2,
    goal: 'Montrer qu’une même API peut alimenter une autre application métier : ici un vote partagé du chat DSIN.',
    missions: [
      { id: 'vote', label: 'Enregistrer un vote partagé et vérifier le classement' },
    ] },
  { id: 'bilan', number: 5, title: 'Conclusion', theme: 'Phase 5', themePlain: 'Bilan final',   minutes: 2,
    goal: 'Conclure l’atelier avec les messages clés : standards, séparation front/BFF, réutilisation et performance API.',
    missions: [{ id: 'prompt', label: 'Valider la conclusion de l’atelier' }] },
];

export const DEFAULT_STEP: StepId = 'besoin';
const MISSIONS = JOURNEY.flatMap((step) => step.missions.map((mission) => ({ step, mission })));
export const TOTAL_MISSIONS = MISSIONS.length;

export function stepById(id: StepId): JourneyStep {
  return JOURNEY.find((step) => step.id === id) ?? JOURNEY[0];
}

export function missionLabel(id: MissionId): string {
  return MISSIONS.find((entry) => entry.mission.id === id)?.mission.label ?? id;
}

export function stepFromHash(hash: string): StepId | null {
  const id = hash.replace(/^#/, '');
  return JOURNEY.find((step) => step.id === id)?.id ?? null;
}

/** Étape voisine, sans rebouclage : sert aux boutons « précédent » et « suivant ». */
export function adjacentStep(current: StepId, offset: 1 | -1): JourneyStep | null {
  return JOURNEY[JOURNEY.findIndex((step) => step.id === current) + offset] ?? null;
}

/** Navigation clavier d'une liste d'onglets : flèches avec rebouclage, Début et Fin. */
export function stepForKey(current: StepId, key: string): StepId | null {
  const index = JOURNEY.findIndex((step) => step.id === current);
  if (index < 0) return null;
  const last = JOURNEY.length - 1;
  if (key === 'ArrowRight') return JOURNEY[index === last ? 0 : index + 1].id;
  if (key === 'ArrowLeft') return JOURNEY[index === 0 ? last : index - 1].id;
  if (key === 'Home') return JOURNEY[0].id;
  if (key === 'End') return JOURNEY[last].id;
  return null;
}

export function stepStatus(step: JourneyStep, done: ReadonlySet<MissionId>, visited: ReadonlySet<StepId>): StepStatus {
  if (step.missions.every((mission) => done.has(mission.id))) return 'done';
  return visited.has(step.id) || step.missions.some((mission) => done.has(mission.id)) ? 'current' : 'todo';
}

export function progress(done: ReadonlySet<MissionId>): { done: number; total: number } {
  return { done: MISSIONS.filter((entry) => done.has(entry.mission.id)).length, total: TOTAL_MISSIONS };
}

/** Première mission non réussie, dans l'ordre du parcours : indique au visiteur où aller ensuite. */
export function nextMission(done: ReadonlySet<MissionId>): { step: JourneyStep; mission: Mission } | null {
  return MISSIONS.find((entry) => !done.has(entry.mission.id)) ?? null;
}
