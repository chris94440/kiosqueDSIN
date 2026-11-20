# mIAoudernisation — le synopsis du kiosque DSIN

**Titre affiché : Une API. Des chats. Plein de possibilités.**

mIAoudernisation = miaou + IA + modernisation. C'est le nom de l'onglet du navigateur, du thème de la dernière étape et du prompt de rédaction.

**Durée : 1 heure : 48 minutes conduites, 4 minutes de marge, 8 minutes de questions.**

Public : collaborateurs DSIN, techniques et non techniques, par petits groupes. Un volontaire pilote le kiosque projeté ; le reste du groupe choisit les critères, répond aux questions et, pendant les ateliers curl et IA, pratique en binôme sur son poste. Pas de développement complet ni de rédaction d'OAS en direct : l'IA écrit le code, le groupe le relit.

## 1. L'histoire et les messages

La DSIN recherche sa mascotte, un « Chief Happiness Chat ». Le groupe commence par le besoin et ses mots, lit le contrat de l'API, l'appelle lui-même avec curl (d'abord sans clé, puis avec), fait écrire par une IA une page web qui l'appelle, explore les appels du kiosque, puis fait construire une application de vote qui prend en compte le résultat de son vote Beekast.

Quatre messages, sans cours magistral :

1. **DDD : on commence par le besoin et par un langage ubiquitaire.** Les mêmes mots, avec le même sens, de la réunion jusqu'au prompt. Une race n'est pas un chat individuel, une photo n'est pas une candidature, un favori n'est pas une adoption. C'est un premier pas vers le modèle métier, pas une démonstration complète de DDD, et cela ne signifie pas « un microservice par mot ».
2. **API first : on convient d'un contrat avant de développer ses consommateurs.** Le contrat décrit les ressources, la sécurité et les erreurs ; curl, une page JavaScript ou une IA l'exploitent. Ici le fournisseur et son OAS existent déjà : un contrat existant ne prouve pas la méthode qui l'a produit, et nous ne prétendons pas connaître celle de TheCatAPI.
3. **Richardson niveau 2, notre choix : ressources, méthodes HTTP et statuts ont un sens.** `GET /breeds/char` donne 200, `GET /breeds/zzz` donne 404, l'absence de clé donne 403. Nous ne constatons pas de niveau 3 dans les réponses vues, sans prétendre auditer toute l'API.
4. **IA : elle écrit et rédige, mais les faits viennent de l'API.** Elle construit un consommateur du contrat (une page, une application de vote) ou reformule des données reçues. Le code généré se relit ; le texte généré se contrôle.

Un fil rouge traverse l'heure : **la clé d'API est un secret.** Jamais dans un prompt, jamais dans un dépôt, jamais sur l'écran projeté. Une page qui appelle l'API directement rend la clé lisible (touche F12) : c'est la raison d'être du BFF du kiosque.

Promesse : « En moins d'une heure, vous aurez appelé une API avec curl, fait écrire par une IA une page qui l'appelle, et vous saurez expliquer ce qu'elle apporte. »

Architecture du démonstrateur : **Angular → BFF Java Quarkus → TheCatAPI**. La clé reste dans `backend\config\application.properties`, jamais dans le navigateur. Le BFF sert aussi le front compilé et rejoue les appels curl du bouton « Jouer ». Les pages que l'IA génère appellent, elles, TheCatAPI directement depuis le navigateur : le fournisseur autorise ces appels depuis un fichier local (CORS ouvert, vérifié le 10 novembre 2026). Ce sont des essais jetables, pas l'architecture cible. La fenêtre d'essai du kiosque fait tourner ces pages dans un cadre isolé (`/sandbox.html`) qui ne voit ni le kiosque ni ses cookies et ne peut joindre que thecatapi.com.

## 2. Préparation avant l'arrivée du public

Les trois risques de la séance : le **quota** de la clé, l'**outil IA** indisponible, la **clé** qui fuit. Tout ce qui suit les couvre.

**Le kiosque**

- Lancer l'application selon `README.md`, configurer la clé et vérifier les données réelles : `http://127.0.0.1:8080/config` doit indiquer `"hasApiKey":true`.
- Diffusion en direct : ne partager que la fenêtre du navigateur du kiosque, pas le bureau entier. Garder hors du partage ce document, le terminal où la clé est configurée et `backend\config\application.properties`. L'écran du kiosque ne contient aucune consigne d'animateur : tout ce qui sert à l'animateur seul (temps, questions, réponses, plans B) est ici.
- Vérifier le chargement du catalogue, une recherche, l'ouverture d'une fiche avec photos, puis les deux boutons « Jouer ▶ » de l'atelier curl (403 sans clé, 200 avec clé).
- Ouvrir chacune des deux fenêtres d'essai (« Tester la page de l'IA ▶ » dans l'onglet 2, « Tester l'application de vote ▶ » dans l'onglet 4) : « Charger l'exemple », « Exécuter ▶ », vérifier la page affichée et le journal des appels, puis Échap. Avec les données réelles, l'essai demande la clé dans un champ masqué : la taper hors de vue du public. Plan B si la fenêtre ne s'ouvre pas ou reste vide (poste verrouillé, extension qui injecte du code) : enregistrer le fichier HTML et l'ouvrir dans le navigateur, le résultat est le même.
- Ouvrir le kiosque sur l'onglet « Le besoin » et cliquer sur « Recommencer » : missions, historique des appels et catalogue repartent de zéro. La progression n'est jamais enregistrée : recharger la page la remet aussi à zéro.
- Plan B si TheCatAPI est indisponible : ouvrir `http://127.0.0.1:8080/?repetition`. Le kiosque travaille alors sur dix races d'exemple, sans photos distantes, et un bandeau « DONNÉES SIMULÉES » le dit à l'écran (la fenêtre « Jouer » aussi). Aucun menu ne permet d'y basculer devant le public : c'est une adresse à garder pour l'animateur. L'essayer une fois avant la séance, puis revenir à l'adresse ordinaire. En cas de panne, annoncer explicitement le passage à la simulation.
- Projeter en 1280 × 800 ou plus, avec un zoom adapté. Ouvrir les détails à l'avance pour repérer les éléments. À petit écran, l'inspecteur passe sous le catalogue.
- Désactiver les notifications du poste et préparer un minuteur indépendant.

**La clé et le quota**

- La clé est un secret partagé pour la séance. La transmettre aux participants par un canal sûr, jamais sur l'écran projeté ni dans un prompt, et la **renouveler après la séance** puisqu'elle a circulé. Ne jamais l'écrire dans un fichier du dépôt ni dans ce document : les exemples utilisent `VOTRE_CLE_API`.
- La formule gratuite est limitée à 10 requêtes par minute. Avec plusieurs binômes sur la même clé, le quota se partage et des `429` sont probables : prévoir une clé gratuite par table (lien « Obtenir une clé gratuite » dans l'atelier) ou travailler en binômes, et savoir en faire une leçon sur les statuts d'erreur.
- La fenêtre d'essai, avec les données réelles, appelle TheCatAPI depuis le navigateur : chaque essai compte dans ces 10 requêtes par minute. Elle ne garde pas la clé saisie (jamais enregistrée, jamais envoyée au serveur du kiosque, effacée à la fermeture), mais la page testée la connaît : ne tester que du code relu, avec la clé de la séance.

**Les postes des participants**

- Un terminal avec curl par binôme. Dans l'invite de commandes (cmd), `curl` suffit ; dans PowerShell, taper `curl.exe`, car `curl` y est un alias d'`Invoke-WebRequest`. Vérifier avec `curl.exe --version`. Sans terminal, la fenêtre « Jouer » remplace la commande.
- `--ssl-no-revoke` : les commandes affichées l'incluent. Pour le laïus, lancer une fois la même commande sans l'option sur le poste de l'animateur : si le réseau bloque la vérification de révocation, `curl` s'arrête avec `curl: (35) schannel: next InitializeSecurityContext failed: CRYPT_E_NO_REVOCATION_CHECK (0x80092012)`. Ne montrer cet échec que s'il se produit réellement, ne jamais le simuler.
- Un navigateur qui ouvre un fichier HTML local et un dossier de travail pour `fiche-chartreux.html` et `vote-chats.html`. Sans fichier, la fenêtre d'essai du kiosque affiche la même page.

**L'IA et Beekast**

- Outil : **Copilot Entreprise (version sécurisée)**, modèle **GPT-5.6 Sol**, mode **Réfléchir**, dans une conversation neuve. Avec un autre assistant, vérifier d'abord qu'il est autorisé pour cet usage. Aucune clé et aucune donnée interne dans le prompt : la clé se saisit dans le fichier HTML, après la génération.
- Tester les boutons « Copier le prompt 1 », « Copier le prompt » (étape 4) et « Copier le prompt de vote ». Si le presse-papiers est refusé, le prompt reste lisible et copiable à la main.
- Préparer la question Beekast « Quelle race pour notre Chief Happiness Chat ? » avec quatre à six races du catalogue. Tester le copier-coller du résultat avec l'exemple fictif (Chartreux 14, Maine Coon 11, Bengal 9, Sphynx 4). Le kiosque n'est pas relié à Beekast : le résultat est un texte collé, traité comme une donnée.
- Plan B si l'outil IA est indisponible : montrer les prompts et lire le code d'une page générée à l'avance avec le même prompt, **en l'annonçant comme préparée à l'avance**. Ne jamais présenter un texte préparé comme une génération en direct.

Accessoires optionnels : trois cartes papier « LE BESOIN », « LE CONTRAT », « LES DONNÉES ». Aucun smartphone ni compte visiteur n'est nécessaire.

## 3. Conducteur détaillé — 48 minutes

Le kiosque est un parcours en cinq onglets qui suit ce conducteur. Chaque onglet porte une thématique, un temps indicatif et une ou plusieurs missions (11 au total) ; la barre de progression et le lien « Prochaine mission » montrent où en est le groupe.

| Temps | Onglet (lien direct) | Thématique | Mission(s) |
|---|---|---|---|
| 00:00–05:00 | 1 · Le besoin (`#besoin`) | Parler le même langage (DDD, langage ubiquitaire) | Voir à quoi correspondent les trois mots du métier dans l'API |
| 05:00–25:00 | 2 · Le contrat (`#contrat`) | S'accorder avant de coder (API first, curl, atelier IA) | Ouvrir une ligne du contrat pour voir ce qu'elle permet ; jouer l'appel curl sans clé (403) ; jouer l'appel curl avec la clé (200) ; copier le prompt qui fait écrire une page web à l'IA |
| 25:00–33:00 | 3 · Les appels (`#appels`) | Les logiciels se parlent (Richardson niveau 2) | Lancer une recherche : l'appel part vers l'API ; filtrer ou trier la liste sans refaire d'appel ; ouvrir une fiche (l'écran combine deux appels : la race et ses photos) |
| 33:00–43:00 | 4 · L'IA (`#ia`) | L'IA, sans qu'elle invente | Copier le prompt construit avec les vraies données de l'API ; copier le prompt de l'application de vote, avec le résultat Beekast |
| 43:00–48:00 | 5 · Le bilan (`#bilan`) | Ce qu'on en retient (mIAoudernisation) | Répondre à la question flash |

Les missions guident, elles n'obligent pas : tout onglet s'ouvre par clic, par les flèches du clavier ou par son lien direct. En cas de retard, passer à l'onglet suivant sans terminer les missions ; « Recommencer » remet le parcours à zéro pour le groupe suivant. Les deux missions curl ne se cochent que dans la fenêtre « Jouer » : une commande tapée dans un terminal ne valide rien, donc rejouer l'appel une fois dans la fenêtre (dix secondes) si le groupe l'a fait au terminal.

**Questions pour le groupe.** Le kiosque ne les affiche pas : il est diffusé en direct et ne montre que ce que les auditeurs peuvent lire. Les 28 questions (5, 7, 6, 7 et 3), avec leur réponse, sont dans la section 6 de ce document. L'animateur pose la question à voix haute, laisse le groupe répondre, puis donne la réponse. Elles sont facultatives, ne comptent pas dans les missions et ne remplacent pas la question flash, qui reste la dernière mission. En poser une ou deux par onglet et garder les autres pour la section 4. Pistes : « Le DDD impose-t-il un microservice par mot du métier ? » (onglet 1), « Sans clé, l'API répond 403 : pourquoi pas 401 ? » et « Comment ferait-on pour créer une race de chat ? » (onglet 2), « Une API n'a qu'une seule adresse, répond toujours 200 et se commande toujours en POST : quel niveau de Richardson ? » (onglet 3), « Qui a appelé l'API : l'IA ou le kiosque ? » (onglet 4), « Pourquoi le kiosque n'exécute-t-il jamais POST /favourites ? » (onglet 5).

**Une seule application pour tous.** Les auditeurs ont des niveaux très différents (chef de projet métier ou classique, responsable de service, développeur Java ou métier, testeur, architecte). Le kiosque n'a ni profil à choisir ni mode d'affichage : tout le monde voit le même écran. Il est fait pour que chacun suive sans prérequis et que les plus techniques aillent plus loin à la demande :

- **À l'arrivée** : laisser l'accueil ouvert une trentaine de secondes et lire « Le programme, en quatre idées ».
- **À chaque onglet** : lire d'abord le bloc « En deux mots » et sa comparaison avec la vie courante, puis manipuler. Devant un sigle (OAS, BFF, JSON, curl…), ouvrir le « Dico du jargon » (bouton en haut de la page, 40 mots, avec recherche) plutôt que d'improviser une définition.
- **Pour les techniciens** : les blocs « Côté technique » et « Pour aller plus loin » (traduction dans le code, `--ssl-no-revoke`, sécurité dans le fichier du contrat, documentation du fournisseur, niveau de Richardson de cette API, `POST /votes`) sont repliés. Les laisser fermés devant le grand groupe et les ouvrir à la demande d'un développeur ou d'un testeur.
- **Entre deux groupes** : les blocs ouverts ne sont gardés qu'en mémoire. « Recommencer » les efface et rouvre l'accueil.

### 00:00–05:00 — Onglet 1 · Le besoin : un langage ubiquitaire

**À l'écran :** l'onglet « Le besoin ».

**00:00–01:00 · Recrutement très sérieux, candidat peu coopératif**

> « La DSIN recrute son Chief Happiness Chat. Missions : améliorer l'ambiance, dormir en comité et marcher sur le clavier uniquement hors production. De quoi avons-nous besoin pour choisir ? »

Faire proposer deux critères et une action : chercher une race, comparer des informations, consulter une fiche. Garder les envies de réservation ou d'adoption hors périmètre. Annoncer le fil de l'heure : parler métier, lire un contrat, appeler une API avec curl, faire écrire une page par une IA, puis faire voter.

**01:00–02:00 · Trois mots à connaître, sans jargon** (bloc « Trois mots à connaître, sans jargon », juste avant le test du mot « chat »)

Trois cartes à lire sans jargon : **le domaine** (le sujet dont on parle, avec ses idées, ses règles et ses mots), **DDD** (concevoir à partir du métier : la technique vient servir le sujet) et **le langage ubiquitaire** (« ubiquitaire » veut dire « présent partout » : un mini-dictionnaire commun, un mot, un seul sens). Chaque carte se termine par une ligne « Dans ce kiosque ». Puis l'image mentale du chantier :

> « Sur un chantier, l'architecte dit "on retire la cloison" : pour lui, un mur léger. L'ouvrier comprend "le mur" et attaque le mur porteur. Personne n'a mal travaillé : un mot n'avait pas le même sens pour tous. Le langage ubiquitaire, c'est la légende du plan, lue de la même façon par tout le monde. »

Terminer par l'encadré « Pourquoi cela compte aussi avec l'IA » :

> « Une IA ne devine pas votre métier : elle lit vos mots. Un mot flou donne un code flou, un mot précis donne un code précis. »

Si le public connaît déjà le DDD, ne lire que le chantier (30 secondes).

**02:00–03:00 · Le test du mot « chat »** (bloc « Un mot, un seul sens, partout »)

> « Quelqu'un dit en réunion : "on affiche les chats". De quoi parle-t-on : d'une race comme le Chartreux, d'une photo de chat, ou d'un chat individuel avec un nom ? »

Laisser le groupe hésiter : trois sens, donc trois ressources distinctes dans le contrat (`/breeds`, `/images`, `/pets`). Le kiosque n'utilise que les deux premières. Dérouler ensuite la chaîne « Le même mot, de la réunion jusqu'au prompt » : Réunion métier (`race`), Écran (`Race`), Contrat OAS (`/breeds`), Appel (`GET /breeds`), Prompt IA (`race (breed)`).

> « Le langage ubiquitaire, c'est le vocabulaire que le métier et l'équipe technique choisissent ensemble, puis emploient partout : en réunion, à l'écran, dans le contrat, dans le code et dans les prompts. Si un mot change de sens d'un endroit à l'autre, chacun comprend autre chose, et les erreurs commencent là. »

**03:00–04:00 · Trois mots, trois ressources** (mission)

Pour chacun des trois mots (race, photo, favori), le groupe dit d'abord ce que c'est dans le métier ; le volontaire clique ensuite sur « Voir ce que c'est dans l'API » : le mot du métier devient une ressource de l'API (`GET /breeds`, `GET /images/search`, `POST /favourites`). Chaque carte rappelle aussi ce que le mot n'est pas.

**04:00–05:00 · Le glossaire et la transition DDD**

Montrer le glossaire : le fournisseur impose ses mots anglais, le métier garde les siens, et la correspondance se note une fois. Dans ce kiosque, la traduction se fait à un seul endroit, la fonction `parseBreed` : c'est, en très léger, la couche anti-corruption du DDD.

> « Avant de parler de JSON, nous avons parlé de notre besoin et fixé nos mots. Une race, une photo et un chat individuel, ce n'est pas la même chose. Clarifier ce vocabulaire et les responsabilités, c'est l'esprit de la démarche DDD. Cela ne signifie pas un microservice par mot. »

### 05:00–25:00 — Onglet 2 · Le contrat : API first, curl et atelier IA

**05:00–08:00 · API first en quatre temps**

**À l'écran :** l'onglet « Le contrat », bloc « Le contrat vient avant le code ». Parcourir les quatre temps : parler le même langage (c'est l'étape 1), écrire le contrat, le relire et le simuler, puis développer en parallèle le serveur et les clients (écran, batch, IA).

> « API first : on convient du contrat avant de développer ceux qui le consomment. À l'inverse, en code first, le contrat n'est qu'un sous-produit du serveur, et les consommateurs attendent. »

**Image mentale :**

> « C'est la carte du restaurant : elle décrit ce que je peux commander. Elle ne me donne ni la recette ni les clés de la cuisine. »

> « Pour ce service externe déjà existant, nous ne pouvons pas prouver son histoire de conception. Nous constatons seulement qu'il fournit son contrat. »

**08:00–11:00 · Le contrat réel** (mission « Ouvrir une ligne du contrat pour voir ce qu'elle permet »)

L'extrait est lu en direct dans l'OAS réel du kiosque : ne pas parcourir le fichier complet. Déplier une opération pour voir ce que le kiosque envoie et ce que le contrat annonce. Montrer seulement :

- `GET /breeds` : demander le catalogue ;
- `GET /breeds/search`, paramètre `q` ;
- le serveur déclaré, en pastille au-dessus de la liste.

Dans le détail d'une opération, la ligne « Accès » indique la clé `x-api-key` : c'est la première trace de la sécurité, que l'atelier curl va éprouver. Quand une opération ne décrit que la réponse 200, le kiosque le signale : le contrat dit ce qui marche, pas toujours ce qui peut échouer (403, 404, 429…). Si le groupe veut voir le document, « Explorer le contrat complet dans Swagger Editor » ouvre l'éditeur local ; ne pas le modifier, et revenir à l'onglet du kiosque ensuite.

> « Nous partons de l'OAS fourni par TheCatAPI : pas besoin d'en écrire un aujourd'hui. Il décrit ce que nous pouvons demander et la forme des échanges. Un OAS ne garantit pas que le service fonctionne ; il faut aussi des tests, une implémentation conforme et une exploitation fiable. »

**11:00–16:00 · Atelier curl : sans clé, puis avec** (section « Atelier curl »)

**11:00–13:00 · Appeler sans clé.** Faire taper la commande dans un terminal (cmd : `curl` ; PowerShell : `curl.exe`) :

```text
curl https://api.thecatapi.com/v1/breeds/char --ssl-no-revoke
```

> « On demande la race Chartreux sans rien prouver. À votre avis, que répond l'API ? »

Laisser parier, puis lancer. Réponse attendue : **403 Forbidden**, avec un JSON :

```json
{"statusCode":403,"timestamp":"…","path":"/v1/breeds/char","message":"Authentication required. Please provide a valid API key.","error":"Forbidden"}
```

> « Ce n'est pas une panne : c'est la sécurité qui fait son travail. L'API a compris la demande, mais aucune clé valide ne l'accompagne. »

Cliquer ensuite sur « Jouer ▶ » : la fenêtre contextuelle affiche la commande qu'on taperait, un identifiant modifiable, la réponse avec son statut, sa lecture, et valide la mission. Entrée relance l'appel, Échap ferme la fenêtre. Le BFF rejoue l'appel : rien n'est exécuté sur le poste. Ajouter `-i` à la commande réelle montre aussi la ligne de statut et les en-têtes.

**Petit laïus sur `--ssl-no-revoke`** (encadré sous la réponse) :

> « Vous avez remarqué l'option --ssl-no-revoke. Sous Windows, curl s'appuie sur Schannel, qui vérifie que le certificat du site n'a pas été révoqué. Sur le réseau de l'entreprise, le serveur de révocation n'est souvent pas joignable : sans l'option, curl s'arrête avec CRYPT_E_NO_REVOCATION_CHECK, code de sortie 35. L'option saute uniquement ce contrôle : la chaîne de confiance, le nom du site et la date du certificat restent vérifiés. C'est acceptable pour essayer une API publique, pas une habitude. Et -k, lui, ne vérifie plus rien : on ne l'utilise pas. »

Si le réseau le permet, relancer la commande **sans** l'option pour montrer l'échec réel :

```text
curl: (35) schannel: next InitializeSecurityContext failed: CRYPT_E_NO_REVOCATION_CHECK (0x80092012) - La fonction de révocation n'a pas pu vérifier la révocation du certificat.
```

Si tout fonctionne sans l'option, le dire et passer. Le BFF Java du kiosque ne désactive jamais la vérification TLS, et un navigateur n'a pas besoin de l'option.

**13:00–14:30 · Comprendre le refus : la sécurité est écrite dans le contrat.** Montrer d'abord le **gros plan sur le contrat** (encart « Gros plan sur le contrat de ce kiosque »), lu en direct dans l'OAS réel : le reste du fichier est masqué par des « … », les lignes surlignées disent où et sous quel nom envoyer la clé, et la légende numérotée explique chaque terme.

> « Le contrat a deux étages. components.securitySchemes déclare les moyens de s'identifier : ici une clé d'API, à envoyer dans l'en-tête x-api-key. security dit lequel il faut présenter pour que l'appel soit accepté. Sans lui, 403 : c'est le refus que vous venez de voir. »

Puis la liste lue en direct (type, emplacement, nom `x-api-key`, exigence par défaut) et l'encadré « En clair », qui relie le schéma au 403 et à l'en-tête de l'appel suivant. Puis le routage vers la documentation, en cliquant sur les liens de l'atelier (ils s'ouvrent dans un nouvel onglet : revenir ensuite au kiosque) :

- Authentification : la clé se place dans l'en-tête `x-api-key` ;
- Les erreurs : 401, 403, 404, 429… ;
- Obtenir une clé gratuite ;
- Retrouver la sécurité dans le contrat, dans Swagger Editor.

> « Ce refus n'était pas une surprise : le contrat l'annonçait, et la documentation du fournisseur l'explique. La sécurité fait partie du contrat, pas d'un détail ajouté après coup. »

> « 401 dit plutôt "pas authentifié", 403 "compris, mais refusé". Ici le fournisseur répond 403 sans clé. Lisez toujours le code de statut, jamais la formulation du message : elle peut changer. »

**14:30–16:00 · Appeler avec la clé.** Même adresse, un en-tête de plus, et cette fois le Chartreux :

```text
curl -H "x-api-key: VOTRE_CLE_API" https://api.thecatapi.com/v1/breeds/char --ssl-no-revoke
```

Les participants remplacent `VOTRE_CLE_API` par la clé donnée par l'animateur (jamais projetée). Réponse attendue : **200 OK** et la fiche du Chartreux en JSON. Demander de repérer `name`, `origin`, `temperament` et `image.url`.

> « Un seul en-tête de plus, et l'API répond : 200 et la fiche du Chartreux. Ces quatre champs, ce sont ceux qu'une page web va afficher. »

Cliquer sur « Jouer ▶ » pour valider la mission : le BFF ajoute l'en-tête côté serveur, la clé n'apparaît jamais à l'écran. Rappeler que la clé se protège : ni dans un chat, ni dans un prompt, ni dans un dépôt de code. La commande affichée vise `api.thecatapi.com` ; le BFF rejoue vers l'API configurée, indiquée en bas de l'atelier.

**16:00–25:00 · Atelier IA : de l'appel curl à une page qui appelle l'API** (section « Atelier IA »)

**16:00–17:00 · L'outil et trois mots pour relire.** Nommer l'outil, en le montrant dans l'encadré :

> « Pour cet atelier, nous utilisons Copilot Entreprise, la version sécurisée validée par l'entreprise, avec le modèle GPT-5.6 Sol en mode Réfléchir. Avec un autre assistant, on vérifie d'abord qu'il est autorisé : aucun secret ni donnée interne dans le prompt. »

Présenter les trois mots du web : **HTML** (la structure de la page), **CSS** (la mise en forme), **JavaScript** (le comportement : c'est lui qui appelle l'API avec `fetch` et qui remplit la page).

> « Vous n'écrivez pas le code : vous le faites écrire, puis vous le relisez. »

**17:00–21:00 · Prompt 1 : de l'appel curl à la fiche du Chartreux** (mission « Copier le prompt (la consigne) qui fait écrire une page web à l'IA »). Souffler la phrase clé :

> « Transforme-moi l'appel curl en application JavaScript simple. »

Cliquer sur « Copier le prompt 1 » et le coller dans une conversation neuve. Le prompt contient le curl avec le repère de clé, le nom du fichier `fiche-chartreux.html`, et les consignes : le JavaScript appelle lui-même l'API avec `fetch`, la clé est une constante que chacun remplira, les textes reçus s'écrivent avec `textContent`, une erreur s'affiche dans la page. Pendant que l'outil réfléchit, expliquer cela au groupe ; ne pas dicter le code. Puis, au choix :

- **Dans le kiosque (recommandé, une minute)** : cliquer sur « Tester la page de l'IA ▶ », coller le code et cliquer sur « Exécuter ▶ ». Avec les données simulées (plan B), aucune clé n'est nécessaire ; avec les données réelles, taper la clé dans le champ masqué, hors de vue du public. La page s'affiche dans un navigateur miniature et le journal montre l'appel : `GET …/breeds/char`, `HTTP 200 OK`. Si le code contient déjà une clé, le kiosque avertit : la remplacer par `VOTRE_CLE_API`.
- **Dans un fichier (le geste du développeur)** : enregistrer le code dans `fiche-chartreux.html`, remplacer `VOTRE_CLE_API` par la clé, ouvrir le fichier dans le navigateur.

Dans les deux cas, relire le JavaScript : repérer le `fetch`, l'en-tête `x-api-key` et la ligne qui affiche la réponse.

> « La page elle-même fait l'appel à l'API, grâce à JavaScript. Ce n'est plus nous qui tapons curl : c'est le navigateur qui envoie la même requête et qui remplit la fiche. Le journal le prouve : c'est la page qui a appelé. L'option --ssl-no-revoke n'a rien à faire dans la page : c'est une option de curl, pas de l'API. »

À dire au groupe, une fois : le code d'une IA est un code que l'on n'a pas écrit. La fenêtre d'essai l'isole du kiosque (elle ne voit ni ses données ni ses cookies et ne peut joindre que thecatapi.com), mais cela ne remplace pas la relecture : ne coller que du code relu.

**21:00–23:00 · Prompts 2 et 3 : de la fiche à toutes les races, puis au zoom.** Prompt 2 : on change d'appel, `GET /breeds` au lieu de `GET /breeds/char`, et la page affiche une vignette par race. Prompt 3 : on rend les cartes cliquables pour zoomer sur un chat en particulier, sans nouvel appel réseau, avec les données déjà reçues. Lancer les deux à la suite : chaque nouvelle version se colle dans la même fenêtre d'essai (« Effacer » avant de coller). Avec le prompt 3, le journal permet de vérifier qu'un clic sur une carte ne déclenche aucun nouvel appel : seul le chargement de la page interroge l'API. Montrer le résultat d'un binôme.

**23:00–24:00 · Attention à la clé, et le quota.**

> « Une page qui appelle l'API directement doit connaître la clé : toute personne qui ouvre la page, ou qui presse F12, peut la lire. C'est acceptable pour un essai sur votre poste, jamais pour une page publiée. C'est la raison d'être du BFF de ce kiosque : la clé reste sur le serveur. »

Si un `429` apparaît : c'est le quota de 10 requêtes par minute. Patienter une minute et en faire un cas d'école de statut d'erreur.

**24:00–25:00 · Question du groupe : « Comment ferait-on pour créer une race de chat ? »** Laisser le groupe répondre, puis donner la réponse (le kiosque ne l'affiche pas, voir section 6) : on écrit d'abord le contrat, avec le métier (`POST /breeds`, avec le corps attendu et les réponses 201, 400, 403, 409) ; en niveau 2 : un POST sur la ressource, le statut 201 Created et un en-tête `Location` vers `GET /breeds/{id}` ; relecture et mock, puis serveur et clients en parallèle ; une écriture réservée à un rôle précis. À noter : le contrat de TheCatAPI ne propose aucune création de race, son catalogue est en lecture seule. Il décrit en revanche `POST /pets`, la création d'un chat individuel qui référence une race par `breed_id` : une race n'est pas un chat.

### 25:00–33:00 — Onglet 3 · Les appels : Richardson niveau 2

**25:00–27:00 · L'échelle de Richardson : nous avons choisi le niveau 2**

**À l'écran :** l'onglet « Les appels », bloc « Quatre niveaux pour une API web : nous visons le niveau 2 ».

> « Richardson décrit quatre niveaux de maturité. Niveau 0 : une seule adresse, toujours POST, toujours 200 ; l'action et l'erreur sont cachées dans le message. Niveau 1 : chaque chose a sa propre adresse. Niveau 2 : le verbe dit l'intention et le statut dit le résultat. Niveau 3 : la réponse contient les liens vers les actions possibles. Nous avons choisi le niveau 2. »

Relier à la pratique : `GET /breeds/char` sans clé donne 403, `GET /breeds/char` avec la clé donne 200. Option de 30 secondes : « Retourner à l'atelier curl », ouvrir « Jouer ▶ » dans l'appel avec clé et saisir un identifiant inconnu comme `zzz` pour obtenir un **404**. Préciser que les exemples des niveaux 0 et 3 sont fictifs, ceux des niveaux 1 et 2 de vrais appels, et que nous ne constatons pas de niveau 3 sans avoir audité toute l'API.

**27:00–29:00 · Le catalogue et la recherche**

**Action :** « Recharger l'API », puis dans « L'API à la loupe » sélectionner `GET /breeds`.

> « Voici ce qui revient : des données JSON, pas notre joli écran. Notre application transforme ces données en cartes. »

**Action :** saisir `si` et choisir une proposition à la souris ou avec flèche bas puis Entrée. Montrer que l'historique des appels n'a pas changé.

> « Cette complétion est locale : nous réutilisons le catalogue déjà reçu. Une interface réactive ne doit pas obligatoirement appeler le serveur à chaque lettre. »

**Action :** saisir `siam` puis cliquer sur « Rechercher via l'API » (mission). Montrer le chemin `/breeds/search?q=siam`, le statut et le tableau JSON. Les noms disponibles dépendent des données du fournisseur : si une traduction française ne correspond pas, essayer le nom retourné par le catalogue.

> « Cette fois, la recherche a lieu côté serveur. GET indique une lecture ; q est le critère transmis. Le statut reçu nous dit comment l'appel s'est passé. »

Si le statut est 403 : « Vous reconnaissez ce 403 : la clé est absente ou refusée côté serveur. » Ne pas consacrer plus de 30 secondes au diagnostic ; passer explicitement aux données simulées (`/?repetition`) si nécessaire.

**29:00–31:00 · Un contrat, plusieurs possibilités d'interface**

**Action :** « Réinitialiser » ; filtrer par France si disponible, puis trier par pays ou par énergie. Observer l'absence de nouvel appel : c'est la mission « Filtrer ou trier la liste sans refaire d'appel ».

> « Le tri par pays n'est pas un endpoint inventé : c'est notre usage des données déjà reçues. Le même service pourrait alimenter une autre application, un portail ou un outil métier. »

**31:00–33:00 · La fiche : deux ressources composées**

**Action :** ouvrir une fiche (mission). Montrer les deux nouveaux appels :

```http
GET /breeds/{id}
GET /images/search?breed_ids={id}&limit=3&include_breeds=1
```

Les trois photos sont un maximum demandé, pas une garantie. Les champs et images disponibles dépendent du fournisseur et de la clé.

> « Un écran peut composer plusieurs ressources : ici la race et ses photos. L'API n'est pas la page web. Si une information n'est pas renvoyée, nous la disons absente : nous ne la fabriquons pas. Et un trait de race n'est pas une garantie sur un individu. »

### 33:00–43:00 — Onglet 4 · L'IA : rédiger, construire, outiller

**33:00–37:00 · La candidature rédigée à partir des données de l'API**

**Avant tout :** lancer sur Beekast la question « Quelle race pour notre Chief Happiness Chat ? », pour que les votes arrivent pendant la suite.

**Action :** dans la fiche, cliquer sur « Préparer le prompt IA → » : l'onglet « L'IA » s'ouvre sur la race choisie (on peut aussi ouvrir l'onglet et choisir une race). Les données de l'API, les deux appels qui les ont fournies et le prompt construit y sont côte à côte. Utiliser « Copier le prompt » (mission), puis le coller dans l'outil IA, dans une conversation neuve.

**Annoncer exactement le fonctionnement :**

> « Notre application vient d'appeler l'API. Maintenant nous donnons les données reçues à l'IA pour rédiger une candidature. Dans cette version, l'IA n'appelle pas elle-même TheCatAPI : nous lui transmettons le résultat. »

Le prompt demande trois faits, puis trois lignes de fiction humoristique. **Faire participer :** demander au public de repérer une phrase factuelle et une phrase inventée. Si une valeur manque, vérifier que l'IA ne l'a pas inventée.

> « La source des faits, c'est la réponse du service. Le talent de l'IA ici, c'est la reformulation. Elle peut faire preuve d'imagination dans la légende, pas dans les identifiants ou les origines. »

Si l'outil IA est indisponible, montrer uniquement le prompt et expliquer la transformation attendue.

**37:00–42:00 · Atelier : l'application de vote** (section « Atelier : l'application de vote du Chief Happiness Chat »)

1. Clore le vote Beekast, copier le résultat (une option et son score par ligne) et le coller dans « Résultat Beekast, collé tel quel » (1 500 caractères au plus). Sans vote réel, « Charger un exemple fictif » et **dire qu'il est fictif**.
2. Le prompt de vote se construit : il encadre le résultat de délimiteurs et précise à l'IA que ce sont des données, pas des instructions. Cliquer sur « Copier le prompt de vote » (mission) et le coller dans l'outil IA.
3. Voir l'application, au choix :
   - **Dans le kiosque (recommandé)** : cliquer sur « Tester l'application de vote ▶ », coller le code de l'IA (ou « Charger l'exemple », qui reprend le résultat Beekast collé plus haut, ou l'exemple fictif signalé comme tel), puis « Exécuter ▶ ». Le classement s'affiche dans le navigateur miniature. Cliquer sur « Voter » : le total et la part de chaque source changent. Le journal « Les appels faits par la page » montre un seul appel, `GET …/breeds`, puis plus rien : les clics ne sortent pas du navigateur.
   - **Dans un fichier** : enregistrer le code dans `vote-chats.html`, remplacer `VOTRE_CLE_API` par la clé et ouvrir le fichier.

   Résultat attendu dans les deux cas : un classement, les photos des races (avec les données simulées, sans photos), des boutons « Voter », et la part de chaque source visible.

> « Les chiffres viennent de deux endroits : le résultat Beekast que nous avons collé et les clics de cette page. Le classement doit montrer la part de chacun. Et le journal le confirme : un seul appel à l'API, les voix, elles, restent dans la page. »

**Pourquoi pas un vrai `POST /votes` ?**

> « L'API sait enregistrer des votes, mais le contrat fourni ne décrit aucune opération pour en supprimer un. Pour un exercice partagé, la page compte donc les voix localement et additionne le résultat Beekast. Écrire chez un tiers demande des droits, une confirmation et la possibilité de corriger une erreur. »

Le kiosque n'est pas relié à Beekast : le résultat est un texte collé, traité comme une donnée. Les prompts de l'atelier IA et du vote sont dans le kiosque et dans `PROMPTS-IA.md` (§ 1.2 et § 1.3).

**42:00–43:00 · Trois usages de l'IA autour d'une API** (bloc en bas de l'onglet)

**Construire** (vos ateliers), **rédiger** (ce kiosque), **outiller** (non inclus). Ouverture, pas démonstration fictive :

> « Avec une intégration d'outils supplémentaire, une IA pourrait demander elle-même une recherche au service. Cela exige un connecteur, des permissions et des contrôles : fournir l'OAS ne suffit pas. »

Le prompt d'assistant outillé est dans `PROMPTS-IA.md` (§ 3), mais cette intégration n'est pas incluse dans l'application.

### 43:00–48:00 — Onglet 5 · Le bilan : mIAoudernisation

**43:00–44:30 · Lecture et écriture**

**Action :** ouvrir l'onglet « Le bilan ». La carte « Écrire · POST » montre l'exemple, expliqué et jamais exécuté.

```http
POST /favourites
Content-Type: application/json
x-api-key: [côté serveur]

{"image_id":"identifiant_image_reçu"}
```

> « GET lit. POST pourrait créer un favori. Ce dernier appel n'est pas exécuté dans notre kiosque. Pour une écriture, et plus encore via une IA, nous définissons les droits et demandons une confirmation. »

> « Richardson niveau 2, c'est donner du sens aux ressources, aux méthodes HTTP et aux statuts. Nous n'avons pas besoin de transformer cela en concours d'acronymes. »

**44:30–46:00 · Question flash au groupe** (dernière mission)

> « Si nous changeons toute l'interface mais gardons le contrat compatible, devons-nous réécrire le service ? »

Réponse attendue : non pour ce seul motif ; la compatibilité des données, des règles, des droits et des usages doit rester assurée. Après la discussion, « Voir la réponse attendue » affiche cette réponse et accomplit la dernière mission : le message « Bravo : les 11 missions sont réussies » apparaît quand le parcours est complet.

**46:00–48:00 · Les quatre messages et la clôture**

Les quatre messages en bas de l'onglet renvoient chacun vers l'étape concernée (« Revoir l'étape N ») et rappellent ce que le groupe a pratiqué.

> « DDD nous aide à clarifier le métier, avec des mots que tout le monde emploie. API first stabilise les échanges attendus : le contrat, sa sécurité et ses erreurs. Richardson niveau 2 donne du sens aux ressources, aux méthodes et aux statuts. L'IA rédige et construit, mais les faits viennent de l'API et la clé reste un secret. »

> « Moderniser, ce n'est pas simplement repeindre le vieux chat : c'est rendre ses capacités utilisables sans devoir ouvrir toute la cuisine. »

Rappeler d'une phrase que la clé de la séance sera renouvelée. Conclure sur la phrase de fin (voir à la fin de la section 5).

### 48:00–52:00 — Marge, pas un chapitre supplémentaire

Absorber une génération IA lente, un quota atteint, le collage d'un prompt ou un aléa réseau. Si tout est fluide, ouvrir les questions dès 48:00. **À 52:00, arrêter la démonstration.**

## 4. Questions et échanges — 52:00–60:00

| Question probable | Réponse courte |
|---|---|
| Une API, c'est une base de données ? | Non. Elle expose une interface avec des règles et des droits ; elle ne donne pas nécessairement accès au stockage sous-jacent. |
| Une API oblige à faire des microservices ? | Non. Un monolithe peut exposer une API ; DDD et architecture de déploiement ne sont pas synonymes. |
| Un OAS garantit que le service fonctionne ? | Non. Il décrit un contrat ; il faut aussi des tests, une implémentation conforme et une exploitation fiable. |
| Pourquoi des tris locaux ? | Le catalogue reçu permet ces tris. Nous distinguons volontairement ce que fait l'API et ce que fait le navigateur. |
| Pourquoi ne pas donner la clé à l'IA ? | Une clé est un secret. L'exécuteur d'outils ou le serveur doit gérer l'authentification sans l'inclure dans le prompt. Dans nos ateliers, la clé est une constante que vous remplacez vous-même dans le fichier, après la génération. |
| Peut-on laisser la clé dans la page HTML générée ? | Pour un essai sur votre poste, oui ; jamais pour une page publiée : tout visiteur la lit avec F12 et peut épuiser le quota. C'est la raison d'être du BFF. Renouvelez la clé après la séance. |
| L'IA a-t-elle inventé les photos ? | Non. Avec les données réelles, les URL de photos proviennent des réponses du fournisseur. Avec les données simulées (plan B), l'application utilise des illustrations signalées. |
| Et si l'API change ? | Un changement compatible peut être transparent ; une rupture demande une stratégie de versionnement, des tests de contrat et l'adaptation des consommateurs. |
| Quel rapport avec notre existant ? | Un service peut encapsuler une capacité existante. La modernisation peut être progressive, sans réécriture générale immédiate. |
| L'IA a-t-elle vraiment appelé l'API ? | Cela dépend de l'atelier. À l'étape 4, le kiosque appelle l'API puis transmet les données dans le prompt. Dans l'atelier de l'étape 2 et pour le vote, l'IA écrit du code et c'est la page générée qui appelle l'API avec `fetch`. Un assistant qui appelle lui-même l'API est une étape distincte (connecteur, permissions, contrôles), non incluse. |
| Pourquoi `--ssl-no-revoke` ? | Schannel, sous Windows, vérifie la révocation du certificat ; sur le réseau d'entreprise, le serveur de révocation est souvent injoignable (erreur 35, `CRYPT_E_NO_REVOCATION_CHECK`). L'option saute uniquement ce contrôle : acceptable pour essayer une API publique, pas une habitude. Jamais `-k`. |
| Sans clé, pourquoi un 403 et pas un 401 ? | TheCatAPI répond 403 pour une clé absente ou invalide et réserve plutôt le 401 à un compte inactif ; d'autres fournisseurs font autrement. Lire le code de statut, jamais la formulation du message. |
| Pourquoi un 429 en pleine séance ? | La formule gratuite est limitée à 10 requêtes par minute : si le groupe partage une clé, le quota se partage. Patienter une minute, ou une clé par table. |
| Pourquoi viser le niveau 2 de Richardson et pas le 3 ? | Le niveau 2 suffit à rendre l'API lisible par un humain, un outil ou une IA. Le niveau 3 (liens hypermédia) demande plus de conception pour un bénéfice que peu de consommateurs exploitent. Dans les réponses vues, aucun lien d'action : pas de niveau 3 constaté, sans prétendre avoir audité toute l'API. |
| Comment ferait-on pour créer une race de chat ? | Contrat d'abord : `POST /breeds` dans l'OAS, avec le corps attendu et les réponses 201 (créée), 400 (invalide), 403 (refusée), 409 (existe déjà) ; relecture avec le métier, mock, puis serveur et clients en parallèle. En niveau 2 : 201 Created et un en-tête `Location` vers `GET /breeds/{id}`. Écriture réservée à un rôle précis. TheCatAPI ne propose pas cette création (catalogue en lecture seule) ; `POST /pets` crée un chat individuel qui référence une race par `breed_id`. |
| Pourquoi l'application de vote n'envoie-t-elle pas les voix à TheCatAPI ? | L'API sait enregistrer des votes, mais le contrat fourni ne décrit aucune opération pour en supprimer un : une erreur resterait chez un tiers. Écrire demande des droits, une confirmation et la possibilité de corriger. La page compte donc localement et additionne le résultat Beekast. |
| Le kiosque est-il relié à Beekast ? | Non. Le résultat est un texte collé : une donnée, bornée à 1 500 caractères, que le prompt demande de ne jamais suivre comme une instruction. Une intégration réelle demanderait une API Beekast et ses droits. |
| Pourquoi cet outil IA et pas un autre ? | C'est l'outil validé par l'entreprise (Copilot Entreprise, version sécurisée). Avec un autre assistant, vérifier d'abord qu'il est autorisé pour cet usage ; aucun secret ni donnée interne dans le prompt. |
| Est-il sûr de coller le code d'une IA dans le kiosque ? | Le code d'une IA est un code que vous n'avez pas écrit : il faut le relire. La fenêtre d'essai limite les dégâts : la page tourne dans un cadre isolé qui ne voit ni les données du kiosque ni ses cookies, ne peut joindre que thecatapi.com et ne peut ni ouvrir de fenêtre ni changer l'adresse du kiosque. Cela ne remplace pas la relecture : ne collez que du code relu. Et ne collez jamais une clé dans le code : le champ masqué est fait pour cela. |
| Que devient la clé tapée dans la fenêtre d'essai ? | Elle sert à l'appel de la page de test, puis disparaît : jamais enregistrée, jamais envoyée au serveur du kiosque, effacée à la fermeture de la fenêtre ; le journal la masque s'il la croise. La page testée la connaît pendant l'essai, comme tout code qui appelle l'API avec cette clé : d'où l'intérêt de relire le code et de renouveler la clé après la séance. |
| Où le contrat dit-il qu'une clé est nécessaire ? | Dans l'OAS, à deux endroits : `components.securitySchemes` déclare le schéma (`x-api-key`, de type `apiKey`, à envoyer dans l'en-tête `x-api-key`) et `security` dit que les appels doivent le présenter. C'est le gros plan de l'onglet 2, lu en direct dans le contrat. |

## 5. Raccourcis si le temps manque

- **À 01:00**, si le public connaît déjà le DDD, ne lire que l'image du chantier du bloc « Trois mots à connaître, sans jargon » (30 secondes) et passer au test du mot « chat ».
- **À 16:00**, si l'appel curl avec clé n'a pas été joué, le jouer dans la fenêtre « Jouer » plutôt que dans les terminaux.
- **À 21:00**, si le prompt 1 n'a pas produit une page qui s'affiche, ne pas lancer les prompts 2 et 3 : lire le `fetch` du code obtenu (ou de la page préparée à l'avance, annoncée comme telle), garder la minute sur la clé et la question « créer une race », et laisser les prompts 2 et 3 en exercice (ils sont dans le kiosque).
- **Si la fenêtre d'essai échoue** (cadre vide, poste verrouillé, extension qui injecte du code), ne pas insister : enregistrer le code dans `fiche-chartreux.html` (ou `vote-chats.html`) et l'ouvrir dans le navigateur, ou montrer la page préparée à l'avance, annoncée comme telle. Si le message parle de stockage local (`localStorage`) ou de cookies, c'est normal : la fenêtre d'essai n'en a pas ; redemander à l'IA de garder les données en mémoire, dans une variable. La fenêtre d'essai est un confort, jamais une mission.
- **À 25:00 au plus tard**, passer à l'onglet 3 même si des missions restent ouvertes.
- **À 31:00**, ne montrer qu'une fiche. Abandonner toute explication détaillée des schémas.
- **À 40:00**, si la page de vote n'est pas affichée, montrer le prompt, expliquer la transformation attendue et passer à l'ouverture.
- **À 43:00**, sans résultat Beekast réel, utiliser l'exemple fictif et dire qu'il est fictif. Ne jamais inventer un résultat présenté comme réel.
- La banque de questions pour le groupe (section 6) est la première à sauter.
- **À ne pas sacrifier :** le contraste 403 puis 200, la clé jamais dans un prompt ni à l'écran, la distinction données réelles / fiction, et les huit minutes de questions.

**Dernière phrase à retenir : « Le contrat décrit les possibilités ; nos applications et nos outils les exploitent. »**

## 6. Banque de questions pour le groupe

Ces 28 questions (5, 7, 6, 7 et 3) sont un outil d'animation : elles ne figurent pas dans le kiosque, que les auditeurs voient en direct, puisque la réponse ne doit pas s'afficher avant que le groupe ait cherché. L'animateur pose la question à voix haute (une ou deux par onglet suffisent), laisse répondre, puis donne la réponse. Elles sont facultatives et ne comptent pas dans les 11 missions.

### Onglet 1 · Le besoin (5 questions)

1. **De quoi a-t-on besoin pour choisir notre mascotte ?**
   *Il n'y a pas une seule bonne réponse.* Le groupe propose deux critères et une action : chercher une race, comparer des informations, consulter une fiche. Ces envies deviendront les demandes faites à l'API dans les étapes suivantes. La réservation et l'adoption restent hors sujet.
2. **Une race, une photo, un chat individuel : est-ce la même chose pour le métier ?**
   *Non, et le dire clairement, c'est déjà du DDD.* Une race décrit une famille de chats, une photo illustre une race, un chat individuel a son propre caractère. Des mots précis évitent les confusions : c'est le langage commun que cherche le DDD (la conception à partir du métier).
3. **Pourquoi parle-t-on de langage « ubiquitaire » ?**
   *Parce que ce sont les mêmes mots partout : métier, écran, code et API.* Ubiquitaire veut dire « présent partout ». C'est le vocabulaire que partagent le métier et l'informatique : on l'emploie en réunion, sur les écrans, dans le code, dans le contrat de l'API et jusque dans les consignes données à l'IA. Quand un mot change de sens d'un endroit à l'autre, les malentendus deviennent des anomalies.
4. **L'API dit « breeds » et le métier dit « race » : quel mot faut-il employer ?**
   *Les deux, à condition de tenir un glossaire.* Le fournisseur impose ses mots anglais (`/breeds`, `life_span`) ; le métier garde les siens (race, espérance de vie). On note la correspondance dans un glossaire et on traduit à un seul endroit, à la frontière entre les deux : ici, la fonction `parseBreed`. C'est, en très léger, ce que le DDD appelle une « couche anti-corruption » : un traducteur qui empêche les mots du fournisseur de s'infiltrer partout.
5. **Le DDD impose-t-il un microservice par mot du métier ?**
   *Non.* Le DDD aide à clarifier le vocabulaire et les responsabilités du métier. Découper ensuite l'application en un seul bloc (monolithe) ou en petits services (microservices) est une autre décision : un monolithe peut très bien proposer une API.

### Onglet 2 · Le contrat (7 questions)

1. **À quoi sert un fichier OpenAPI, ou OAS ?**
   *À décrire ce qu'on peut demander à une API.* Les adresses, les actions possibles, les informations à fournir, les réponses, les accès : tout est écrit dans un fichier lisible par les humains comme par les outils. C'est la carte du restaurant : elle ne donne ni la recette, ni les clés de la cuisine.
2. **TheCatAPI publie son contrat : peut-on en déduire qu'elle a été conçue « API first » ?**
   *Non : on constate un contrat, pas une méthode.* « API first » veut dire convenir du contrat avant de développer les écrans ou les logiciels qui utiliseront l'API. Ici, le fournisseur et son contrat existent déjà : nous ne pouvons pas savoir comment il a travaillé. Pour nos propres services, c'est nous qui discuterions le contrat en amont.
3. **Le contrat annonce une réponse 200 : peut-on en conclure qu'il n'y aura jamais d'erreur ?**
   *Non : un contrat dit surtout ce qui marche.* Il ne décrit pas toujours ce qui peut échouer. Un logiciel bien conçu prévoit un accès refusé (403), une ressource introuvable (404) ou un quota dépassé (429, trop de demandes) ; le kiosque les affiche tels que reçus dans « L'API à la loupe ».
4. **Sans clé, l'API répond 403 : pourquoi pas 401 ?**
   *Les deux existent ; ici le fournisseur a choisi 403.* Selon la norme HTTP, 401 veut plutôt dire « je ne sais pas qui vous êtes » et 403 « je vous ai compris, mais c'est refusé ». TheCatAPI annonce 403 pour une clé absente ou invalide, et réserve 401 à un compte inactif. L'essentiel : se fier au code de statut, jamais à la phrase du message, qui peut changer.
5. **Faut-il toujours ajouter `--ssl-no-revoke` à curl ?**
   *Non : c'est un contournement de poste, pas une habitude.* Un certificat est la carte d'identité numérique d'un site. Derrière le proxy d'une entreprise, Windows (Schannel) ne peut parfois pas vérifier que cette carte n'a pas été annulée (« révoquée »), et curl s'arrête avec `CRYPT_E_NO_REVOCATION_CHECK`. L'option saute seulement cette vérification : la chaîne, le nom et la date du certificat restent contrôlés. Acceptable pour une démonstration sur une API publique ; `-k` (`--insecure`), lui, désactive toute vérification du certificat.
6. **Peut-on laisser la clé dans une page HTML générée par l'IA ?**
   *Pour un essai oui, en production non.* Tout ce qui figure dans une page web (HTML ou JavaScript) peut être lu par n'importe quel visiteur (touche F12). Une clé exposée peut être réutilisée par d'autres et épuiser le quota. C'est la raison d'être du « BFF » de ce kiosque, le petit serveur intermédiaire : la clé reste de son côté. Pour l'exercice, utiliser une clé d'essai et ne jamais la coller dans le prompt.
7. **Comment ferait-on pour créer une race de chat ?**
   *En écrivant d'abord le contrat, avec le métier, puis en développant.* C'est un cas d'école de l'approche API first : on décide de la forme avant d'écrire le moindre code.
   - Langage ubiquitaire : le métier commence par définir ce qu'est une race et quelles informations la décrivent (nom, origine, tempérament…), avant toute ligne de code.
   - Contrat d'abord : on ajoute au contrat l'opération `POST /breeds`, avec les informations attendues et les réponses possibles : 201 race créée, 400 demande invalide, 403 accès refusé, 409 race déjà existante.
   - Niveau 2 de Richardson : un POST sur la ressource `/breeds`, le statut 201 (« créé ») et une information jointe à la réponse (l'en-tête `Location`) qui donne l'adresse de la nouvelle race, consultable ensuite par `GET /breeds/{id}`.
   - Relecture et simulation : le métier et les futurs utilisateurs de l'API relisent le contrat, une simulation permet de l'essayer, puis le serveur et les écrans se développent en parallèle.
   - Sécurité : créer, c'est écrire, donc réservé à un rôle précis (clé ou jeton dédié) ; ce n'est pas ouvert à tout le monde.
   - À noter : le contrat de TheCatAPI ne propose aucune création de race, le catalogue est en lecture seule. Il décrit en revanche la création d'un chat individuel, `POST /pets`, qui le rattache à une race existante par son `breed_id` : une race n'est pas un chat.

### Onglet 3 · Les appels (6 questions)

1. **Quand des propositions apparaissent pendant la saisie, l'API est-elle appelée ?**
   *Non : la complétion est locale.* Elle réutilise la liste des races déjà reçue (`GET /breeds`). Seul le bouton « Rechercher via l'API » envoie une vraie demande (`GET /breeds/search?q=…`) : dans « L'API à la loupe », aucun nouvel appel n'apparaît pendant la saisie.
2. **Que nous disent la méthode et le statut d'un appel ?**
   *La méthode dit l'intention, le statut dit le résultat.* GET consulte, POST envoie une information pour créer quelque chose. 200 = réussi, 403 = accès refusé, 404 = introuvable, 429 = trop de demandes. Donner ce sens aux adresses, aux verbes et aux statuts, c'est l'esprit du niveau 2 de Richardson.
3. **Le tri par pays est-il une fonction de l'API ?**
   *Non : c'est un usage des données déjà reçues.* Le navigateur filtre et trie la liste déjà reçue, sans nouvel appel. Le même service pourrait alimenter une autre application, un portail ou un outil métier, chacun avec ses propres tris.
4. **Pourquoi l'ouverture d'une fiche déclenche-t-elle deux appels ?**
   *Parce qu'un écran peut composer plusieurs ressources.* La race vient d'un premier appel (`GET /breeds/{id}`), ses photos d'un second (`GET /images/search`). L'API ne fournit pas la page toute faite : c'est l'écran (Angular) qui assemble les deux. Les trois photos demandées sont un maximum, pas une garantie.
5. **Pourquoi viser le niveau 2 de Richardson plutôt que le niveau 3 ?**
   *Parce que le niveau 2 apporte l'essentiel pour un effort raisonnable.* Le niveau 2 donne une adresse à chaque ressource et fait travailler les verbes et les statuts : c'est lisible, testable et compris par tous les outils. Le niveau 3 (les réponses contiennent des liens vers les actions possibles, comme sur une page web) demande plus de conception, pour un bénéfice que les logiciels clients n'exploitent pas toujours. C'est un choix d'architecture, qu'on peut revoir.
6. **Une API n'a qu'une seule adresse, répond toujours 200 et se commande toujours en POST : quel niveau de Richardson ?**
   *Le niveau 0.* Tout passe par un seul guichet : l'action demandée et l'éventuelle erreur sont cachées dans le contenu du message. Au niveau 1, chaque ressource a son adresse ; au niveau 2, les verbes et les statuts portent le sens ; au niveau 3, les réponses proposent des liens.

### Onglet 4 · L'IA (7 questions)

1. **Qui a appelé l'API : l'IA ou le kiosque ?**
   *Le kiosque.* L'IA ne reçoit que le résultat, collé dans un prompt : cette page n'appelle aucun modèle d'IA. Un assistant qui appellerait lui-même l'API serait une autre étape, avec un connecteur, des autorisations et des contrôles : lui fournir le contrat ne suffit pas.
2. **Dans la candidature rédigée par l'IA, qu'est-ce qui est un fait et qu'est-ce qui est inventé ?**
   *Les faits viennent de l'API, la fiction vient de l'IA.* Origine, tempérament, poids… sont repris de la réponse du service. L'IA apporte la reformulation et trois lignes d'humour marquées « Fiction ». Elle ne doit inventer ni pays, ni score, ni identifiant, ni URL ; une donnée absente se dit « non renseigné ».
3. **Peut-on coller la clé d'API dans le prompt pour que l'IA appelle le service ?**
   *Non : une clé est un secret.* Collée dans un prompt, elle serait conservée dans l'historique de l'outil et pourrait être divulguée. La clé se gère côté serveur : ici, elle reste dans le petit serveur intermédiaire (le BFF, en Java) et n'est jamais envoyée au navigateur.
4. **Pourquoi le prompt précise-t-il que les données sont du « contenu externe non fiable » ?**
   *Parce qu'une donnée reçue pourrait ressembler à une consigne.* Un champ renvoyé par une API peut contenir n'importe quel texte, y compris une phrase qui donne un ordre (« ignore tes consignes… »). Le prompt rappelle donc que ces données restent des données : l'IA ne doit jamais les suivre comme des instructions.
5. **La page HTML générée par l'IA est-elle utilisable telle quelle ?**
   *Non : l'IA propose, c'est vous qui validez.* Relire le code, ou le faire relire par un développeur : la clé ne doit apparaître qu'à l'endroit prévu, les textes venus de l'API doivent s'afficher comme du simple texte (`textContent`, qui empêche un texte piégé de s'exécuter) et une erreur doit s'afficher au lieu de tout casser. Puis tester, par exemple avec une mauvaise clé : on doit voir apparaître le 403 que l'on connaît désormais.
6. **Dans l'application de vote, d'où viennent les chiffres ?**
   *Du résultat Beekast collé dans le prompt, et des clics locaux.* L'IA recopie le résultat Beekast sans rien inventer. Les voix ajoutées par les boutons « Voter » sont comptées à part, en mémoire de la page. Le classement indique la source de chaque nombre : un chiffre dont on ignore l'origine ne prouve rien.
7. **Pourquoi l'application de vote n'envoie-t-elle pas les voix à TheCatAPI ?**
   *Parce que le contrat ne permet pas de les retirer.* TheCatAPI propose bien d'envoyer un vote (`POST /votes`), mais le contrat fourni ne décrit aucune opération pour supprimer un vote : une voix envoyée par erreur y resterait. Pour un exercice partagé, on compte donc localement. Écrire chez un tiers demande des droits, une confirmation et la possibilité de corriger une erreur.

### Onglet 5 · Le bilan (3 questions)

1. **Pourquoi le kiosque n'exécute-t-il jamais `POST /favourites` ?**
   *Parce que POST écrit chez le fournisseur, et qu'un kiosque partagé ne modifie rien.* GET consulte ; POST pourrait créer un favori chez le fournisseur. Avant toute écriture, et plus encore si elle est déclenchée par une IA, on définit qui en a le droit et on demande une confirmation.
2. **Une API, est-ce une base de données ?**
   *Non.* Une API expose une interface avec ses règles et ses droits. Elle ne donne pas nécessairement accès au stockage qui se trouve derrière.
3. **Et si l'API du fournisseur change demain ?**
   *Cela dépend : le changement est-il compatible ?* Un changement compatible (par exemple un nouveau champ) peut passer inaperçu. Une rupture (un champ qui disparaît) demande de gérer des versions, de tester le respect du contrat et d'adapter les logiciels qui utilisent l'API : une raison de plus de s'entendre sur le contrat dès le départ.
