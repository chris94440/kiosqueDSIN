# mIAoudernisation — Angular + Java Quarkus

**Front Angular 21, BFF Java 21 / Quarkus 3.40.1.** Le contrat fournisseur reste celui de <https://api.thecatapi.com/openapi-json>.

```text
Navigateur / Angular
    -> BFF Quarkus /api/... (cle uniquement sur le serveur)
        -> TheCatAPI https://beta-api.thecatapi.com/v1
    -> BFF Quarkus /api/no-key/breeds/{id} (atelier curl : appel volontairement sans cle)
        -> TheCatAPI : refus 403 attendu
    -> BFF Quarkus /photos/... (vignettes redimensionnees, sans cle)
        -> CDN d'images https://cdn2.thecatapi.com/images
    -> Iframe isolee /sandbox.html (fenetre d'essai du code de l'IA)
        -> TheCatAPI directement depuis le navigateur, avec la cle saisie (mode reel)
        -> ou reponses fabriquees par le kiosque (donnees simulees, adresse /?repetition) : aucun appel externe
```

Le BFF sert aussi le build Angular : en utilisation kiosque, **un seul serveur et une seule URL : http://127.0.0.1:8080**.

## 1. Configurer votre clé API

Ouvrir **`backend\config\application.properties`** et remplacer la valeur par votre clé, **telle quelle** : sans guillemets, sans espace et **sans `${…}`** :

```properties
thecatapi.api-key=VOTRE_CLE_THECATAPI
```

Une clé placée entre `${` et `}` est prise par Quarkus pour un nom de variable : elle est alors ignorée sans message d'erreur. **Contrôle après redémarrage :** <http://127.0.0.1:8080/config> doit afficher `"hasApiKey":true`.

Ce fichier local est déjà créé, **exclu de Git**, et jamais servi par HTTP. Ne pas mettre la clé dans le code Angular, l'OAS ou les prompts. Une copie sans secret est fournie dans `backend\application.properties.example`.

**Limite à connaître :** au moment du build, Quarkus recopie la valeur de ce fichier dans le paquet `backend\target\quarkus-app` (fichier `quarkus\generated-bytecode.jar`, comme valeur par défaut d'exécution). Ce dossier est lui aussi exclu de Git et jamais servi par HTTP, mais il contient donc la clé : à traiter comme un secret, à ne pas partager ni archiver avec les sources. La clé renouvelée après la séance rend cette copie inoffensive.

**La clé est un secret partagé pour la séance.** Les ateliers affichent le repère `VOTRE_CLE_API` : ni l'application, ni les prompts, ni les documents ne contiennent la vraie clé. Le bouton « Jouer » de l'atelier curl fait rejouer l'appel par le BFF, donc la clé reste côté serveur. La fenêtre d'essai du code de l'IA fait exception, par nature : avec les données réelles, la page testée appelle l'API depuis le navigateur avec la clé saisie dans un champ masqué ; cette clé n'est jamais envoyée au serveur du kiosque et s'efface à la fermeture de la fenêtre. Les participants qui tapent la commande dans leur terminal, ou qui complètent la page générée par l'IA, reçoivent la clé de l'animateur par un canal sûr. La formule gratuite autorise 10 requêtes par minute (au-delà : 429, attendre une minute). **Renouveler la clé après la séance**, surtout si elle a été collée dans un message ou un document.

Quarkus charge ce fichier au démarrage depuis le dossier `backend`. **Après modification, redémarrer le BFF.** Le lanceur se positionne automatiquement dans ce dossier.

**Par double-clic :** ouvrir `Redemarrer-Kiosque.cmd` à la racine du projet. Il arrête uniquement le serveur Java de ce projet sur le port 8080, puis le relance avec la configuration. Laisser sa fenêtre ouverte. Si une ancienne fenêtre du kiosque était encore ouverte, elle affiche « s'est arrêté » : c'est normal, la fermer. Si un autre programme occupe le port, il refuse de l'arrêter.

**Partager sans droits admin :** ouvrir `Partager-Kiosque.cmd` à la racine du projet. Le lanceur démarre le kiosque (si nécessaire), puis ouvre directement un tunnel `npx localtunnel` sur l'hôte `https://loca.lt` (plus fiable en réseau d'entreprise). L'URL HTTPS à partager s'affiche dans la fenêtre. En cas d'échec, un journal détaillé est créé dans `logs\partager-kiosque-*.log`.

Autre possibilité : écrire exactement `thecatapi.api-key=${CAT_API_KEY:}` (la syntaxe `${…}` ne sert qu'à ce cas) et définir la variable d'environnement `CAT_API_KEY` dans le terminal qui lance Quarkus.

## 2. Construire et lancer sous Windows

Prérequis : **Java 21**, **Node.js 20.19+** et npm. Maven est fourni via son wrapper officiel : pas d'installation globale nécessaire.

Depuis PowerShell :

```powershell
Set-Location 'D:\kiosqueDSIN\2026'
npm run build
npm start
```

Ouvrir **http://127.0.0.1:8080**. Arrêter avec `Ctrl+C`. `npm start` reconstruit uniquement si le JAR est absent ; après un changement de code, exécuter `npm run build` avant le redémarrage.

**Port 8080 déjà pris par un autre programme ?** Démarrer le kiosque sur un autre port, sans modifier le projet : `$env:QUARKUS_HTTP_PORT = '8081'; npm start`, puis ouvrir **http://127.0.0.1:8081**. Le message de démarrage cite toujours 8080. `Redemarrer-Kiosque.cmd` ne gère que le port 8080.

Le build installe les dépendances Angular si elles sont absentes, compile Angular puis assemble ses fichiers statiques dans Quarkus. Le paquet final est `backend\target\quarkus-app` : **conserver tout ce dossier**, pas seulement son JAR. Il contient une copie de la clé (voir § 1) : ne pas le diffuser.

**Après une mise à jour, appuyer une fois sur `Ctrl+F5`** dans le navigateur du kiosque : l'ancienne page peut rester en cache jusqu'à 24 h. Le BFF envoie désormais `Cache-Control: no-cache` pour `index.html` et les contrats, donc cette précaution n'est nécessaire qu'une seule fois.

**Ne pas réactiver l'option `inlineCritical` d'Angular** (désactivée dans `frontend\angular.json`). Elle place la feuille de style dans un `<style>` et un `onload` en ligne que la politique CSP du BFF (`style-src 'self'; script-src 'self'`) bloque : la page s'afficherait alors sans aucune mise en forme.

Les scripts réutilisent les certificats déjà approuvés par Windows pour npm et Java, sans désactiver TLS ni modifier les magasins de certificats. Une configuration `NODE_EXTRA_CA_CERTS`, `MAVEN_OPTS` ou `JAVA_TOOL_OPTIONS` de confiance déjà fournie est respectée. Si les scripts PowerShell sont interdits par votre entreprise, ne pas contourner la politique : demander un environnement de build et un truststore approuvés au support.

### Déployer avec Docker (serveur public)

Le projet inclut maintenant un packaging Docker complet :

- `Dockerfile` : build multi-stage (Angular puis Quarkus), image runtime Java 21.
- `docker-compose.yml` : service prêt à lancer sur le port 8080.
- `.env.docker.example` : exemple de variable `CAT_API_KEY`.

> Important : ne pas utiliser `backend\config\application.properties` dans l'image. En Docker, la clé API est fournie par variable d'environnement.

1. Préparer l'environnement :

```bash
cp .env.docker.example .env
# puis remplacer CAT_API_KEY par votre clé réelle
```

2. Construire puis démarrer :

```bash
docker compose build
docker compose up -d
```

3. Vérifier :

- Application : <http://127.0.0.1:8080>
- Santé de la clé : <http://127.0.0.1:8080/config> (doit afficher `"hasApiKey": true`)

Sans Docker Compose :

```bash
docker build -t kiosque-dsin:latest .
docker run --rm -p 8080:8080 -e CAT_API_KEY=VOTRE_CLE_THECATAPI kiosque-dsin:latest
```

### Développement avec deux serveurs

Dans un premier terminal, depuis `backend` :

```powershell
.\mvnw.cmd quarkus:dev
```

Dans un second terminal, depuis `frontend` :

```powershell
npm start
```

Angular est sur **http://127.0.0.1:4200** ; son proxy transmet `/api`, `/demo`, `/config`, `/photos` et `/openapi.json` à Quarkus sur 8080. Ne pas ajouter la clé au proxy. Sur un poste avec interception TLS, utiliser le lanceur packagé ou les options Java de confiance approuvées.

## 3. Fonctionnalités

### Une seule application, pour tous les niveaux

Le kiosque est **une seule application, identique pour tout le monde** : aucun profil à choisir, aucun mode d'affichage. Le public est pourtant mixte (chef de projet métier ou classique, responsable de service, développeur Java ou métier, testeur, architecte…) : chaque étape se lit donc à plusieurs profondeurs, sans rien retirer aux plus techniques.

L'écran est conçu pour être **diffusé en direct** : il ne contient que ce que les auditeurs doivent voir. Tout ce qui sert à l'animateur seul (conducteur chronométré, questions à poser au groupe et leurs réponses, plan B, consignes de configuration) est dans `SYNOPSIS.md`.

- **Accueil « Bienvenue ! »** : un bloc repliable en haut de page. Il dit à quoi sert le kiosque, comment le lire, ce que sont les « missions », et résume le programme en quatre idées (DDD, API first, Richardson niveau 2, IA). Il est ouvert au premier chargement (replié si l'on arrive par un lien direct vers une autre étape) et se replie dès qu'on change d'étape ; « Recommencer » ou un clic sur son titre le rouvrent.
- **« En deux mots »** en tête de chaque étape : la question que l'on se pose, la réponse en deux phrases, en langage courant, une comparaison avec la vie courante (« Comme dans la vie »), ce que l'on va faire, et les « mots à connaître » de l'étape. Les textes sont dans `frontend\src\app\plain.ts`.
- **Dico du jargon** : bouton en haut de page, 40 mots expliqués avec des mots simples (API, BFF, JSON, curl, Richardson, hallucination…), sigles et synonymes compris. La recherche ignore les accents et les majuscules. Quatre mots soulignés dans le texte (couche anti-corruption, curl, JSON, BFF) ouvrent le dico directement sur leur explication, et « Voir tout le jargon » (dans « En deux mots ») l'ouvre en entier. Échap vide d'abord la recherche, puis ferme la fenêtre ; le dico se rouvre toujours sur la liste complète. Les textes sont dans `frontend\src\app\jargon.ts`.
- **« Côté technique »** : les détails pour les développeurs (où la traduction se fait dans le code, `--ssl-no-revoke`, sécurité écrite dans le contrat OpenAPI, documentation du fournisseur, ce que l'on constate sur Richardson, pourquoi les votes ne sont pas enregistrés chez le fournisseur) sont dans des blocs **repliés** : on les ouvre à la demande et « Recommencer » les referme.
- **Vocabulaire** : titres et libellés disent ce que l'on fait (« Appeler l'API sans clé avec curl : elle refuse (403) », « Préparer le prompt IA »…), les termes techniques sont expliqués à leur première apparition, et `frontend\src\app\typography.ts` insère une espace insécable avant « ? », « : », « ; » et « ! » pour que la ponctuation ne passe jamais seule à la ligne.

Les consignes d'animation d'un groupe mixte (note « Public mixte », questions pour le groupe, plan B) sont dans `SYNOPSIS.md`, jamais à l'écran.

### Un parcours pédagogique en cinq onglets

La page suit le conducteur de 48 minutes de `SYNOPSIS.md` : un onglet par étape, chacun avec sa thématique, sa durée indicative (« ≈ 5 min », etc.) et sa ou ses missions.

| Onglet | Thématique | Durée | Le visiteur… |
|---|---|---|---|
| 1 · Le besoin | Parler le même langage (DDD) | ≈ 5 min | lit trois définitions en clair (domaine, DDD, langage ubiquitaire) avec l'image d'un chantier, puis applique le langage ubiquitaire : test du mot « chat », chaîne de la réunion au prompt, glossaire, et dévoile la ressource API de trois mots du métier (race, photo, favori) |
| 2 · Le contrat | S'accorder avant de coder (API first) | ≈ 20 min | suit les quatre temps d'API first, lit le contrat OpenAPI réel (avec un gros plan sur sa sécurité), joue un curl sans clé (403) puis avec clé (200), puis fait écrire à l'IA une page qui appelle l'API et l'essaie dans une fenêtre isolée |
| 3 · Les appels | Les logiciels se parlent (Richardson N2) | ≈ 8 min | situe l'API sur l'échelle de Richardson (niveau 2 choisi), recherche via l'API, filtre ou trie en local, ouvre une fiche (deux ressources) |
| 4 · L'IA | L'IA, sans qu'elle invente | ≈ 10 min | copie le prompt construit à partir des réponses de l'API, puis le prompt de l'application de vote avec le résultat Beekast, et essaie l'application obtenue dans la même fenêtre d'essai |
| 5 · Le bilan | Ce qu'on en retient (mIAoudernisation) | ≈ 5 min | répond à la question flash et relit ce qu'il a pratiqué : DDD, API first, Richardson N2, IA |

- **Avancement** : 11 missions, une barre de progression, l'état de chaque onglet (à faire, en cours, terminé ✓) et un lien « Prochaine mission ». « Recommencer » remet à zéro les missions, les réponses dévoilées, l'historique des appels, le catalogue et le résultat Beekast collé. La progression reste **en mémoire** : rien n'est enregistré dans le navigateur, car le kiosque est partagé.
- **Liens directs** : `#besoin`, `#contrat`, `#appels`, `#ia` et `#bilan` ouvrent l'étape correspondante, par exemple `http://127.0.0.1:8080/#appels`.
- **Accessibilité** : onglets ARIA, navigation au clavier (flèches avec rebouclage, Début, Fin), pas de défilement horizontal sur mobile, onglet actif toujours visible.
- **Contrat lu en direct** : l'onglet 2 lit `/openapi.json`, le fichier que montre aussi Swagger Editor. Il en extrait les cinq opérations utilisées par le kiosque (paramètres envoyés, réponses annoncées, accès) ainsi que le schéma de sécurité, et signale tout écart avec le contrat au lieu de le masquer. Rien n'est recopié dans le code Angular.

### Onglet 1 : le langage ubiquitaire (DDD)

- **« Trois mots à connaître, sans jargon »** : trois cartes (le domaine, DDD, le langage ubiquitaire), chacune avec une accroche, une définition sans jargon et une ligne « Dans ce kiosque ». « Ubiquitaire » y est traduit par « présent partout ». Vient ensuite une image mentale, le chantier : l'architecte dit « on retire la cloison », l'ouvrier comprend « le mur » et attaque le mur porteur ; le langage ubiquitaire est la légende du plan, lue de la même façon par tous. Un encadré explique enfin pourquoi cela compte avec l'IA : elle lit vos mots, donc un mot flou donne un code flou. Les textes sont dans `PLAIN_TERMS` (`frontend\src\app\concepts.ts`).
- **Test du mot « chat »** : race, photo ou chat individuel ? Trois sens, donc trois ressources du contrat (`/breeds`, `/images`, `/pets`) ; le kiosque n'utilise que les deux premières.
- **Une chaîne en cinq maillons** : Réunion métier → Écran → Contrat OAS → Appel → Prompt IA. Le même mot « race » les traverse tous.
- **Glossaire** : sept mots du métier en face des mots de l'API (race/`breed`, photo/`image`, chat individuel/`pet`, favori/`favourite`, tempérament, espérance de vie/`life_span`, pays d'origine/`origin`). La traduction se fait à un seul endroit, `parseBreed` : c'est, en très léger, la couche anti-corruption du DDD.
- **Trois mots à dévoiler** (race, photo, favori) : la ressource d'API correspondante reste cachée jusqu'au clic. C'est la mission de l'onglet.

### Onglet 2 : API first, atelier curl et atelier IA

- **API first en quatre temps** : parler le même langage, écrire le contrat, relire et simuler, développer en parallèle. Un encadré rappelle ce que serait le *code first*.
- **Atelier curl** : deux commandes à copier ou à jouer. Sous PowerShell, taper `curl.exe` (`curl` y est un alias de `Invoke-WebRequest`).
  - Sans clé : `curl https://api.thecatapi.com/v1/breeds/char --ssl-no-revoke`. L'API refuse (**403**) : c'est le résultat attendu, et il valide la mission.
  - Avec clé : `curl -H "x-api-key: VOTRE_CLE_API" https://api.thecatapi.com/v1/breeds/char --ssl-no-revoke`. L'API répond **200**.
- **« Jouer ▶ »** ouvre une fenêtre contextuelle où le BFF rejoue l'appel : statut, lecture du statut et JSON reçu. L'identifiant de race est modifiable (essayer `zzz` pour obtenir un 404) et le clavier suffit (Entrée pour rejouer, Échap pour fermer). La clé reste côté serveur. Avec les données simulées (plan B, voir « Source des données »), la réponse est simulée et marquée comme telle.
- **La sécurité expliquée** : les schémas de sécurité sont lus en direct dans le contrat (`components.securitySchemes`, `security`), avec des liens cliquables vers la documentation du fournisseur (authentification, erreurs, clé gratuite) et vers le contrat dans Swagger Editor. Un encart distingue 401 et 403 : toujours lire le code de statut, jamais la formulation du message. Les liens et le détail technique sont dans des blocs « Côté technique » ou « Pour aller plus loin » repliés.
- **Gros plan sur le contrat** : un encadré « En clair », toujours visible, relie le schéma au refus 403 de l'atelier et à l'en-tête que l'appel avec clé ajoute. Pour les curieux, un bloc « Côté technique » replié montre le vrai contrat réduit à sa sécurité, le reste du fichier étant masqué par des « … ». `components.securitySchemes` déclare les moyens de s'identifier (ici une clé d'API : où l'envoyer, sous quel nom) et `security` dit lequel présenter. Les lignes décisives sont surlignées et des pastilles numérotées renvoient à une légende. L'extrait est reconstruit à chaque lecture de `/openapi.json` (rien n'est recopié dans le code Angular) ; si le contrat ne déclare aucun schéma, l'encart disparaît au profit d'un message.
- **Petit laïus sur `--ssl-no-revoke`** : sous Windows, curl s'appuie sur Schannel, qui vérifie que le certificat n'est pas révoqué. Derrière le réseau de l'entreprise, le serveur de révocation est souvent injoignable : sans l'option, curl s'arrête avec `CRYPT_E_NO_REVOCATION_CHECK` (code de sortie 35). L'option saute **uniquement** ce contrôle (la chaîne, le nom et la date du certificat restent vérifiés) ; `-k` (`--insecure`) est bien pire. Le BFF Java ne désactive jamais la vérification TLS.
- **Atelier IA** : l'outil est nommé (**Copilot Entreprise, version sécurisée · GPT-5.6 Sol · Réfléchir**), trois mots expliquent la page à relire (HTML, CSS, JavaScript) et trois prompts copiables se suivent. Ce sont les textes de `PROMPTS-IA.md` § 1.2 :
  1. « Transforme-moi l'appel curl en application JavaScript simple » : la fiche du Chartreux dans `fiche-chartreux.html` ; c'est ce prompt qui valide la mission ;
  2. toutes les races, en cartes (`GET /breeds`) ;
  3. des cartes cliquables pour zoomer sur un chat, sans nouvel appel.
- **La clé n'est jamais dans un prompt** : l'IA la place dans une constante `API_KEY = 'VOTRE_CLE_API'` que le participant remplit lui-même. Un encadré rappelle qu'une clé écrite dans une page est lisible par tout visiteur (touche F12) et que la formule gratuite est limitée à 10 requêtes par minute (429 si tout le groupe teste en même temps).
- **La page générée marche depuis un simple fichier** : l'API autorise les appels depuis n'importe quelle origine (CORS) et accepte l'en-tête `x-api-key`. Constaté lors des essais du 10 novembre 2026 ; à revérifier si le fournisseur change.
- **Essayer sans enregistrer de fichier** : « Tester la page de l'IA ▶ » ouvre la fenêtre d'essai (voir « La fenêtre d'essai du code de l'IA » plus bas). On y colle le code de l'IA, la page s'affiche dans un navigateur miniature et un journal montre chaque appel qu'elle envoie à l'API. L'enregistrement dans `fiche-chartreux.html` reste possible : c'est le geste du développeur.

### Onglet 4 : l'IA rédige, puis construit

- **Prompt de candidature** : l'onglet construit le prompt à partir de la fiche de race et des images reçues, avec la source indiquée (TheCatAPI ou jeu simulé). Depuis une fiche, « Préparer le prompt IA → » y mène directement. **Aucun modèle IA n'est appelé par l'application.**
- **Atelier de vote** : un vote a lieu sur Beekast, à la question « Quelle race pour notre Chief Happiness Chat ? ». Le visiteur colle le résultat (une option et son score par ligne, 1 500 caractères au plus) ou charge un exemple fictif ; le prompt de l'application de vote se recompose avec ce résultat (`PROMPTS-IA.md` § 1.3). La mission exige un résultat collé.
- **Tester l'application de vote ▶** : la même fenêtre d'essai, avec `vote-chats.html`. « Charger l'exemple » reprend le résultat Beekast collé dans l'atelier (ou l'exemple fictif) : le classement s'affiche, les boutons « Voter » fonctionnent et le journal montre l'appel qui va chercher les races.
- **Le résultat Beekast est une donnée, jamais une consigne** : il est encadré par des délimiteurs, borné, et toute suite de trois tirets ou plus y est remplacée pour qu'il ne puisse pas imiter ces délimiteurs. Le prompt demande de ne suivre aucune instruction qui s'y trouverait.
- **Pas de `POST /votes`** : TheCatAPI sait enregistrer des votes, mais le contrat fourni ne décrit aucune opération pour en supprimer un. L'application générée compte donc les voix localement et les additionne au résultat Beekast, en gardant visible la part de chaque source.

### Onglet 3 : l'échelle de Richardson, le catalogue et les appels

- **Échelle de Richardson** : quatre niveaux (0 un seul point d'entrée, 1 des ressources, 2 des verbes et des statuts, 3 l'hypermédia), le **niveau 2 mis en avant comme choix du projet**. Les exemples des niveaux 1 et 2 sont de vrais appels (`GET /breeds/char` → 200, `GET /breeds/zzz` → 404) ; ceux des niveaux 0 et 3 sont fictifs. Un lien ramène à l'atelier curl, où le visiteur a déjà obtenu un 403 et un 200.
- Catalogue : `GET /breeds`, présenté en **vignettes carrées** (environ cinq par ligne sur un écran large, deux sur mobile) : photo, nom et pays. Le tempérament s'affiche au survol et dans la fiche.
- Complétion clavier/souris sur noms et alias, sans réseau.
- Recherche distante explicite : `GET /breeds/search?q=…`.
- Filtres locaux par pays et tempérament ; tris par nom, pays, affection et énergie.
- Fiche : `GET /breeds/{id}` et `GET /images/search?breed_ids=…&limit=3&include_breeds=1`.
- Photos disponibles, valeurs absentes signalées et volet de tous les champs reçus.
- « L'API à la loupe » : chemin, méthode, statut réel, durée et JSON de chaque appel.

### Source des données

L'écran ne propose aucun menu de source : le kiosque lit TheCatAPI par le BFF, et rien d'autre n'est affiché au public.

- **Données réelles (par défaut)** : bandeau « Les données viennent de TheCatAPI… ». Si le fournisseur refuse (403, 429…) ou ne répond pas, l'erreur est affichée telle quelle, jamais remplacée en silence.
- **Données simulées (plan B de l'animateur)** : ouvrir `http://127.0.0.1:8080/?repetition`. Le kiosque travaille alors sur 10 fiches éditoriales et illustrations, sans accès fournisseur, et le dit en haut de page (bandeau « DONNÉES SIMULÉES »), dans les fiches, la fenêtre curl, la fenêtre d'essai et le prompt IA. Il n'y a aucun lien ni bouton pour y basculer : c'est une adresse à connaître, qui n'est pas affichée à l'écran. Revenir aux données réelles = ouvrir l'adresse ordinaire (nouvelle page : la progression, gardée en mémoire seulement, repart de zéro). Un prompt construit sur des données réelles ne reste donc jamais affiché avec des données simulées.

Le BFF n'expose que les lectures autorisées et valide les paramètres. Les statuts d'erreur du fournisseur sont conservés ; délais, problèmes réseau et réponses non JSON sont explicites. Le favori `POST /favourites` reste un exemple pédagogique non exécuté, et aucun vote n'est jamais envoyé.

### Routes de l'atelier curl

| Route | Rôle |
|---|---|
| `GET /api/breeds/{id}` | Appel avec clé : le BFF ajoute `x-api-key` (la clé ne quitte jamais le serveur) |
| `GET /api/no-key/breeds/{id}` | Appel **sans** clé, pour montrer le 403 : n'envoie jamais `x-api-key` et renvoie le refus du fournisseur tel quel |
| `GET /demo/breeds/{id}` | Réponse simulée (10 fiches) ; 404 pour une race absente du jeu |
| `GET /demo/no-key/breeds/{id}` | 403 fabriqué, de même forme que le vrai, étiqueté `X-Kiosque-Source: simulated` |

L'identifiant doit correspondre à `[a-zA-Z0-9_-]+` (40 caractères au plus côté Angular). La route sans clé est la seule qui appelle l'API du fournisseur sans clé : elle refuse tout paramètre de requête (400), ses réponses ne sont jamais mises en cache (`Cache-Control: no-store`), et elle ne sert qu'à l'atelier, sur une seule ressource.

### La fenêtre d'essai du code de l'IA

Deux boutons l'ouvrent : « Tester la page de l'IA ▶ » (onglet 2, `fiche-chartreux.html`) et « Tester l'application de vote ▶ » (onglet 4, `vote-chats.html`). Elle est facultative et ne compte pas dans les 11 missions.

- **Usage** : coller le code HTML de l'IA (30 000 caractères au plus) ou « Charger l'exemple », puis « Exécuter ▶ ». La page s'affiche dans un navigateur miniature ; le journal liste chaque appel qu'elle envoie (méthode, adresse, statut, durée) avec une lecture en clair (200, 403, 404, 429, aucune réponse). Échap ou « Fermer ✕ » referme la fenêtre, même quand le clavier est dans la page. Le code collé reste en mémoire pour la session, un par atelier ; « Recommencer » l'efface.
- **Données simulées (`/?repetition`)** : aucun appel ne part vers TheCatAPI. Le cadre intercepte `fetch` et le kiosque répond avec ses dix races d'exemple, sans photo (`GET /breeds`, `/breeds/search?q=`, `/breeds/{id}`) ; sans en-tête `x-api-key`, il fabrique le même 403 que le vrai fournisseur. Aucune vraie clé n'est nécessaire (la constante reçoit une clé fictive, `CLE-FICTIVE-SIMULATION`, définie par `SANDBOX_SIMULATED_KEY` dans `sandbox.ts`) et un bandeau « DONNÉES SIMULÉES » le rappelle.
- **Données réelles** : la page appelle vraiment TheCatAPI depuis le navigateur. La clé se saisit dans un champ masqué (lettres, chiffres, `-` et `_`, 8 caractères au moins) et remplace le repère `VOTRE_CLE_API` au lancement. Elle n'est jamais enregistrée, **jamais envoyée au serveur du kiosque**, et effacée à la fermeture ; le journal et les messages d'erreur la masquent. Si le code collé contient déjà ce qui ressemble à une clé (`live_…`, `api_key = "…"`), un avertissement demande de la remplacer par le repère. Chaque essai compte dans le quota de 10 requêtes par minute.
- **Isolation** : le code tourne dans une `iframe sandbox="allow-scripts"`, sans `allow-same-origin`, qui charge `/sandbox.html`. La page n'a donc accès ni au kiosque, ni à ses cookies, ni à sa mémoire, et ne peut ni ouvrir de fenêtre ni envoyer de formulaire. Trois politiques CSP coexistent désormais (`HttpHeaders.java`) : celle de l'application, celle de Swagger Editor et celle de `/sandbox.html` (`sandbox allow-scripts; default-src 'none'; connect-src https://*.thecatapi.com; img-src https://*.thecatapi.com data:; form-action 'none'`), qui limite les requêtes de la page à thecatapi.com. La politique de l'application (`default-src 'self'`) interdit aussi d'afficher un autre site dans le cadre : une tentative de navigation donne la page « Ce contenu est bloqué » de Chrome, et aucune requête ne part. Le kiosque et le cadre ne communiquent que par `postMessage` : le code n'est envoyé qu'au cadre que le kiosque vient de créer, et tout message d'une autre source est ignoré.
- **Ce qui reste à l'utilisateur** : ne coller que du code relu. Une page peut toujours afficher du faux ou consommer le quota, et avec les données réelles elle connaît la clé saisie. Pour un essai réel, préférer une clé de test, à renouveler après la séance.

### Vignettes : `GET /photos/{fichier}?size=thumb|med`

Les photos d'origine pèsent souvent de 0,4 à 1,8 Mo (plus de 1 600 px de large) et le fournisseur ne sait pas les réduire. Le BFF les redimensionne donc lui-même :

- `size=thumb` (par défaut) : carré de 320 px recadré au centre, environ 18 Ko, pour le catalogue et la galerie ;
- `size=med` : 900 px au plus sur le grand côté, sans agrandissement, pour la photo principale de la fiche.

Le résultat est un JPEG gardé en mémoire (400 images au plus) et mis en cache 24 h par le navigateur. Seuls les noms de fichier `identifiant.jpg|jpeg|png|gif` du CDN d'images de TheCatAPI sont acceptés : le BFF ne télécharge jamais une adresse arbitraire, ne suit pas les redirections, limite la taille et le nombre de téléchargements simultanés, et **n'envoie pas la clé d'API** à ce CDN.

Si la vignette échoue (CDN lent, image illisible), Angular tente l'image d'origine, puis affiche l'illustration. L'hôte d'images se règle avec `thecatapi.images-base-url` (par défaut `https://cdn2.thecatapi.com/images/`), utile surtout pour les tests.

Les endpoints de races exigent actuellement une clé : sans clé, une erreur **403** est normale. Les données fournisseur restent dans leur langue d'origine. Les scores de race ne garantissent pas le caractère d'un animal.

## 4. Vue Swagger Editor locale

Le lien **Ouvrir le contrat (OAS) · Swagger Editor** ouvre **http://127.0.0.1:8080/oas.html**.

Source éditable à gauche, documentation à droite, avec bouton pour restaurer le contrat fourni. Swagger Editor conserve un brouillon dans le stockage local du navigateur, mais le contrat fourni est rechargé à chaque ouverture ; aucun fichier ni service n'est modifié. Les appels, générateurs distants et validateurs distants sont désactivés ; aucune clé n'est à saisir ici.

Swagger Editor 4.14.6 est auto-hébergé dans `vendor\swagger-editor`, avec licence Apache-2.0 et NOTICE. Son validateur nécessite une autorisation JavaScript `unsafe-eval`, **limitée à la page d'éditeur** ; le reste de l'application conserve une politique plus stricte. Aucun CDN n'est utilisé.

La copie intégrale `openapi.json` a été téléchargée le 9 novembre 2026 : OpenAPI 3.0.0, API 1.7.1, serveur déclaré `https://beta-api.thecatapi.com/v1`. `/v1` est déjà dans la base ; ne pas le doubler.

## 5. Structure et supports

| Chemin | Contenu |
|---|---|
| `frontend\src\app` | Composant Angular standalone, modèles typés, service HttpClient |
| `frontend\src\app\journey.ts` | Parcours : 5 étapes, 11 missions, durée indicative de chaque étape, statut des onglets, touches du clavier (logique pure, testée) |
| `frontend\src\app\concepts.ts` | Contenus pédagogiques : trois définitions en clair, chaîne et glossaire du langage ubiquitaire, quatre temps d'API first, échelle de Richardson, bases du web (données pures) |
| `frontend\src\app\practice.ts` | Ateliers : commandes curl (repère `VOTRE_CLE_API`), routes jouées par le BFF, lecture des statuts, les trois prompts IA et le prompt de vote avec le résultat Beekast (logique pure, testée) |
| `frontend\src\app\sandbox.ts` | Fenêtre d'essai : scénarios, exemples de code, clé (format, remplacement, détection, masquage), messages du cadre, journal des appels (logique pure, testée) |
| `frontend\src\app\plain.ts` | Bloc « En deux mots » de chaque étape : la question, la réponse en deux phrases, une comparaison avec la vie courante, ce que l'on va faire, les mots à connaître (données pures, testées) |
| `frontend\src\app\jargon.ts` | Dico du jargon : 40 mots expliqués simplement, avec synonymes et sigles, et recherche sans accent ni majuscule (logique pure, testée) |
| `frontend\src\app\typography.ts` | Espace insécable à la française : avant `?` `:` `;` `!` et `»`, après `«` (testée dans `vulgarisation.spec.ts`) |
| `frontend\src\app\oas.models.ts` | Extraction, dans le contrat réel, des opérations utilisées par le kiosque, du schéma de sécurité et de son gros plan (extrait réduit, lignes surlignées, notes) |
| `backend\src\main\java` | BFF REST Quarkus, appels Java HttpClient, configuration, en-têtes HTTP (trois politiques CSP : application, Swagger Editor, exécuteur isolé ; cache), vignettes (`PhotoResource`, `PhotoService`), atelier curl (`/api/no-key/...`, `/demo/no-key/...`) |
| `tests\browser-check.mjs` | Parcours Chrome complet : accueil sans profil, « En deux mots », dico du jargon, blocs « Côté technique » repliés, rien de réservé à l'animateur à l'écran, onglets (ARIA, clavier, liens directs), contrat et sécurité lus en direct, atelier curl et sa fenêtre « Jouer », atelier IA et fenêtre d'essai (isolation, clé, données simulées), vote, missions et « Recommencer », style appliqué sans violation CSP, vignettes, fiche puis étape IA, mobile, Swagger Editor |
| `backend\config\application.properties` | Votre clé locale, fichier exclu de Git |
| `openapi.json`, `oas.*`, `vendor` | Contrat fournisseur et Swagger Editor local |
| `sandbox.html` | Exécuteur isolé du code de l'IA : `fetch` observé ou simulé, CSP dédiée ; copié dans le build par `angular.json` |
| `styles.css` | Thème partagé du kiosque |
| `SYNOPSIS.md` | Document de l'animateur, jamais affiché : conducteur de 48 min (4 min de marge), plan B, banque de 28 questions pour le groupe avec leurs réponses |
| `PROMPTS-IA.md` | Prompts de construction Angular/Quarkus, ateliers curl → JavaScript et vote, démonstration IA |

## 6. Vérifications

```powershell
npm test
npm run test:browser
```

Les tests Angular (64) vérifient les filtres, tris, complétion, formes des données, la réécriture des adresses de photos vers `/photos`, le modèle du parcours (étapes, missions, statuts, clavier), l'extraction du contrat OpenAPI, de son schéma de sécurité et de son gros plan, les commandes curl et la lecture des statuts, les prompts (aucune clé réelle, résultat Beekast borné et assaini) et la logique de la fenêtre d'essai (format et remplacement de la clé, détection d'une clé en clair, masquage dans le journal, messages du cadre, exemples de code), ainsi que le dico du jargon (identifiants uniques, recherche sans accent, noms classés avant les définitions), le bloc « En deux mots » (cinq étapes, uniquement des mots du dico), l'absence de toute consigne d'animateur dans les textes affichés et la typographie. Les tests Quarkus (16) utilisent un faux fournisseur HTTP local (API et images) pour contrôler la clé serveur, les erreurs, les validations, l'absence d'écritures, la route sans clé (aucun en-tête `x-api-key`, 403 relayé, paramètres refusés), le recadrage et le cache des vignettes, ainsi que l'`index.html` compatible avec la politique CSP et la séparation des trois politiques CSP (application, Swagger Editor, exécuteur isolé `/sandbox.html`). Le test Chrome utilise un serveur Quarkus de validation isolé et un faux fournisseur, sans toucher au kiosque ouvert (aucun port fixe) ; il parcourt les cinq onglets, vérifie que l'accueil est ouvert au premier chargement, replié à la navigation, rouvert par « Recommencer », que rien de réservé à l'animateur ne s'affiche (aucun profil, repère horaire, question pour le groupe, menu de source ni mention « Répétition »), que le dico du jargon se filtre sans accent, se vide puis se ferme avec Échap et que ses mots soulignés ouvrent la bonne explication, que les blocs « Côté technique » sont repliés au départ, contrôle que le contrat affiché est bien celui de `/openapi.json`, joue les deux curl dans la fenêtre « Jouer » (403 sans clé, 200 avec clé, 404 pour un identifiant inconnu, saisie invalide, Entrée et Échap), vérifie que les trois prompts IA et le prompt de vote ne contiennent aucune clé, que la feuille de style s'applique sans violation CSP, que les vignettes sont petites et issues du BFF, que le repli sur l'image d'origine puis sur l'illustration fonctionne, que la fenêtre d'essai isole le code collé (cadre sans accès au kiosque, requêtes externes et navigation vers un autre site refusées, Échap pressé dans le cadre, clé saisie sans fuite, réponses simulées avec les données simulées, application de vote fonctionnelle, réouverture sur le haut de la fenêtre), et que la page et les fenêtres « Jouer » et d'essai ne débordent pas sur mobile. Les données simulées s'obtiennent comme en séance, en rechargeant la page avec `/?repetition`. Définir `CHROME_PATH` si Chrome n'est pas installé dans son emplacement Windows standard. Avec `SCREENSHOT_DIR`, il enregistre une capture par onglet (bureau et mobile).

Le kiosque écoute uniquement sur `127.0.0.1`. Ce démonstrateur local n'est pas destiné à être exposé publiquement sans gestion des accès et durcissement adaptés.
