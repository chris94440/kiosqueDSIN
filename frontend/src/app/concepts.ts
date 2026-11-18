/** Contenus pédagogiques des étapes : le langage ubiquitaire (DDD), les temps d'API first, l'échelle de Richardson. */

export interface ChainLink { stage: string; word: string; note: string; }

/** Le même mot, de la réunion métier jusqu'au prompt : c'est cela, un langage ubiquitaire. */
export const UBIQUITOUS_CHAIN: readonly ChainLink[] = [
  { stage: 'Réunion métier', word: 'race', note: 'Le métier choisit le mot et lui donne un sens précis.' },
  { stage: 'Écran', word: 'Race', note: 'Le filtre, les cartes et la fiche emploient le même mot.' },
  { stage: 'Contrat OAS', word: '/breeds', note: 'Le contrat écrit le même mot, en anglais (« breeds » pour « races »), avec sa correspondance dans le glossaire.' },
  { stage: 'Appel', word: 'GET /breeds', note: 'Le verbe GET « lit » les races : le mot ne bouge plus.' },
  { stage: 'Prompt IA', word: 'race (breed)', note: 'L’IA reçoit le mot du métier et son équivalent dans l’API.' },
];

export interface PlainTerm { id: string; term: string; tagline: string; plain: string; here: string; }

/** Les trois mots de l'introduction, expliqués sans jargon, chacun relié à ce que le kiosque en fait. */
export const PLAIN_TERMS: readonly PlainTerm[] = [
  { id: 'domaine', term: 'Le domaine', tagline: 'Le sujet dont on parle.',
    plain: 'C’est le métier pour lequel on construit l’application, avec ses idées, ses règles et ses mots. Ce n’est ni la base de données, ni l’écran, ni le code.',
    here: 'Choisir le Chief Happiness Chat : des races, des photos, un tempérament, une espérance de vie.' },
  { id: 'ddd', term: 'DDD', tagline: 'Concevoir à partir du métier.',
    plain: 'Domain-Driven Design, soit « conception pilotée par le domaine ». On comprend d’abord le sujet avec les personnes qui le connaissent ; la technique vient ensuite le servir, et non l’inverse.',
    here: 'On est parti du besoin de la DSIN, pas du JSON ni de l’écran.' },
  { id: 'ubiquitaire', term: 'Langage ubiquitaire', tagline: 'Les mêmes mots, partout.',
    plain: '« Ubiquitaire » veut dire « présent partout ». C’est un mini-dictionnaire commun : chaque mot a un seul sens, et le métier comme l’équipe technique l’emploient en réunion, à l’écran, dans l’API, dans le code et dans les prompts.',
    here: '« Race » désigne toujours une race de chat, comme le Chartreux : jamais une photo, jamais un chat précis.' },
];

export interface GlossaryTerm { business: string; api: string; where: string; }

/** Le glossaire met en face les mots du métier (français) et ceux de l'API (anglais). */
export const GLOSSARY: readonly GlossaryTerm[] = [
  { business: 'Race', api: 'breed', where: 'ressource /breeds' },
  { business: 'Photo', api: 'image', where: 'ressource /images/search' },
  { business: 'Chat individuel', api: 'pet', where: 'ressource /pets, qui référence sa race par breed_id (non utilisée ici)' },
  { business: 'Favori', api: 'favourite', where: 'ressource /favourites' },
  { business: 'Tempérament', api: 'temperament', where: 'champ temperament' },
  { business: 'Espérance de vie', api: 'life_span', where: 'champ life_span' },
  { business: 'Pays d’origine', api: 'origin, country_code', where: 'champs origin et country_code' },
];

export interface ApiFirstStep { title: string; text: string; }

export const API_FIRST_STEPS: readonly ApiFirstStep[] = [
  { title: 'Parler le même langage', text: 'Le métier et l’informatique fixent ensemble le vocabulaire : les choses dont on parle, leurs informations, leurs règles. C’est le langage ubiquitaire de l’étape 1.' },
  { title: 'Écrire le contrat', text: 'On décrit l’API dans un contrat (au format OpenAPI) avant d’écrire le code : les adresses, les informations échangées, les réponses, les erreurs, les accès.' },
  { title: 'Relire et simuler', text: 'Le métier et ceux qui utiliseront l’API relisent le contrat. Une simulation (un « mock ») permet de l’essayer avant même qu’elle existe.' },
  { title: 'Développer en parallèle', text: 'Le serveur et les écrans (ou les traitements, ou l’IA) avancent en même temps, face au même contrat. Des tests automatiques vérifient qu’il est respecté.' },
];

export interface RichardsonLevel { level: 0 | 1 | 2 | 3; name: string; plain: string; idea: string; example: string; chosen: boolean; }

/** Les exemples sont illustratifs ; seuls ceux des niveaux 1 et 2 correspondent aux appels réels du kiosque. */
export const RICHARDSON: readonly RichardsonLevel[] = [
  { level: 0, name: 'Un seul point d’entrée', chosen: false,
    plain: 'Un seul guichet pour tout : quelle que soit la demande, la réponse dit « bien reçu ». À vous de lire le détail pour savoir si cela a marché.',
    idea: 'HTTP n’est qu’un tuyau : une seule adresse, toujours POST, toujours 200. L’action et l’erreur sont cachées dans le corps du message.',
    example: 'POST /api avec { "action": "lireRace", "id": "char" } → 200 (exemple fictif)' },
  { level: 1, name: 'Des ressources', chosen: false,
    plain: 'Un guichet par sujet : un pour les races, un pour les photos. Chaque chose a sa propre adresse.',
    idea: 'Chaque chose a sa propre adresse : on ne parle plus à un guichet unique, on désigne une ressource.',
    example: '/breeds/char' },
  { level: 2, name: 'Des verbes et des statuts', chosen: true,
    plain: 'Des gestes clairs (consulter, déposer) et un tampon qui dit le résultat : accepté, refusé, introuvable.',
    idea: 'Le verbe dit l’intention (GET lit, POST écrit) et le statut dit le résultat (200, 403, 404, 429…). Le sens est porté par HTTP.',
    example: 'GET /breeds/char → 200 · GET /breeds/zzz → 404' },
  { level: 3, name: 'L’hypermédia', chosen: false,
    plain: 'En plus, la réponse indique où aller ensuite, comme les liens d’une page web.',
    idea: 'La réponse contient les liens vers les actions possibles : le client suit les liens au lieu de les connaître d’avance (HATEOAS).',
    example: '{ "id": "char", "liens": [ "/images/search?breed_ids=char" ] } (exemple fictif)' },
];

export interface WebBasic { name: string; role: string; }

export const WEB_BASICS: readonly WebBasic[] = [
  { name: 'HTML', role: 'la structure de la page : titres, cartes, boutons.' },
  { name: 'CSS', role: 'la mise en forme : couleurs, grille, tailles.' },
  { name: 'JavaScript', role: 'le comportement : c’est lui qui appelle l’API (avec fetch) et qui remplit la page.' },
];
