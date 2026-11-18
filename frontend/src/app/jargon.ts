import { StepId } from './journey';
import { normalize } from './cat.models';
import { typo } from './typography';

export interface JargonEntry {
  readonly id: string;
  readonly term: string;
  /** Définition courte, qui n'emploie que des mots déjà expliqués dans le dictionnaire. */
  readonly plain: string;
  /** Comparaison avec la vie courante. */
  readonly like?: string;
  /** Étape où le mot apparaît pour la première fois. */
  readonly step: StepId;
  /** Autres façons de chercher le mot : sigle, anglais, synonyme. */
  readonly aka: readonly string[];
}

const entry = (id: string, term: string, step: StepId, plain: string, like: string | undefined, aka: readonly string[] = []): JargonEntry =>
  ({ id, term: typo(term), step, plain: typo(plain), ...(like ? { like: typo(like) } : {}), aka });

/** Le dictionnaire du kiosque : chaque mot technique rencontré dans le parcours, expliqué à une personne qui n'est pas informaticienne. */
export const JARGON: readonly JargonEntry[] = [
  entry('api', 'API', 'besoin',
    'Un guichet réservé aux logiciels : un programme y dépose une demande rédigée selon un format précis et reçoit une réponse, sans jamais voir ce qui se passe derrière.',
    'Comme le guichet d’une mairie : on ne voit pas les bureaux, mais on sait quoi demander et comment.',
    ['interface de programmation', 'service web', 'web service']),
  entry('ressource', 'Ressource', 'besoin',
    'Une « chose » du métier que l’API met à disposition et qui a sa propre adresse : les races, les photos, les favoris…',
    'Comme un dossier dans une armoire : chacun a son étiquette.',
    ['resource', 'objet métier']),
  entry('ddd', 'DDD (Domain-Driven Design)', 'besoin',
    'Une façon de concevoir un logiciel en partant du métier et de ses mots, avec les personnes qui le connaissent. La technique vient ensuite, pour servir le métier.',
    'Comme un architecte qui écoute d’abord comment vous vivez avant de dessiner la maison.',
    ['Domain-Driven Design', 'conception pilotée par le domaine']),
  entry('domaine', 'Domaine', 'besoin',
    'Le sujet dont parle le logiciel, avec ses idées, ses règles et ses mots. Ici : choisir une mascotte parmi des races de chats.',
    undefined, ['métier', 'domain']),
  entry('ubiquitaire', 'Langage ubiquitaire', 'besoin',
    'Un vocabulaire commun où chaque mot a un seul sens, employé partout par le métier comme par les équipes techniques : en réunion, à l’écran, dans l’API, dans le code et dans les prompts. « Ubiquitaire » veut dire « présent partout ».',
    'Comme un mini-dictionnaire d’entreprise que tout le monde respecte.',
    ['ubiquitous language', 'vocabulaire commun', 'glossaire']),
  entry('acl', 'Couche anti-corruption', 'besoin',
    'Un traducteur placé à la frontière entre deux mondes : il convertit les mots et les formats du fournisseur vers ceux de votre métier, pour que le vocabulaire extérieur ne s’infiltre pas partout dans votre code.',
    'Comme un interprète lors d’une réunion internationale.',
    ['anti-corruption layer', 'ACL', 'traduction', 'parseBreed']),
  entry('monolithe', 'Monolithe et microservices', 'besoin',
    'Un monolithe est une application d’un seul bloc ; des microservices sont plusieurs petits services indépendants qui se parlent par API. Le DDD n’impose ni l’un ni l’autre.',
    undefined, ['microservice', 'monolithique']),
  entry('contrat-api', 'Contrat d’API', 'contrat',
    'Le document qui décrit à l’avance ce qu’on peut demander à une API, comment le demander et ce qu’elle répondra, y compris quand elle refuse.',
    'Comme la carte d’un restaurant : on sait ce qu’on peut commander avant d’entrer, mais pas comment le plat est cuisiné.',
    ['spécification', 'spec', 'documentation d’API']),
  entry('openapi', 'OpenAPI (OAS)', 'contrat',
    'Le format standard pour écrire un contrat d’API dans un fichier, lisible par les humains comme par les outils. Swagger est le nom historique de ce format et des outils qui le lisent.',
    undefined, ['OAS', 'Swagger', 'openapi.json']),
  entry('api-first', 'API first', 'contrat',
    'Une méthode : on écrit et on valide le contrat de l’API avec le métier avant de coder. Ensuite, le serveur et les écrans avancent en parallèle, chacun face au même contrat.',
    'Comme valider les plans d’une maison avant de poser la première brique.',
    ['contract first', 'contrat d’abord']),
  entry('endpoint', 'Endpoint (point d’accès)', 'contrat',
    'L’adresse précise d’une ressource ou d’une action dans l’API, par exemple /breeds. Une API en propose plusieurs.',
    undefined, ['route', 'chemin', 'path', 'url', 'adresse']),
  entry('requete', 'Requête et réponse', 'besoin',
    'La requête est la demande envoyée à l’API ; la réponse est ce qu’elle renvoie, accompagnée d’un code qui dit si tout s’est bien passé. L’ensemble s’appelle un appel.',
    'Comme un courrier et sa réponse avec accusé de réception.',
    ['request', 'response', 'appel', 'appel d’API']),
  entry('http', 'HTTP', 'contrat',
    'Le langage standard que parlent les navigateurs et les serveurs pour échanger sur le Web. Il définit les méthodes (GET, POST…) et les statuts (200, 404…).',
    'Comme le protocole postal : tout le monde sait comment on adresse un courrier, on l’envoie et on en accuse réception.',
    ['https', 'protocole']),
  entry('methode-http', 'Méthode HTTP (GET, POST…)', 'besoin',
    'Le verbe qui dit ce qu’on veut faire. GET consulte sans rien modifier ; POST envoie des informations pour créer quelque chose ou déclencher une action.',
    'Comme choisir, au guichet, entre « consulter un dossier » et « déposer un dossier ».',
    ['GET', 'POST', 'PUT', 'DELETE', 'verbe', 'méthode']),
  entry('statut-http', 'Statut HTTP (200, 403, 404…)', 'contrat',
    'Un nombre à trois chiffres qui résume le résultat d’un appel : 200 = réussi, 403 = accès refusé, 404 = introuvable, 429 = trop de demandes, 5xx = panne côté serveur.',
    'Comme le tampon posé par l’agent au guichet : accepté, refusé, introuvable.',
    ['code HTTP', 'code retour', 'status', '200', '201', '400', '401', '403', '404', '409', '429', '500', '503']),
  entry('json', 'JSON', 'contrat',
    'Un format texte pour échanger des données : une liste d’intitulés et de valeurs, lisible par les humains comme par les programmes. Exemple : { "name": "Siamois" }.',
    'Comme une fiche à remplir : chaque case a un intitulé et une valeur.',
    ['format de données']),
  entry('cle-api', 'Clé d’API', 'contrat',
    'Un code secret qui identifie celui qui appelle l’API, comme un badge. On ne le partage pas, on ne le colle ni dans un prompt ni dans une page publique.',
    'Comme le badge d’accès d’un bâtiment : s’il est copié, n’importe qui peut entrer en votre nom.',
    ['api key', 'x-api-key', 'secret', 'jeton', 'token']),
  entry('en-tete', 'En-tête (header)', 'contrat',
    'Une information jointe à une requête ou à une réponse, à côté du contenu : qui appelle, quel format, quelle clé…',
    'Comme l’étiquette collée sur un colis : elle sert au transport, pas au contenu.',
    ['header', 'Location', 'Content-Type']),
  entry('quota', 'Quota (limite d’appels)', 'contrat',
    'Le nombre maximum d’appels autorisés sur une durée donnée, ici 10 par minute. Au-delà, l’API répond 429 et il faut patienter.',
    'Comme un distributeur de billets qui limite les retraits par jour.',
    ['rate limit', '429', 'limite', 'débit']),
  entry('curl', 'curl', 'contrat',
    'Un petit outil à taper en ligne de commande pour appeler une API sans écran ni application : une seule ligne suffit. Pratique pour essayer un contrat.',
    'Comme téléphoner directement au guichet plutôt que de passer par un site web.',
    ['ligne de commande', 'terminal', 'PowerShell']),
  entry('certificat', 'Certificat (HTTPS, TLS)', 'contrat',
    'La carte d’identité numérique d’un site : elle prouve qu’on parle bien au bon serveur et permet de chiffrer l’échange (le cadenas du navigateur). Un proxy d’entreprise peut empêcher de vérifier qu’un certificat n’a pas été révoqué : c’est l’erreur possible de l’atelier curl.',
    undefined, ['SSL', 'TLS', 'HTTPS', 'cadenas', 'révocation', 'proxy', 'Schannel']),
  entry('prompt', 'Prompt', 'contrat',
    'Le texte qu’on donne à une IA pour lui dire ce qu’on attend : le contexte, les données, les consignes et le format de la réponse.',
    'Comme le brief qu’on remet à un stagiaire avant de lui confier une tâche.',
    ['consigne', 'instruction', 'invite']),
  entry('ia-generative', 'IA générative', 'contrat',
    'Un programme qui produit du texte, du code ou des images à partir d’une consigne. Il devine des suites plausibles, sans garantie qu’elles soient exactes : il faut vérifier.',
    'Comme un correcteur automatique géant qui complète vos phrases : souvent juste, parfois faux avec aplomb.',
    ['IA', 'intelligence artificielle', 'LLM', 'modèle de langage', 'Copilot', 'GPT', 'ChatGPT']),
  entry('javascript', 'JavaScript, HTML, CSS', 'contrat',
    'Les trois ingrédients d’une page web : HTML pour la structure, CSS pour la mise en forme, JavaScript pour le comportement. C’est JavaScript qui appelle l’API, avec l’instruction fetch.',
    undefined, ['JS', 'fetch', 'HTML', 'CSS', 'page web']),
  entry('sandbox', 'Fenêtre isolée (sandbox)', 'contrat',
    'Une zone fermée où l’on fait tourner un code qu’on ne connaît pas encore, ici celui écrit par l’IA, sans risque pour le reste du kiosque.',
    'Comme un bac à sable : on peut tout construire et tout casser sans abîmer le jardin.',
    ['sandbox', 'bac à sable', 'iframe']),
  entry('conformite', 'Test de conformité', 'contrat',
    'Un test automatique qui vérifie que le serveur respecte bien le contrat : mêmes adresses, mêmes champs, mêmes statuts de réponse.',
    'Comme un contrôle qualité en sortie d’usine.',
    ['test de contrat', 'contract testing', 'recette']),
  entry('front', 'Front (Angular)', 'appels',
    'La partie visible d’une application, dans le navigateur : écrans, boutons, cartes. Ici, elle est construite avec Angular, une boîte à outils JavaScript pour faire des applications web.',
    undefined, ['frontend', 'interface', 'écran', 'IHM', 'Angular', 'navigateur']),
  entry('serveur', 'Serveur (back)', 'appels',
    'La partie cachée d’une application : elle reçoit les demandes, applique les règles de gestion, accède aux données et répond. Ici, elle est écrite en Java avec Quarkus.',
    undefined, ['backend', 'back', 'Quarkus', 'Java']),
  entry('bff', 'BFF (Backend For Frontend)', 'appels',
    'Un petit serveur placé entre l’écran et l’API du fournisseur. Il garde la clé secrète, transmet les appels et protège l’écran. Dans le kiosque, c’est un serveur Java (Quarkus).',
    'Comme un secrétariat : il passe les appels à votre place et garde le carnet d’adresses confidentiel.',
    ['backend for frontend', 'intermédiaire', 'Quarkus']),
  entry('consommateur', 'Consommateur d’API', 'appels',
    'Tout logiciel qui appelle une API : un écran, un traitement automatique, une IA… Ici, c’est le kiosque.',
    undefined, ['client', 'consumer', 'appelant']),
  entry('mock', 'Simulation (mock)', 'appels',
    'Une fausse API qui répond avec des données préparées. Elle permet d’essayer ou de développer sans le vrai service.',
    'Comme un simulateur de conduite : tout est réaliste, mais sans risque pour la vraie route.',
    ['mock', 'démo', 'données simulées', 'bouchon', 'stub', 'maquette']),
  entry('richardson', 'Échelle de Richardson', 'appels',
    'Une échelle de 0 à 3 qui mesure à quel point une API exploite bien le Web. Niveau 1 : une adresse par ressource. Niveau 2 : des verbes et des statuts qui portent le sens. Niveau 3 : des liens dans les réponses. Le niveau 2 est le bon compromis.',
    undefined, ['modèle de maturité', 'Richardson', 'niveau 2', 'N2']),
  entry('rest', 'REST', 'appels',
    'Un style de conception d’API qui s’appuie sur les règles du Web : une adresse par ressource, des méthodes HTTP et des statuts. Le niveau 2 de Richardson en est l’essentiel.',
    undefined, ['RESTful', 'API REST']),
  entry('hateoas', 'Hypermédia (HATEOAS)', 'appels',
    'Au niveau 3 de Richardson, chaque réponse contient des liens vers les actions possibles ensuite, et le client les suit au lieu de connaître les adresses par cœur.',
    'Comme les liens d’une page web : on clique, on n’a pas besoin de connaître l’adresse de la page suivante.',
    ['HATEOAS', 'niveau 3', 'liens']),
  entry('parametre', 'Paramètre de requête', 'appels',
    'Une précision ajoutée à la fin d’une adresse, après un point d’interrogation, pour affiner la demande. Dans /breeds/search?q=siam, « q=siam » indique le mot recherché.',
    undefined, ['query', 'paramètre', 'querystring', 'breed_ids']),
  entry('catalogue', 'Catalogue', 'appels',
    'La liste complète des races, chargée une seule fois par l’écran (GET /breeds), puis filtrée et triée sur place, sans nouvel appel.',
    undefined, ['liste', 'GET /breeds']),
  entry('identifiant', 'Identifiant (id)', 'appels',
    'Le code unique qui désigne une ressource, comme un numéro de dossier. Dans /breeds/siam, « siam » est l’identifiant du Siamois.',
    undefined, ['id', 'breed_id']),
  entry('hallucination', 'Hallucination', 'ia',
    'Quand une IA affirme avec assurance quelque chose de faux ou d’inventé. D’où l’intérêt de lui fournir les vraies données et de relire ses réponses.',
    undefined, ['invention', 'erreur de l’IA']),
  entry('beekast', 'Beekast', 'ia',
    'Un outil de sondage en direct : chacun vote depuis son poste, puis le résultat est copié dans l’atelier du kiosque.',
    undefined, ['vote', 'sondage']),
  entry('modernisation', 'Modernisation applicative', 'bilan',
    'Faire évoluer un logiciel ancien pour qu’il reste maintenable et ouvert : on l’entoure d’API, on le simplifie, on se fait aider par l’IA, plutôt que de tout jeter. Le titre « mIAoudernisation » mêle « miaou », « IA » et « modernisation ».',
    'Comme ajouter un guichet moderne à un vieux bâtiment plutôt que de le raser.',
    ['mIAoudernisation', 'migration', 'refonte']),
];

export function jargonById(id: string): JargonEntry | undefined {
  return JARGON.find((item) => item.id === id);
}

/**
 * Recherche sans tenir compte des accents ni de la casse. Les mots dont le nom ou un synonyme correspond passent avant ceux
 * qui n'en parlent que dans leur définition ; à égalité, ordre alphabétique.
 */
export function searchJargon(query: string): JargonEntry[] {
  const needle = normalize(query.trim());
  const ranked = JARGON
    .map((item) => ({ item, byName: normalize([item.term, ...item.aka].join(' ')).includes(needle) }))
    .filter(({ item, byName }) => byName || normalize(item.plain).includes(needle));
  return ranked
    .sort((a, b) => Number(b.byName) - Number(a.byName) || a.item.term.localeCompare(b.item.term, 'fr', { sensitivity: 'base' }))
    .map(({ item }) => item);
}
