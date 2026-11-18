import { isRecord } from './cat.models';
import { BEEKAST_SAMPLE, cleanBeekast, KEY_PLACEHOLDER } from './practice';

export type SandboxScenarioId = 'fiche' | 'vote';
export interface SandboxScenario { id: SandboxScenarioId; file: string; eyebrow: string; title: string; }

export const SANDBOX_SCENARIOS: Readonly<Record<SandboxScenarioId, SandboxScenario>> = {
  fiche: { id: 'fiche', file: 'fiche-chartreux.html', eyebrow: 'ATELIER IA · LA FICHE DU CHARTREUX', title: 'Faites tourner la page écrite par l’IA' },
  vote: { id: 'vote', file: 'vote-chats.html', eyebrow: 'ATELIER VOTE · LE CHIEF HAPPINESS CHAT', title: 'Faites tourner l’application de vote écrite par l’IA' },
};

/** Étiquette commune au kiosque et à `sandbox.html` : tout autre message reçu est ignoré. */
export const SANDBOX_CHANNEL = 'kiosque-sandbox';
export const SANDBOX_MAX = 30000;
export const SANDBOX_CALLS_MAX = 20;
/** Clé fictive des données simulées : la simulation l'accepte, le vrai fournisseur la refuserait. */
export const SANDBOX_SIMULATED_KEY = 'CLE-FICTIVE-SIMULATION';

const KEY_FORMAT = /^[A-Za-z0-9_-]{8,120}$/;
const SECRET_PATTERNS: readonly RegExp[] = [
  /live_[A-Za-z0-9]{16,}/,
  new RegExp(`\\b(?:api[_-]?key|x-api-key)\\b["']?\\s*[:=]\\s*["'](?!${KEY_PLACEHOLDER}["'])[A-Za-z0-9_-]{16,}["']`, 'i'),
];

export function hasKeyPlaceholder(code: string): boolean {
  return code.includes(KEY_PLACEHOLDER);
}

/** Une clé d'API se compose de lettres, de chiffres, de - et de _ : tout autre caractère est refusé avant d'entrer dans le code. */
export function isKeyFormat(key: string): boolean {
  return KEY_FORMAT.test(key);
}

export function prepareSandboxCode(code: string, key: string): string {
  return code.split(KEY_PLACEHOLDER).join(key);
}

/** Avertit, sans bloquer, quand le code collé contient déjà ce qui ressemble à une vraie clé. */
export function looksLikeSecret(code: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(code));
}

/** Le journal affiche des adresses reçues d'une page tierce : une clé saisie ou passée dans l'URL n'y figure jamais. */
export function maskSecrets(text: string, key = ''): string {
  const masked = text.replace(/(api_key=)[^&\s"']+/gi, '$1•••').replace(/live_[A-Za-z0-9]{16,}/g, '•••');
  return key.length >= 4 ? masked.split(key).join('•••') : masked;
}

export interface CallReading { tone: 'ok' | 'erreur'; text: string; }

/** Explique en clair l'issue d'un appel fait par la page ; 0 signifie « aucune réponse exploitable ». */
export function readCall(status: number): CallReading {
  if (status >= 200 && status < 300) return { tone: 'ok', text: 'L’API a répondu : la page n’a plus qu’à afficher la réponse.' };
  if (status === 0) return { tone: 'erreur', text: 'Aucune réponse exploitable : adresse en dehors de thecatapi.com (bloquée par cette fenêtre), réseau coupé ou refus du navigateur (CORS).' };
  if (status === 401 || status === 403) return { tone: 'erreur', text: 'Refus de l’API : la clé est absente ou invalide. Vérifiez la constante API_KEY et l’en-tête x-api-key.' };
  if (status === 404) return { tone: 'erreur', text: 'Introuvable : l’adresse ou l’identifiant demandé n’existe pas.' };
  if (status === 429) return { tone: 'erreur', text: 'Quota dépassé : la formule gratuite est limitée à 10 requêtes par minute. Patientez une minute.' };
  if (status >= 500) return { tone: 'erreur', text: 'Le fournisseur ne répond pas correctement : le problème ne vient pas de votre page.' };
  return { tone: 'erreur', text: 'Réponse inattendue : lisez le code de statut.' };
}

export type SandboxEvent =
  | { type: 'ready' }
  | { type: 'escape' }
  | { type: 'call'; method: string; url: string; status: number; ms: number }
  | { type: 'error'; message: string };

const integerWithin = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/** Ce qui vient du cadre est écrit par une page tierce : seul un message de forme connue est retenu, borné, et affiché en texte. */
export function parseSandboxEvent(data: unknown): SandboxEvent | null {
  if (!isRecord(data) || data['channel'] !== SANDBOX_CHANNEL) return null;
  if (data['type'] === 'ready') return { type: 'ready' };
  if (data['type'] === 'escape') return { type: 'escape' };
  if (data['type'] === 'error' && typeof data['message'] === 'string') return { type: 'error', message: data['message'].slice(0, 300) };
  const { method, url, status, ms } = data;
  if (data['type'] === 'call' && typeof method === 'string' && /^[A-Z]{3,7}$/.test(method) && typeof url === 'string' && integerWithin(status, 599) && integerWithin(ms, 600000)) {
    return { type: 'call', method, url: url.slice(0, 200), status, ms };
  }
  return null;
}

export interface SandboxCall { n: number; method: string; url: string; status: number; ms: number; }

/** Traduit en conseil les erreurs les plus fréquentes d'une page générée par l'IA dans la fenêtre isolée. */
export function explainError(message: string): string {
  if (/localStorage|sessionStorage|cookie|indexedDB|sandboxed/i.test(message)) {
    return 'La fenêtre d’essai n’a ni stockage local ni cookies : demandez à l’IA de garder les données en mémoire, dans une variable JavaScript.';
  }
  if (/Bloqué par la fenêtre isolée/.test(message)) {
    return 'Cette fenêtre ne laisse passer que thecatapi.com : demandez à l’IA de n’utiliser aucune autre adresse, bibliothèque ou police externe.';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'L’appel n’a pas abouti : adresse inexacte, réseau coupé ou refus du navigateur (CORS). Regardez le journal des appels.';
  }
  return '';
}

export function addCall(calls: readonly SandboxCall[], event: Extract<SandboxEvent, { type: 'call' }>, key = ''): SandboxCall[] {
  const n = (calls[calls.length - 1]?.n ?? 0) + 1;
  return [...calls, { n, method: event.method, url: maskSecrets(event.url, key), status: event.status, ms: event.ms }].slice(-SANDBOX_CALLS_MAX);
}

export interface BeekastOption { nom: string; score: number | null; }
const BEEKAST_OPTIONS_MAX = 12;
const BEEKAST_NAME_MAX = 40;
const BEEKAST_LINE = /^(?:\d+\s*[.)]\s+)?(.+?)\s*(?::|：|\t|\s[-–—]\s|\s)\s*\(?(\d+(?:[.,]\d+)?)\s*(?:voix|votes?|points?|pts?|%)?\s*\)?$/i;

/** Lit « une option et son score par ligne » ; un score illisible reste à null au lieu d'être inventé. */
export function parseBeekast(raw: string): BeekastOption[] {
  const options: BeekastOption[] = [];
  for (const line of cleanBeekast(raw).split('\n').map((item) => item.trim()).filter(Boolean)) {
    if (/^exemple fictif/i.test(line)) continue;
    const match = BEEKAST_LINE.exec(line);
    const name = (match ? match[1] : line.split(/[:：\t]/)[0]).trim().slice(0, BEEKAST_NAME_MAX);
    if (!name) continue;
    const score = match ? Number(match[2].replace(',', '.')) : null;
    options.push({ nom: name, score: score !== null && Number.isFinite(score) ? score : null });
    if (options.length === BEEKAST_OPTIONS_MAX) break;
  }
  return options;
}

const FICHE_PAGE = String.raw`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fiche du Chartreux</title>
<style>
  body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #f5f4ed; color: #172f29; }
  .fiche { max-width: 480px; margin: 0 auto; overflow: hidden; background: #fff; border-radius: 16px; box-shadow: 0 4px 18px rgba(0, 0, 0, .12); }
  .photo { display: block; width: 100%; height: 220px; object-fit: cover; background: #dfe6d9; }
  .corps { padding: 16px 22px 22px; }
  h1 { margin: 0 0 2px; }
  .origine { margin: 0 0 12px; color: #52665d; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 14px 0 0; }
  dt { font-weight: 700; }
  dd { margin: 0; }
  .erreur { margin: 0; padding: 18px 22px; color: #743518; background: #fff1ed; font-weight: 600; }
</style>
</head>
<body>
<main id="fiche" class="fiche"><p class="corps">Chargement de la fiche…</p></main>
<script>
// 1. La clé d'API : la preuve d'identité que l'API réclame (voir « Comprendre le refus »).
const API_KEY = '${KEY_PLACEHOLDER}';

// 2. L'adresse demandée : la race « char », le Chartreux.
const URL_RACE = 'https://api.thecatapi.com/v1/breeds/char';

// 3. L'appel : fetch envoie une requête GET avec l'en-tête x-api-key, puis attend la réponse.
async function chargerRace() {
  const reponse = await fetch(URL_RACE, { headers: { 'x-api-key': API_KEY } });
  if (!reponse.ok) {
    const detail = (await reponse.text()).slice(0, 200);
    throw new Error('HTTP ' + reponse.status + ' — ' + detail);
  }
  return reponse.json(); // le corps JSON devient un objet JavaScript
}

// 4. L'affichage : textContent écrit du texte brut, jamais du HTML venu de l'extérieur.
function ligne(liste, libelle, valeur) {
  const terme = document.createElement('dt');
  terme.textContent = libelle;
  const definition = document.createElement('dd');
  definition.textContent = valeur || 'Non renseigné';
  liste.append(terme, definition);
}

function afficher(race) {
  const fiche = document.getElementById('fiche');
  fiche.replaceChildren();
  if (race.image && race.image.url) {
    const photo = document.createElement('img');
    photo.className = 'photo';
    photo.src = race.image.url;
    photo.alt = 'Photo : ' + race.name;
    fiche.append(photo);
  }
  const corps = document.createElement('div');
  corps.className = 'corps';
  const titre = document.createElement('h1');
  titre.textContent = race.name;
  const origine = document.createElement('p');
  origine.className = 'origine';
  origine.textContent = race.origin;
  const description = document.createElement('p');
  description.textContent = race.description;
  const liste = document.createElement('dl');
  ligne(liste, 'Tempérament', race.temperament);
  ligne(liste, 'Espérance de vie', race.life_span ? race.life_span + ' ans' : '');
  ligne(liste, 'Poids', race.weight && race.weight.metric ? race.weight.metric + ' kg' : '');
  corps.append(titre, origine, description, liste);
  fiche.append(corps);
}

// 5. Si l'appel échoue, la page le dit au lieu de rester vide.
chargerRace().then(afficher).catch((erreur) => {
  const message = document.createElement('p');
  message.className = 'erreur';
  message.textContent = 'Impossible d’afficher la fiche. ' + erreur.message;
  document.getElementById('fiche').replaceChildren(message);
});
</script>
</body>
</html>
`;

const VOTE_PAGE = String.raw`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vote du Chief Happiness Chat</title>
<style>
  body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #f5f4ed; color: #172f29; }
  main { max-width: 640px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .aide { margin: 0 0 14px; color: #52665d; font-size: 14px; }
  #classement { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .candidat { display: grid; grid-template-columns: 64px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; background: #fff; border: 2px solid transparent; border-radius: 12px; }
  .candidat.gagnant { border-color: #214f40; background: #eef6e4; }
  .vignette { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; background: #dfe6d9; }
  .nom { margin: 0; font-weight: 700; }
  .parts { margin: 2px 0 0; color: #52665d; font-size: 13px; }
  .total { display: block; font-size: 22px; font-weight: 800; text-align: right; }
  button { margin-top: 4px; padding: 6px 12px; border: 1px solid #214f40; border-radius: 8px; background: #fff; font: inherit; cursor: pointer; }
  #statut, #fiche { margin-top: 16px; padding: 12px 16px; background: #fff; border-radius: 12px; }
  .erreur { color: #743518; background: #fff1ed !important; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Quelle race pour notre Chief Happiness Chat ?</h1>
  <p class="aide">Classement = score Beekast + voix données dans cette page.</p>
  <ol id="classement"></ol>
  <p id="statut">Chargement des fiches des races…</p>
  <section id="fiche" hidden></section>
</main>
<script>
// 1. Le résultat du vote Beekast, recopié tel quel (un score illisible reste à null).
const RESULTAT_BEEKAST = __RESULTAT__;

// 2. La clé d'API et l'adresse de l'unique appel réseau.
const API_KEY = '${KEY_PLACEHOLDER}';
const URL_RACES = 'https://api.thecatapi.com/v1/breeds';

const voixLocales = {}; // nombre de clics sur « Voter », par option
let races = [];         // les races reçues de l'API

// 3. On compare les noms sans tenir compte des accents ni de la casse.
function normaliser(texte) {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function trouverRace(nom) {
  const cible = normaliser(nom);
  return races.find((race) => normaliser(race.name) === cible);
}
function total(option) {
  return (option.score || 0) + (voixLocales[option.nom] || 0);
}

// 4. L'affichage : tout le texte reçu passe par textContent.
function afficher() {
  const liste = document.getElementById('classement');
  liste.replaceChildren();
  const classement = [...RESULTAT_BEEKAST].sort((a, b) => total(b) - total(a));
  classement.forEach((option, rang) => {
    const race = trouverRace(option.nom);
    const carte = document.createElement('li');
    carte.className = rang === 0 ? 'candidat gagnant' : 'candidat';

    const vignette = document.createElement('img');
    vignette.className = 'vignette';
    vignette.alt = '';
    if (race && race.image && race.image.url) vignette.src = race.image.url;

    const texte = document.createElement('div');
    const nom = document.createElement('p');
    nom.className = 'nom';
    nom.textContent = (rang + 1) + '. ' + option.nom;
    const parts = document.createElement('p');
    parts.className = 'parts';
    const beekast = option.score === null ? 'score illisible' : option.score + ' voix Beekast';
    parts.textContent = beekast + ' + ' + (voixLocales[option.nom] || 0) + ' voix ici' + (race ? '' : ' · race inconnue de l’API');
    texte.append(nom, parts);

    const droite = document.createElement('div');
    const score = document.createElement('span');
    score.className = 'total';
    score.textContent = total(option);
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.textContent = 'Voter';
    bouton.addEventListener('click', () => {
      voixLocales[option.nom] = (voixLocales[option.nom] || 0) + 1;
      afficher();
    });
    droite.append(score, bouton);

    carte.append(vignette, texte, droite);
    liste.append(carte);
  });
  afficherGagnant(classement[0]);
}

function afficherGagnant(option) {
  const fiche = document.getElementById('fiche');
  const race = option && trouverRace(option.nom);
  fiche.hidden = !race;
  if (!race) return;
  const titre = document.createElement('h2');
  titre.textContent = 'En tête : ' + race.name;
  const detail = document.createElement('p');
  detail.textContent = (race.origin || 'Origine inconnue') + ' · ' + (race.temperament || 'Tempérament non renseigné');
  const description = document.createElement('p');
  description.textContent = race.description || '';
  fiche.replaceChildren(titre, detail, description);
}

// 5. Un seul appel réseau au chargement : ensuite, tout se passe dans la page.
async function demarrer() {
  const statut = document.getElementById('statut');
  try {
    const reponse = await fetch(URL_RACES, { headers: { 'x-api-key': API_KEY } });
    if (!reponse.ok) throw new Error('HTTP ' + reponse.status + ' — ' + (await reponse.text()).slice(0, 200));
    races = await reponse.json();
    statut.hidden = true;
  } catch (erreur) {
    statut.className = 'erreur';
    statut.textContent = 'Les fiches des races sont indisponibles. ' + erreur.message;
  }
  afficher();
}
demarrer();
</script>
</body>
</html>
`;

/** Un exemple de ce que l'IA peut produire : le même qu'au prompt, pour tester la fenêtre sans attendre l'assistant. */
export function sampleCode(scenario: SandboxScenarioId, beekast: string): string {
  if (scenario === 'fiche') return FICHE_PAGE;
  const parsed = parseBeekast(beekast);
  const options = parsed.length ? parsed : parseBeekast(BEEKAST_SAMPLE);
  // Le résultat Beekast est une donnée collée : `<` est échappé pour qu'il ne referme jamais la balise script.
  const data = JSON.stringify(options).replace(/</g, '\\u003c');
  return VOTE_PAGE.replace('__RESULTAT__', () => data);
}
