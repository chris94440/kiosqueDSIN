import { StepId } from './journey';
import { typo } from './typography';

export interface StepQuestion {
  /** Difficulté de la question, pour adapter l'animation. */
  readonly level: 'Débutant' | 'Intermédiaire' | 'Confirmé';
  /** Public visé par la question. */
  readonly audience: string;
  /** Formulation courte de la question. */
  readonly text: string;
  /** Réponse attendue pour l'animation. */
  readonly answer: string;
}

export interface StepPlain {
  /** La question que se pose naturellement quelqu'un qui découvre le sujet. */
  readonly question: string;
  /** La réponse en deux phrases, sans sigle. */
  readonly inShort: string;
  /** Une scène de la vie courante qui porte la même idée. */
  readonly analogy: string;
  /** Ce que le visiteur va concrètement faire dans l'étape. */
  readonly youWillDo: string;
  /** Mots du dictionnaire utiles à l'étape. */
  readonly words: readonly string[];
  /** Questions de fin d'étape, adaptées à des interlocuteurs différents. */
  readonly questions: readonly StepQuestion[];
}

const question = (value: StepQuestion): StepQuestion => ({
  level: value.level,
  audience: typo(value.audience),
  text: typo(value.text),
  answer: typo(value.answer),
});

const plain = (value: StepPlain): StepPlain => ({
  question: typo(value.question),
  inShort: typo(value.inShort),
  analogy: typo(value.analogy),
  youWillDo: typo(value.youWillDo),
  words: value.words,
  questions: value.questions.map(question),
});

/** Le bloc « En deux mots » de chaque étape : ce qu'il faut comprendre avant de regarder les détails. */
export const STEP_PLAIN: Readonly<Record<StepId, StepPlain>> = {
  besoin: plain({
    question: 'Comment démarrer simplement avec une API de chats ?',
    inShort: 'On part d’un cas concret : découvrir les races de chats via une API. Premier essai sans clé (refus attendu), second essai avec clé (réponse exploitable).',
    analogy: 'Comme à l’entrée d’un immeuble : sans badge la porte reste fermée, avec badge vous entrez et vous pouvez lire les informations affichées.',
    youWillDo: 'Lancer deux appels curl, comparer les statuts HTTP et dire ce que vous comprenez de la réponse JSON.',
    words: ['api', 'ressource', 'requete', 'methode-http'],
    questions: [
      {
        level: 'Débutant', audience: 'Interlocuteur métier',
        text: 'Après le premier curl, qu’est-ce qui vous indique que ce n’est pas une panne mais une règle d’accès ?',
        answer: 'Le statut 403 et le message d’authentification : l’API a répondu correctement mais refuse l’accès sans clé.',
      },
      {
        level: 'Intermédiaire', audience: 'Interlocuteur produit',
        text: 'Pourquoi garder les mots “race”, “photo” et “favori” bien séparés ?',
        answer: 'Parce que ce sont trois usages différents, donc trois ressources d’API différentes et trois comportements différents.',
      },
      {
        level: 'Confirmé', audience: 'Interlocuteur technique',
        text: 'Que valident les deux appels sans clé puis avec clé avant d’aller plus loin ?',
        answer: 'La sécurité (403 attendu) et la lisibilité des données métier (200 + JSON utile) avec le même endpoint.',
      },
    ],
  }),
  contrat: plain({
    question: 'Comment passer du curl à une page web avec l’IA ?',
    inShort: 'Le contrat OpenAPI donne le cadre, puis Copilot Covéa aide à transformer un appel curl en page HTML/JavaScript exploitable.',
    analogy: 'Le curl, c’est la recette en version courte ; la page web, c’est le plat dressé automatiquement à partir de la même recette.',
    youWillDo: 'Lire une opération du contrat, copier un prompt IA, puis relire le code généré pour vérifier appel API, en-tête de clé et rendu écran.',
    words: ['contrat-api', 'api-first', 'openapi', 'cle-api', 'curl', 'statut-http'],
    questions: [
      {
        level: 'Débutant', audience: 'Interlocuteur métier',
        text: 'Qu’est-ce que l’IA vous fait gagner dans cette étape ?',
        answer: 'Du temps de fabrication : elle produit une première page fonctionnelle à partir du curl et du contrat.',
      },
      {
        level: 'Intermédiaire', audience: 'Interlocuteur produit',
        text: 'Que devez-vous relire dans le code généré avant de l’utiliser ?',
        answer: 'Le endpoint appelé, la présence de la clé au bon endroit et l’affichage des champs utiles.',
      },
      {
        level: 'Confirmé', audience: 'Interlocuteur technique',
        text: 'Pourquoi le contrat reste indispensable même avec une IA performante ?',
        answer: 'Parce qu’il fixe la vérité d’interface : chemins, paramètres, sécurité et statuts attendus.',
      },
    ],
  }),
  appels: plain({
    question: 'Pourquoi les standards web accélèrent-ils la livraison ?',
    inShort: 'API first + Richardson niveau 2 + SPA donnent un cadre simple : adresses claires, statuts clairs, front séparé du BFF.',
    analogy: 'Même prise électrique pour tous les appareils : quand le standard est commun, l’intégration est rapide.',
    youWillDo: 'Manipuler le catalogue, observer les appels réseau en direct et distinguer ce qui se fait côté front de ce qui passe par le BFF.',
    words: ['ressource', 'methode-http', 'statut-http', 'richardson', 'bff'],
    questions: [
      {
        level: 'Débutant', audience: 'Interlocuteur métier',
        text: 'À quoi voyez-vous qu’une action est locale à l’écran ?',
        answer: 'Aucun nouvel appel n’apparaît dans le journal API : l’interface retravaille des données déjà chargées.',
      },
      {
        level: 'Intermédiaire', audience: 'Interlocuteur produit',
        text: 'Pourquoi séparer front et BFF dans ce type d’application ?',
        answer: 'Pour garder les secrets côté serveur, simplifier le front et sécuriser les appels vers l’API externe.',
      },
      {
        level: 'Confirmé', audience: 'Interlocuteur technique',
        text: 'Quel signal montre qu’on reste sur des standards HTTP plutôt que sur un protocole propriétaire ?',
        answer: 'Les ressources URI, les verbes HTTP et les statuts 2xx/4xx/5xx lisibles par tout client web.',
      },
    ],
  }),
  ia: plain({
    question: 'Comment montrer une autre application avec la même API ?',
    inShort: 'On bascule vers une application de vote de chats : même base d’API, autre besoin métier, autre écran.',
    analogy: 'Même moteur, autre carrosserie : la mécanique reste la même, l’usage change.',
    youWillDo: 'Ouvrir la modale de vote, voter en clic gauche, ouvrir un détail en clic droit et lire le classement partagé.',
    words: ['api', 'bff', 'ressource', 'statut-http'],
    questions: [
      {
        level: 'Débutant', audience: 'Interlocuteur métier',
        text: 'Qu’est-ce qui vous prouve qu’il s’agit d’une autre application et non d’un simple écran en plus ?',
        answer: 'Le scénario métier change (vote partagé), avec ses propres actions et son propre retour utilisateur.',
      },
      {
        level: 'Intermédiaire', audience: 'Interlocuteur produit',
        text: 'Pourquoi le résultat de vote est-il visible par tout le monde en même temps ?',
        answer: 'Parce que le vote est enregistré côté serveur du kiosque puis relu par chaque navigateur.',
      },
      {
        level: 'Confirmé', audience: 'Interlocuteur technique',
        text: 'Quel point technique permet le clic droit détail sans casser le vote en clic gauche ?',
        answer: 'Deux actions UI distinctes sur la vignette : click pour voter, contextmenu pour ouvrir la fiche.',
      },
    ],
  }),
  bilan: plain({
    question: 'Que faut-il retenir pour repartir avec du concret ?',
    inShort: 'La conclusion fixe les idées utiles : standards web, séparation front/BFF, réutilisation API et impact de la performance.',
    analogy: 'Comme une checklist de fin de mission : ce qu’on garde, ce qu’on réutilise, ce qu’on améliore ensuite.',
    youWillDo: 'Relire les 5 messages clés, valider la conclusion, puis redémarrer le parcours si besoin.',
    words: ['modernisation', 'conformite', 'monolithe', 'hateoas'],
    questions: [
      {
        level: 'Débutant', audience: 'Interlocuteur direction',
        text: 'Quel bénéfice immédiat peut-on appliquer dès demain ?',
        answer: 'Démarrer par un contrat clair et tester tôt les appels réels (succès et erreurs).',
      },
      {
        level: 'Intermédiaire', audience: 'Interlocuteur produit',
        text: 'Que garder comme règle de conception côté produit ?',
        answer: 'Une API pensée métier, réutilisable, et découplée de l’interface finale.',
      },
      {
        level: 'Confirmé', audience: 'Interlocuteur architecture',
        text: 'Quel indicateur technique surveiller pour préserver l’expérience ?',
        answer: 'Le temps de réponse API, car il conditionne directement la fluidité côté front.',
      },
    ],
  }),
};
