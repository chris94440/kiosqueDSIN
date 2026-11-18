import assert from "node:assert/strict";
import { once } from "node:events";
import { join } from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";

if (typeof WebSocket === "undefined") throw new Error("Lancer avec node --experimental-websocket sur Node 20.");

let permit = false;
let delaySearch = false;
let imagesFail = false;
let photoFixture;
const imageHostRequests = [];
const noKeyRequests = [];
const cdnRequests = [];
const cspViolations = [];
// Fenêtre d'essai : la page de l'IA tourne dans une iframe isolée, cible CDP à part (session propre) que le test pilote
// et dont il joue le fournisseur : TheCatAPI est simulé côté navigateur, aucune requête réelle ne part vers l'extérieur.
const apiRequests = [];
const exfilRequests = [];
const pageRequests = [];
const sandboxFrames = new Set();
let sandboxFrame;
let apiBehavior = "ok";
let watchPageRequests = false;
// siam : photo réduite par le BFF ; char : introuvable pour le BFF mais joignable en direct (repli sur l'original) ;
// birm : introuvable partout (illustration attendue).
const photoFiles = { siam: "photo-fixture.jpg", char: "direct-only-fixture.jpg", birm: "gone-fixture.jpg" };
const withPhoto = (breed) => photoFiles[breed.id]
  ? { ...breed, image: { id: breed.id, url: `https://cdn2.thecatapi.com/images/${photoFiles[breed.id]}` } } : breed;
const fixtureBreeds = JSON.parse(await readFile(new URL("../backend/src/main/resources/demo-breeds.json", import.meta.url), "utf8"));
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    // Mêmes champs que les erreurs du vrai fournisseur : l'atelier curl les montre tels quels aux participants.
    const refuse = (status, message, error) => send({ statusCode: status, timestamp: new Date().toISOString(), path: url.pathname, message, error }, status);
    if (url.pathname.startsWith("/images/")) {
      imageHostRequests.push({ path: url.pathname, apiKey: req.headers["x-api-key"] });
      if (url.pathname !== "/images/photo-fixture.jpg") { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("absent"); }
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(photoFixture);
    }
    if (!req.headers["x-api-key"]) {
      noKeyRequests.push(url.pathname);
      return refuse(403, "Authentication required. Please provide a valid API key.", "Forbidden");
    }
    if (!permit) return send({ message: "Authentication required (test fixture)" }, 403);
    const path = url.pathname.replace(/^\/v1/, "");
    if (path === "/breeds/search" && delaySearch) await new Promise((resolve) => setTimeout(resolve, 300));
    if (path === "/images/search") {
      return imagesFail ? send({ message: "Quota images dépassé (test fixture)" }, 429)
        : send([{ id: "photo-test", url: "https://cdn2.thecatapi.com/images/photo-fixture.jpg" }]);
    }
    const found = fixtureBreeds.find((breed) => breed.id === path.slice("/breeds/".length));
    if (path.startsWith("/breeds/") && path !== "/breeds/search" && !found) return refuse(404, "Breed not found", "Not Found");
    const result = path === "/breeds" ? { status: 200, data: fixtureBreeds.map(withPhoto) }
      : path === "/breeds/search" ? { status: 200, data: fixtureBreeds.filter((breed) => `${breed.name} ${breed.alt_names || ""}`.toLowerCase().includes(url.searchParams.get("q").toLowerCase())).map(withPhoto) }
      : { status: 200, data: found && withPhoto(found) };
    if (path === "/breeds/siam" && result.status === 200) {
      result.data = { ...result.data, description: "<img src=x onerror=alert('unsafe')> Donnée externe affichée comme texte." };
    }
    return send(result.data, result.status);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const probeAddress = probe.address();
if (!probeAddress || typeof probeAddress === "string") throw new Error("Port de validation indisponible.");
const bffPort = probeAddress.port;
await new Promise((resolve) => probe.close(resolve));
const bffBase = `http://127.0.0.1:${bffPort}`;
const backend = spawn("java", [
  `-Dquarkus.http.port=${bffPort}`,
  `-Dthecatapi.base-url=http://127.0.0.1:${server.address().port}/v1`,
  `-Dthecatapi.images-base-url=http://127.0.0.1:${server.address().port}/images/`,
  "-Dthecatapi.api-key=test-only-not-a-real-key",
  "-jar", "target\\quarkus-app\\quarkus-run.jar",
], { cwd: fileURLToPath(new URL("../backend", import.meta.url)), stdio: ["ignore", "pipe", "pipe"] });
let backendError;
let backendOutput = "";
backend.on("error", (error) => { backendError = error; });
backend.stdout.on("data", (chunk) => { backendOutput += chunk.toString(); });
backend.stderr.on("data", (chunk) => { backendOutput += chunk.toString(); });
const profile = await mkdtemp(join(tmpdir(), "dsin-browser-"));
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
  "--disable-extensions", "--disable-sync", "about:blank",
], { stdio: "ignore" });
let chromeError;
chrome.on("error", (error) => { chromeError = error; });
let socket;
let browserSocket;
const pending = new Map();
const errors = [];
const editorRequests = [];
const editorErrors = [];
let editorPhase = false;
let sequence = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
  return result.result.value;
}

async function waitFor(expression, description = expression) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  if (editorPhase) {
    console.error("Swagger diagnostic :", await evaluate("({status: document.querySelector('#oas-status')?.textContent, editor: !!window.editor, ace: !!document.querySelector('.ace_editor'), title: document.querySelector('.swagger-ui .info .title')?.textContent, body: document.body.innerText.slice(0, 1000)})"));
    console.error("Erreurs navigateur :", errors, editorErrors);
    await screenshot("swagger-error.png");
  }
  throw new Error(`Attente expirée : ${description}`);
}

async function select(id, value) {
  await evaluate(`(() => { const n = document.getElementById(${JSON.stringify(id)}); n.value = ${JSON.stringify(value)}; n.dispatchEvent(new Event('change', {bubbles:true})); })()`);
}

async function input(value) {
  await evaluate(`(() => { const n = document.getElementById('search'); n.focus(); n.value = ${JSON.stringify(value)}; n.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}

async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

async function press(key, keyCode) {
  for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: keyCode });
}

// Atelier curl : la commande montrée aux participants, avec le repère à la place de la clé.
const CURL_SANS_CLE = "curl https://api.thecatapi.com/v1/breeds/abys --ssl-no-revoke";
const curlAvecCle = (id) => `curl -H "x-api-key: VOTRE_CLE_API" https://api.thecatapi.com/v1/breeds/${id} --ssl-no-revoke`;
const curlDialogOpen = "document.querySelector('#curl-dialog').open";

async function curlId(value) {
  await evaluate(`(() => { const n = document.getElementById('curl-id'); n.focus(); n.value = ${JSON.stringify(value)}; n.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await waitFor("!document.querySelector('#curl-result')", "la saisie d'un identifiant efface le résultat précédent");
}

async function playCurl() {
  await click("#curl-play");
  await waitFor("!!document.querySelector('#curl-status')", "résultat de l'appel curl");
  return evaluate(`(() => ({
    status: document.querySelector('#curl-status').textContent.trim(),
    tone: document.querySelector('#curl-result').dataset.tone,
    reading: document.querySelector('#curl-reading')?.textContent ?? '',
    body: document.querySelector('#curl-body')?.textContent ?? '',
    success: !!document.querySelector('#curl-success'),
    simulated: !!document.querySelector('#curl-result .tag.required'),
  }))()`);
}

async function openCurlDialog(id, expectedCommand) {
  await click(`#curl-open-${id}`);
  await waitFor(curlDialogOpen, `fenêtre curl « ${id} » ouverte`);
  assert.equal(await evaluate("document.activeElement.id"), "curl-play", "le focus doit arriver sur le bouton « Jouer »");
  assert.equal(await evaluate("document.querySelector('#curl-command').textContent"), expectedCommand);
  assert.equal(await evaluate("!!document.querySelector('#curl-result')"), false, "aucun résultat avant de jouer");
}

// Le navigateur livre l'événement « close » à la trame suivante : tant que le résultat n'est pas effacé, rouvrir la fenêtre ferait perdre l'appel suivant.
async function closeCurlDialog() {
  await click("#curl-close");
  await waitFor(`!${curlDialogOpen} && !document.querySelector('#curl-result')`, "fenêtre curl refermée, résultat effacé");
}

// Fenêtre d'essai. Le cadre isolé est une cible à part : on s'y attache dès sa création, on y joue le fournisseur
// et l'on surveille toute requête vers un hôte que sa politique interdit.
function attachSandboxFrame({ sessionId, targetInfo }) {
  const isFrame = targetInfo.type === "iframe";
  if (isFrame) { sandboxFrames.add(sessionId); sandboxFrame = sessionId; }
  const prepare = isFrame
    ? command("Fetch.enable", { patterns: [{ urlPattern: "https://api.thecatapi.com/*" }, { urlPattern: "https://exfil.invalid/*" }] }, sessionId)
    : Promise.resolve();
  prepare.then(() => command("Runtime.runIfWaitingForDebugger", {}, sessionId))
    .catch((error) => { if (sandboxFrames.has(sessionId)) errors.push(`Cadre isolé : ${error.message}`); });
}

function forgetSandboxFrame(sessionId) {
  sandboxFrames.delete(sessionId);
  if (sandboxFrame === sessionId) sandboxFrame = [...sandboxFrames].at(-1);
}

// Faux TheCatAPI vu du cadre : l'aperçu CORS (OPTIONS) ne porte pas l'en-tête x-api-key, l'appel (GET) doit le porter.
function answerSandboxRequest(sessionId, { requestId, request }) {
  const header = (name) => Object.entries(request.headers).find(([key]) => key.toLowerCase() === name)?.[1];
  const settle = (method, params) => command(method, { requestId, ...params }, sessionId)
    .catch((error) => { if (sandboxFrames.has(sessionId)) errors.push(`Cadre isolé : ${error.message}`); });
  const { hostname, pathname } = new URL(request.url);
  if (hostname !== "api.thecatapi.com") {
    exfilRequests.push(request.url);
    return settle("Fetch.failRequest", { errorReason: "BlockedByClient" });
  }
  apiRequests.push({ method: request.method, path: pathname, key: header("x-api-key") });
  if (apiBehavior === "fail") return settle("Fetch.failRequest", { errorReason: "ConnectionRefused" });
  const cors = [{ name: "access-control-allow-origin", value: "*" }];
  const answer = (responseCode, body, extra = []) => settle("Fetch.fulfillRequest", {
    responseCode, responseHeaders: [...cors, ...extra],
    ...(body === undefined ? {} : { body: Buffer.from(JSON.stringify(body)).toString("base64") }),
  });
  if (request.method === "OPTIONS") return answer(204, undefined, [{ name: "access-control-allow-headers", value: "x-api-key" }, { name: "access-control-allow-methods", value: "GET" }]);
  const json = [{ name: "content-type", value: "application/json" }];
  if (!header("x-api-key")) return answer(403, { statusCode: 403, message: "Authentication required. Please provide a valid API key.", error: "Forbidden" }, json);
  if (pathname === "/v1/breeds") return answer(200, fixtureBreeds, json);
  const found = fixtureBreeds.find((breed) => breed.id === pathname.slice("/v1/breeds/".length));
  return found ? answer(200, found, json) : answer(404, { statusCode: 404, message: "Breed not found" }, json);
}

async function waitUntil(predicate, description) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await sleep(50);
  }
  throw new Error(`Attente expirée : ${description}`);
}

async function frameEvaluate(expression) {
  await waitUntil(() => sandboxFrame, "cadre isolé attaché");
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sandboxFrame);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description);
  return result.result.value;
}

async function frameWaitFor(expression, description = expression) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    try { if (await frameEvaluate(expression)) return; }
    catch { /* le cadre vient d'être remplacé ou n'a pas fini de charger */ }
    await sleep(50);
  }
  throw new Error(`Attente expirée (cadre isolé) : ${description}`);
}

const sandboxOpen = "document.querySelector('#sandbox-dialog').open";
const sandboxTitles = { fiche: "Faites tourner la page écrite par l’IA", vote: "Faites tourner l’application de vote écrite par l’IA" };

async function openSandbox(scenario) {
  await click(`#sandbox-open-${scenario}`);
  await waitFor(sandboxOpen, `fenêtre d'essai « ${scenario} » ouverte`);
  assert.equal(await evaluate("document.querySelector('#sandbox-title').textContent"), sandboxTitles[scenario]);
  assert.equal(await evaluate("document.activeElement.id"), "sandbox-title", "le focus doit arriver sur le titre de la fenêtre d'essai");
  // Le navigateur garde le défilement d'une fenêtre fermée : sans remise en haut, le bouton « Fermer » resterait masqué.
  assert.equal(await evaluate("document.querySelector('#sandbox-dialog').scrollTop"), 0, "la fenêtre d'essai doit s'ouvrir sur son haut");
}

async function closeSandbox() {
  await click("#sandbox-close");
  await waitFor(`!${sandboxOpen} && !document.querySelector('#sandbox-stage iframe')`, "fenêtre d'essai refermée, cadre isolé retiré");
}

// Saisie : la valeur change puis Angular est prévenu par l'événement input, comme pour une frappe.
async function typeInto(selector, value) {
  await evaluate(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); n.focus(); n.value = ${JSON.stringify(value)}; n.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}

async function runSandbox() {
  await click("#sandbox-run");
  await waitFor("!document.querySelector('#sandbox-stage').hidden && !!document.querySelector('#sandbox-stage iframe')", "page lancée dans le cadre isolé");
}

const sandboxJournal = () => evaluate(`[...document.querySelectorAll('#sandbox-calls li')].map((item) => ({
  method: item.querySelector('.call-method').textContent.trim(),
  url: item.querySelector('.call-url').textContent.trim(),
  status: item.querySelector('.call-status').textContent.trim(),
  tone: item.dataset.tone,
}))`);

// Un vrai clic de souris dans le cadre : le clavier appartient alors au cadre, plus au kiosque.
async function clickInsideSandboxFrame() {
  await evaluate("document.querySelector('#sandbox-stage').scrollIntoView({ block: 'center' })");
  const box = await evaluate("(() => { const frame = document.querySelector('#sandbox-stage iframe').getBoundingClientRect(); return { x: frame.left, y: frame.top }; })()");
  for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: box.x + 6, y: box.y + 6, button: "left", clickCount: 1 });
}

// La touche est livrée au document du cadre lui-même, là où le clavier se trouve après le clic.
async function pressInSandboxFrame(key, keyCode) {
  for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: keyCode }, sandboxFrame);
}

// Pages que le participant pourrait coller : un appel sans clé, et une page qui tente tout ce que le cadre doit refuser.
const NO_KEY_PAGE = `<!doctype html><html lang="fr"><body><p id="out">en attente</p><script>
fetch('https://api.thecatapi.com/v1/breeds/abys').then((reponse) => { document.getElementById('out').textContent = 'statut ' + reponse.status; });
</script></body></html>`;
const HOSTILE_PAGE = `<!doctype html><html lang="fr"><body><pre id="out"></pre><script>
const out = document.getElementById('out');
const note = (text) => { out.textContent += text + '\\n'; };
const attempt = (name, action) => { try { note(name + ' => ' + action()); } catch (error) { note(name + ' => ' + error.name); } };
attempt('parent', () => parent.document.title);
attempt('stockage', () => localStorage.length);
attempt('cookie', () => document.cookie);
attempt('eval', () => eval('1 + 1'));
attempt('popup', () => String(window.open('https://exfil.invalid/popup')));
const xhr = new XMLHttpRequest();
xhr.open('GET', 'https://exfil.invalid/xhr');
xhr.onerror = () => note('xhr => bloqué');
xhr.send();
const image = new Image();
image.onerror = () => note('image => bloquée');
image.src = 'https://exfil.invalid/pixel.png';
</script></body></html>`;

const STEPS = ["besoin", "contrat", "appels", "ia", "bilan"];
const tabShown = (id) => `document.querySelector('#tab-${id}')?.getAttribute('aria-selected') === 'true' && document.querySelector('#panel-${id}')?.getClientRects().length > 0`;
const missionDone = (id) => `!!document.querySelector('li[data-mission=${id}]')?.classList.contains('done')`;

async function openTab(id) {
  await click(`#tab-${id}`);
  await waitFor(tabShown(id), `onglet « ${id} » affiché`);
}

// Instantané du parcours : onglet actif, statut de chaque onglet, missions réussies, ancre de l'URL.
const journey = () => evaluate(`(() => {
  const tabs = [...document.querySelectorAll('[role=tab]')];
  const bar = document.querySelector('.journey-progress');
  return {
    active: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.id.slice(4)),
    statuses: Object.fromEntries(tabs.map((tab) => [tab.id.slice(4), tab.dataset.status])),
    missions: [...document.querySelectorAll('li.done[data-mission]')].map((item) => item.dataset.mission),
    done: bar.value, total: bar.max, hash: location.hash, count: document.querySelector('#journey-count').textContent.trim(),
  };
})()`);
const statuses = (values) => Object.fromEntries(STEPS.map((id, index) => [id, values[index]]));

// Le dico du jargon se pilote comme le ferait un visiteur.
const jargonOpen = "document.querySelector('#jargon-dialog').open";
const jargonEntries = "document.querySelectorAll('#jargon-list .jargon-entry').length";

// Le kiosque est diffusé en direct : rien de ce qui sert à l'animateur seul ne doit apparaître à l'écran du public.
const presenterTerms = /animateur|présentateur|répétition|(?:choisi\w*|changer de|votre|son|mon) profil|questions pour le groupe/i;
async function assertBroadcastable(where) {
  const page = await evaluate(`(() => ({
    controls: ['#profile-picker', '#mode', '.for-you', '.qa', '.timing'].filter((selector) => document.querySelector(selector)),
    text: document.body.textContent.replace(/\\s+/g, ' '),
  }))()`);
  assert.deepEqual(page.controls, [], `commande réservée à l'animateur affichée (${where})`);
  const found = page.text.match(presenterTerms);
  assert.equal(found, null, `texte réservé à l'animateur affiché (${where}) : « ${found && page.text.slice(Math.max(0, found.index - 60), found.index + 60)} »`);
}

// Un vrai chargement de page : la progression, gardée en mémoire seulement, repart de zéro comme pour un nouveau visiteur.
async function loadPage(path) {
  await command("Page.navigate", { url: "about:blank" });
  await command("Page.navigate", { url: `${bffBase}${path}` });
}

async function screenshot(name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
  const { cssContentSize } = await command("Page.getLayoutMetrics");
  const { data } = await command("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
  });
  await writeFile(join(process.env.SCREENSHOT_DIR, name), Buffer.from(data, "base64"));
}

// Une fenêtre modale se regarde comme l'utilisateur la voit : le seul écran visible, sans agrandir la page.
async function viewportScreenshot(name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
  const { data } = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(process.env.SCREENSHOT_DIR, name), Buffer.from(data, "base64"));
}

// Un bloc de page se regarde à l'échelle réelle : l'écran visible, calé sous la barre des étapes.
async function viewportScreenshotAt(name, selector) {
  if (!process.env.SCREENSHOT_DIR) return;
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await evaluate(`scrollBy({ top: -(document.querySelector('.journey').getBoundingClientRect().height + 12), behavior: 'instant' })`);
  await viewportScreenshot(name);
  await evaluate("scrollTo({ top: 0, behavior: 'instant' })");
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (backendError) throw backendError;
    if (backend.exitCode !== null) throw new Error(`Quarkus ne démarre pas : ${backendOutput}`);
    try { if ((await fetch(`${bffBase}/config`)).ok) { ready = true; break; } }
    catch (error) { if (error.cause?.code !== "ECONNREFUSED") throw error; }
    await sleep(100);
  }
  if (!ready) throw new Error(`Quarkus ne répond pas : ${backendOutput}`);
  let connection;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (chromeError) throw chromeError;
    try { connection = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n"); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await sleep(100);
  }
  if (!connection) throw new Error("Chrome ne démarre pas. Définir CHROME_PATH si nécessaire.");
  const [port, browserPath] = connection;
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await once(socket, "open");
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message));
      else callback.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Log.entryAdded" && /Content Security Policy/i.test(message.params.entry.text)) cspViolations.push(message.params.entry.text);
    if (editorPhase && message.method === "Network.requestWillBeSent") editorRequests.push(message.params.request.url);
    if (watchPageRequests && !message.sessionId && message.method === "Network.requestWillBeSent") pageRequests.push(JSON.stringify(message.params.request));
    if (message.method === "Target.attachedToTarget") attachSandboxFrame(message.params);
    if (message.method === "Target.detachedFromTarget") forgetSandboxFrame(message.params.sessionId);
    if (editorPhase && message.method === "Log.entryAdded" && message.params.entry.level === "error") editorErrors.push(message.params.entry.text);
    if (message.method === "Fetch.requestPaused" && message.sessionId) answerSandboxRequest(message.sessionId, message.params);
    else if (message.method === "Fetch.requestPaused") {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#d7ec9b"/><text x="140" y="220" font-size="48">Photo de test</text></svg>';
      const gone = message.params.request.url.includes("gone-fixture");
      cdnRequests.push(message.params.request.url);
      command("Fetch.fulfillRequest", {
        requestId: message.params.requestId, responseCode: gone ? 404 : 200,
        responseHeaders: [{ name: "Content-Type", value: gone ? "text/plain" : "image/svg+xml" }],
        body: Buffer.from(gone ? "absent" : svg).toString("base64"),
      }).catch((error) => errors.push(error.message));
    }
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Fetch.enable", { patterns: [{ urlPattern: "https://cdn2.thecatapi.com/*" }] });
  // Chrome sert d'encodeur : photo 800 x 500 rouge | verte (carré central) | bleue pour le faux serveur d'images.
  photoFixture = Buffer.from(await evaluate(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500;
    const context = canvas.getContext('2d');
    [['#dc1414', 0, 150], ['#14c814', 150, 500], ['#1414dc', 650, 150]].forEach(([color, x, width]) => { context.fillStyle = color; context.fillRect(x, 0, width, 500); });
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  })()`), "base64");
  assert.ok(photoFixture.length > 500, "photo de test non générée");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: bffBase });
  await waitFor("document.querySelector('#error')?.textContent.includes('HTTP 403')");
  assert.equal(await evaluate("document.querySelectorAll('.breed-card').length"), 0);
  assert.equal(await evaluate("document.querySelector('#source-banner').classList.contains('simulated')"), false, "adresse ordinaire : données réelles, jamais simulées");
  // Régression : la CSP bloquait la feuille de style différée par Angular, d'où une page sans mise en forme.
  assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(245, 244, 237)", "feuille de style non appliquée");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].map((link) => link.media || 'all')"), ["all"]);
  assert.deepEqual(cspViolations, []);
  console.log("OK : feuille de style appliquée, aucune violation de la politique CSP.");

  // Une seule application pour tous les publics : l'accueil se lit sans rien choisir et chaque étape s'ouvre sur « En deux mots ».
  const welcome = await evaluate(`(() => ({
    open: document.querySelector('#welcome').open,
    summary: document.querySelector('#welcome > summary').textContent.replace(/\\s+/g, ' ').trim(),
    tips: document.querySelectorAll('#welcome .welcome-tips > li').length,
    ideas: [...document.querySelectorAll('#welcome .acronyms strong')].map((node) => node.textContent.trim()),
    duplicates: [...document.querySelectorAll('[id]')].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index),
  }))()`);
  assert.equal(welcome.open, true, "l'accueil doit être ouvert à la première visite");
  assert.match(welcome.summary, /^Bienvenue ! À quoi sert ce kiosque/);
  assert.equal(welcome.tips, 4);
  assert.deepEqual(welcome.ideas, ["DDD", "API first", "Richardson, niveau 2", "IA"]);
  assert.deepEqual(welcome.duplicates, [], "identifiants en double dans la page");
  await assertBroadcastable("accueil");
  await viewportScreenshot("accueil.png");
  const inShort = await evaluate(`(() => Object.fromEntries(${JSON.stringify(STEPS)}.map((id) => {
    const block = document.querySelector('#in-short-' + id);
    const title = block?.querySelector('h3');
    return [id, {
      inPanel: !!block?.closest('#panel-' + id),
      labelled: !!title && block.getAttribute('aria-labelledby') === title.id,
      question: title?.textContent.trim() ?? '',
      lines: [...(block?.querySelectorAll('.in-short-line strong') ?? [])].map((node) => node.textContent.trim()),
      words: block?.querySelectorAll('.in-short-words dt').length ?? 0,
    }];
  })))()`);
  for (const id of STEPS) {
    const found = inShort[id];
    assert.equal(found.inPanel, true, `bloc « En deux mots » absent de l'onglet « ${id} »`);
    assert.equal(found.labelled, true, `bloc « En deux mots » sans nom accessible, onglet « ${id} »`);
    assert.match(found.question, /\u00a0\?$/, `la question « En deux mots » doit être posée en clair, onglet « ${id} »`);
    assert.deepEqual(found.lines, ["Comme dans la vie", "Ce que vous allez faire"], `repères « En deux mots », onglet « ${id} »`);
    assert.ok(found.words >= 1, `au moins un mot expliqué, onglet « ${id} »`);
  }
  // Le détail technique est replié au départ ; chaque bloc porte un repère pour s'y reconnaître (#tech-oas n'existe qu'une fois le contrat lu).
  const techBlocks = await evaluate("[...document.querySelectorAll('details.tech')].map((node) => ({ id: node.id, open: node.open, tag: node.querySelector(':scope > summary .tech-tag')?.textContent.trim() }))");
  assert.ok(techBlocks.length >= 5, `blocs « Côté technique » attendus : ${JSON.stringify(techBlocks)}`);
  assert.equal(techBlocks.some((block) => block.open), false, "les blocs « Côté technique » doivent être repliés au départ");
  assert.ok(techBlocks.every((block) => ["Côté technique", "Pour aller plus loin"].includes(block.tag)), "chaque bloc replié doit porter son repère");
  console.log("OK : accueil sans profil, « En deux mots » sur les cinq étapes, détails techniques repliés, rien de réservé à l'animateur à l'écran.");
  await viewportScreenshotAt("en-deux-mots.png", "#in-short-besoin");

  // Dico du jargon : s'ouvre depuis la barre du haut, se filtre en tapant (accents ignorés), se ferme avec Échap et repart de zéro.
  await click("#open-jargon");
  await waitFor(jargonOpen, "dico du jargon ouvert");
  const allWords = await evaluate(jargonEntries);
  assert.ok(allWords >= 30, `le dico doit expliquer au moins trente mots : ${allWords}`);
  assert.equal(await evaluate("document.querySelector('#jargon-count').textContent.trim()"), `${allWords} mots expliqués`);
  await viewportScreenshot("dico-du-jargon.png");
  await typeInto("#jargon-search", "requete");
  await waitFor("!!document.querySelector('#jargon-requete')", "recherche « requete » sans accent : « Requête et réponse » trouvée");
  const filtered = await evaluate(jargonEntries);
  assert.ok(filtered >= 1 && filtered < allWords, `la recherche doit filtrer la liste : ${filtered} sur ${allWords}`);
  await typeInto("#jargon-search", "zzzzqq");
  await waitFor("!!document.querySelector('#jargon-empty')", "message pour une recherche sans résultat");
  assert.equal(await evaluate(jargonEntries), 0);
  // Dans un champ de recherche, Échap vide d'abord le texte (comportement du navigateur) ; un second Échap referme le dico.
  await press("Escape", 27);
  await waitFor(`${jargonOpen} && document.querySelector('#jargon-search').value === '' && ${jargonEntries} === ${allWords}`, "Échap vide la recherche et la liste complète revient");
  await press("Escape", 27);
  await waitFor(`!${jargonOpen}`, "un second Échap referme le dico");
  // Fermé en cours de recherche, le dico se rouvre sur la liste complète, comme pour le visiteur suivant.
  await click("#open-jargon");
  await waitFor(jargonOpen, "dico rouvert");
  await typeInto("#jargon-search", "json");
  await waitFor(`${jargonEntries} >= 1 && ${jargonEntries} < ${allWords}`, "recherche « json »");
  await click("#jargon-close");
  await waitFor(`!${jargonOpen}`, "bouton Fermer du dico");
  await click("#open-jargon");
  await waitFor(`${jargonOpen} && document.querySelector('#jargon-search').value === '' && ${jargonEntries} === ${allWords}`, "le dico rouvert repart de zéro");
  await click("#jargon-close");
  await waitFor(`!${jargonOpen}`, "dico refermé");
  // Les mots soulignés du texte ouvrent le dico directement sur leur explication.
  for (const [label, id] of [["Dico du jargon", ""], ["couche anti-corruption", "acl"], ["curl", "curl"], ["JSON", "json"], ["BFF", "bff"]]) {
    await evaluate(`[...document.querySelectorAll('button.jargon')].find((button) => button.textContent.trim() === ${JSON.stringify(label)}).click()`);
    const shown = id
      ? `(() => { const entry = document.querySelector('.jargon-entry.focused'); const dialog = document.querySelector('#jargon-dialog').getBoundingClientRect(); const box = entry?.getBoundingClientRect(); return entry?.id === 'jargon-${id}' && box.top >= dialog.top && box.bottom <= dialog.bottom; })()`
      : "!document.querySelector('.jargon-entry.focused')";
    await waitFor(`${jargonOpen} && ${shown}`, `« ${label} » : explication visible dans le dico`);
    await click("#jargon-close");
    await waitFor(`!${jargonOpen}`, `dico refermé après « ${label} »`);
  }
  console.log("OK : dico du jargon : recherche sans accent, aucun résultat, Échap, remise à zéro, mots soulignés.");

  // Parcours en onglets : l'étape 1 s'ouvre par défaut et chaque onglet commande un seul panneau visible.
  const structure = await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('[role=tab]')];
    return {
      ids: tabs.map((tab) => tab.id),
      tabindex: tabs.map((tab) => tab.getAttribute('tabindex')),
      wired: tabs.every((tab) => { const panel = document.getElementById(tab.getAttribute('aria-controls')); return panel?.getAttribute('role') === 'tabpanel' && panel.getAttribute('aria-labelledby') === tab.id; }),
      visible: [...document.querySelectorAll('[role=tabpanel]')].filter((panel) => panel.getClientRects().length > 0).map((panel) => panel.id),
      titles: document.querySelectorAll('h1').length,
    };
  })()`);
  assert.deepEqual(structure.ids, STEPS.map((id) => `tab-${id}`));
  assert.deepEqual(structure.tabindex, ["0", "-1", "-1", "-1", "-1"]);
  assert.equal(structure.wired, true, "chaque onglet doit commander son panneau");
  assert.deepEqual(structure.visible, ["panel-besoin"]);
  assert.equal(structure.titles, 1);
  const start = await journey();
  assert.deepEqual([start.active, start.statuses, start.done, start.total, start.count], [["besoin"], statuses(["current", "todo", "todo", "todo", "todo"]), 0, 11, "0/11 missions"]);
  // L'erreur du fournisseur est portée par l'onglet des appels : elle doit y être visible, sans simulation silencieuse.
  await openTab("appels");
  assert.equal(await evaluate("document.querySelector('#error').getClientRects().length > 0"), true, "erreur HTTP 403 invisible dans l'onglet des appels");
  console.log("OK : onglets ARIA, HTTP 403 visible dans l'onglet des appels, pas de simulation silencieuse.");

  // Clavier : flèches avec rebouclage, Début et Fin. L'ancre de l'URL suit l'onglet et inversement.
  await press("ArrowRight", 39);
  await waitFor(tabShown("ia"), "flèche droite : étape suivante");
  assert.equal(await evaluate("location.hash"), "#ia");
  assert.equal(await evaluate("document.activeElement.id"), "tab-ia");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[role=tab]')].map((tab) => tab.getAttribute('tabindex'))"), ["-1", "-1", "-1", "0", "-1"]);
  // Sans catalogue (403), l'étape IA l'explique au lieu d'afficher un prompt vide.
  assert.match(await evaluate("document.querySelector('#ia-empty')?.textContent ?? ''"), /catalogue n’est pas chargé/);
  assert.equal(await evaluate("!!document.querySelector('#ia-breed')"), false);
  await press("Home", 36);
  await waitFor(tabShown("besoin"), "Début : première étape");
  await press("End", 35);
  await waitFor(tabShown("bilan"), "Fin : dernière étape");
  await press("ArrowRight", 39);
  await waitFor(tabShown("besoin"), "flèche droite sur la dernière étape : retour à la première");
  await press("ArrowLeft", 37);
  await waitFor(tabShown("bilan"), "flèche gauche sur la première étape : retour à la dernière");
  await evaluate("location.hash = '#contrat'");
  await waitFor(tabShown("contrat"), "l'ancre de l'URL ouvre l'onglet correspondant");
  console.log("OK : navigation au clavier (flèches, Début, Fin) et ancre d'URL.");

  // Naviguer replie l'accueil ; le visiteur peut le rouvrir puis le refermer à la main.
  assert.equal(await evaluate("document.querySelector('#welcome').open"), false, "l'accueil doit se replier dès la première navigation");
  await click("#welcome > summary");
  await waitFor("document.querySelector('#welcome').open", "l'accueil se rouvre à la main");
  await click("#welcome > summary");
  await waitFor("!document.querySelector('#welcome').open", "l'accueil se replie à la main");
  console.log("OK : l'accueil se replie à la navigation, puis se rouvre et se referme à la main.");

  // Lien profond : un vrai chargement de page sur #contrat ouvre directement l'étape 2, accueil replié.
  await loadPage("/#contrat");
  await waitFor(`${tabShown("contrat")} && !!document.querySelector('#oas-summary')`, "lien profond #contrat");
  const deep = await journey();
  assert.deepEqual([deep.active, deep.statuses, deep.done], [["contrat"], statuses(["todo", "current", "todo", "todo", "todo"]), 0]);
  assert.equal(await evaluate("document.querySelector('#welcome').open"), false, "un lien profond doit afficher l'étape, accueil replié");

  // Étape 2 : le contrat est lu en direct dans /openapi.json, jamais recopié dans le front.
  const contract = await (await fetch(`${bffBase}/openapi.json`)).json();
  const httpMethods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
  const operationCount = Object.values(contract.paths).reduce((total, item) => total + Object.keys(item).filter((key) => httpMethods.includes(key)).length, 0);
  const chips = await evaluate("document.querySelector('#oas-summary').textContent");
  for (const expected of [`OpenAPI ${contract.openapi}`, `${contract.info.title} · version ${contract.info.version}`, `Serveur : ${contract.servers[0].url}`]) {
    assert.ok(chips.includes(expected), `résumé du contrat : « ${expected} » attendu dans « ${chips} »`);
  }
  assert.match(await evaluate("document.querySelector('#contract').textContent"), new RegExp(`${operationCount} opérations sur ${Object.keys(contract.paths).length} chemins`));
  assert.equal(await evaluate("!!document.querySelector('#oas-missing, #oas-error')"), false, "le kiosque et le contrat ne doivent pas diverger");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('details.op')].map((op) => op.querySelector('.op-method').textContent.trim() + ' ' + op.querySelector('.op-path').textContent.trim())"),
    ["GET /breeds", "GET /breeds/search", "GET /breeds/{id}", "GET /images/search", "POST /favourites"]);
  assert.equal(await evaluate("document.querySelector('#show-contract').getAttribute('href')"), "/oas.html");
  assert.deepEqual((await journey()).missions, [], "aucune mission réussie avant d'avoir déplié une opération");
  await evaluate("[...document.querySelectorAll('details.op')].at(-1).querySelector('summary').click()");
  await waitFor(missionDone("contrat"), "mission « contrat » réussie");
  const post = await evaluate("[...document.querySelectorAll('details.op')].at(-1).querySelector('.op-body').textContent");
  assert.match(post, /image_id/);
  assert.match(post, /corps JSON/);
  assert.match(post, /aucune erreur n’est décrite/);
  assert.match(await evaluate("document.querySelector('#toast').textContent"), /Mission réussie/);
  const afterContract = await journey();
  assert.deepEqual([afterContract.done, afterContract.statuses.contrat, afterContract.count], [1, "current", "1/11 missions"]);
  assert.match(await evaluate("document.querySelector('#next-mission').textContent"), /trois mots du métier/);
  await screenshot("onglet-contrat-ouvert.png");
  console.log(`OK : lien profond, contrat lu en direct (${operationCount} opérations), opération dépliée = mission réussie.`);

  // API first : les quatre temps, puis l'atelier curl. Les commandes sont celles de l'énoncé et la clé n'y figure jamais.
  assert.equal(await evaluate("document.querySelectorAll('#api-first-steps > li').length"), 4);
  assert.equal(await evaluate("document.querySelector('#curl-cmd-sans-cle').textContent"), CURL_SANS_CLE);
  assert.equal(await evaluate("document.querySelector('#curl-cmd-avec-cle').textContent"), curlAvecCle("char"));
  assert.equal(await evaluate("document.querySelectorAll('#lab .lab-step').length"), 3);
  const sslNote = await evaluate("document.querySelector('#ssl-note').textContent");
  for (const expected of ["--ssl-no-revoke", "Schannel", "CRYPT_E_NO_REVOCATION_CHECK", "--insecure"]) assert.ok(sslNote.includes(expected), `laïus sur --ssl-no-revoke : « ${expected} » attendu`);
  // La sécurité est lue dans le contrat, pas recopiée : chaque schéma déclaré montre son type, son emplacement et son nom.
  const schemes = Object.entries(contract.components?.securitySchemes ?? {});
  assert.ok(schemes.length > 0, "le contrat doit déclarer un schéma de sécurité");
  const securityText = await evaluate("document.querySelector('#oas-security').textContent");
  for (const [name, scheme] of schemes) {
    for (const expected of [name, `type ${scheme.type}`, `dans ${scheme.in}`, `nom ${scheme.name}`]) assert.ok(securityText.includes(expected), `sécurité du contrat : « ${expected} » attendu dans « ${securityText} »`);
  }
  const required = [...new Set((contract.security ?? []).flatMap((requirement) => Object.keys(requirement)))];
  assert.ok(required.length > 0, "le contrat doit exiger une clé par défaut");
  const requiredText = await evaluate("document.querySelector('#oas-required').textContent");
  for (const name of required) assert.ok(requiredText.includes(name), `exigence globale « ${name} » attendue`);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#doc-links a')].map((link) => [link.getAttribute('href'), link.target, link.rel])"), [
    ["https://docs.thecatapi.com/docs/authorization", "_blank", "noopener noreferrer"],
    ["https://docs.thecatapi.com/docs/errors", "_blank", "noopener noreferrer"],
    ["https://thecatapi.com/signup", "_blank", "noopener noreferrer"],
    ["/oas.html", "_blank", "noopener"],
  ]);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('a[target=_blank]')].filter((link) => !link.rel.includes('noopener')).map((link) => link.href)"), [], "tout lien externe doit porter rel=noopener");
  // Gros plan : le contrat réduit à la sécurité, lu en direct. Les lignes clés sont surlignées et chaque repère a sa note.
  const [[schemeName, scheme]] = schemes;
  const focusCode = await evaluate("document.querySelector('#oas-focus .oas-code').textContent");
  for (const expected of ['"securitySchemes"', `"${schemeName}"`, `"in": "${scheme.in}"`, `"name": "${scheme.name}"`, `${operationCount} opérations, masquées`]) {
    assert.ok(focusCode.includes(expected), `gros plan du contrat : « ${expected} » attendu dans « ${focusCode} »`);
  }
  assert.equal(await evaluate("document.querySelectorAll('#oas-focus .oas-line.hot').length"), 2, "deux lignes clés : où placer la clé et sous quel nom");
  assert.ok(await evaluate("document.querySelectorAll('#oas-focus .oas-line.muted').length") >= 2, "le reste du fichier est masqué");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#oas-focus .oas-notes code')].map((node) => node.textContent.trim())"), ["securitySchemes", schemeName, "type", "in", "name", "security"]);
  const marks = await evaluate(`(() => ({
    notes: [...document.querySelectorAll('#oas-focus .oas-notes .oas-badge')].map((node) => node.textContent.trim()),
    lines: [...document.querySelectorAll('#oas-focus .oas-code .oas-badge')].map((node) => node.textContent.trim()),
  }))()`);
  assert.deepEqual(marks.lines, marks.notes, "chaque repère du code renvoie à une note de la légende, dans l'ordre");
  const plain = await evaluate("document.querySelector('#oas-plain').textContent");
  for (const expected of ["En clair", `« ${scheme.name} »`, `-H "${scheme.name}: VOTRE_CLE_API"`, "403"]) assert.ok(plain.includes(expected), `explication « en clair » : « ${expected} » attendu`);
  // « En clair » reste affiché en permanence ; le code du contrat, lui, se déplie à la demande.
  assert.equal(await evaluate("!document.querySelector('#oas-plain').closest('details') && document.querySelector('#oas-plain').getClientRects().length > 0"), true, "l'explication « en clair » ne doit pas être repliée");
  assert.deepEqual(await evaluate("(() => { const block = document.querySelector('#tech-oas'); return [block.open, block.querySelector(':scope > summary .tech-tag').textContent.trim()]; })()"), [false, "Côté technique"]);
  await click("#tech-oas > summary");
  await waitFor("document.querySelector('#tech-oas').open && document.querySelector('#oas-focus').getClientRects().length > 0", "bloc technique du contrat déplié");
  assert.equal(await evaluate("document.querySelectorAll('details.tech[open]').length"), 1, "déplier un bloc ne doit pas déplier les autres");
  await viewportScreenshotAt("cote-technique-ouvert.png", "#oas-plain");
  await evaluate("document.querySelector('#oas-focus').scrollIntoView({ block: 'start' })");
  await screenshot("onglet-contrat-gros-plan-oas.png");
  console.log("OK : atelier curl affiché : commandes de l'énoncé, laïus --ssl-no-revoke, sécurité lue dans le contrat, liens vers la documentation.");

  // « Jouer » : le BFF rejoue l'appel. Sans clé, le refus 403 est le résultat attendu, et il vient d'un appel sans l'en-tête x-api-key.
  await openCurlDialog("sans-cle", CURL_SANS_CLE);
  assert.equal(await evaluate("document.querySelector('#curl-id').value"), "abys");
  assert.equal(await evaluate("document.querySelector('#curl-play').disabled"), false);
  assert.equal(await evaluate("!!document.querySelector('#curl-dialog .notice.simulated')"), false, "mode réel : pas de bandeau de simulation");
  const refused = await playCurl();
  assert.deepEqual([refused.status, refused.tone, refused.success, refused.simulated], ["HTTP 403 Forbidden", "refus", true, false]);
  assert.match(refused.body, /"message": "Authentication required\. Please provide a valid API key\."/);
  assert.match(refused.body, /"path": "\/v1\/breeds\/abys"/);
  assert.deepEqual(noKeyRequests, ["/v1/breeds/abys"], "le BFF doit appeler le fournisseur sans l'en-tête x-api-key");
  await waitFor(missionDone("sans-cle"), "mission « sans-cle » réussie");
  await screenshot("fenetre-curl-sans-cle.png");
  // Un identifiant invalide désactive « Jouer » et la touche Entrée n'envoie rien ; un identifiant valide met la commande à jour.
  await curlId("bad id!");
  assert.equal(await evaluate("document.querySelector('#curl-play').disabled"), true);
  assert.equal(await evaluate("document.querySelector('#curl-id').getAttribute('aria-invalid')"), "true");
  await press("Enter", 13);
  await sleep(300);
  assert.equal(await evaluate("!!document.querySelector('#curl-result')"), false);
  assert.deepEqual(noKeyRequests, ["/v1/breeds/abys"], "un identifiant invalide ne doit déclencher aucun appel");
  await curlId("char");
  assert.equal(await evaluate("document.querySelector('#curl-play').disabled"), false);
  assert.equal(await evaluate("document.querySelector('#curl-id').getAttribute('aria-invalid')"), "false");
  assert.equal(await evaluate("document.querySelector('#curl-command').textContent"), "curl https://api.thecatapi.com/v1/breeds/char --ssl-no-revoke");
  await press("Enter", 13);
  await waitFor("!!document.querySelector('#curl-success')", "la touche Entrée joue l'appel");
  assert.deepEqual(noKeyRequests, ["/v1/breeds/abys", "/v1/breeds/char"]);
  await click("#curl-close");
  await waitFor(`!${curlDialogOpen}`, "fenêtre curl refermée");
  await waitFor("!document.querySelector('#curl-result')", "fermer la fenêtre efface le résultat");

  // Avec la clé : un refus reste une erreur, un identifiant inconnu donne 404, seule une réponse 2xx valide la mission.
  await openCurlDialog("avec-cle", curlAvecCle("char"));
  assert.equal(await evaluate("document.querySelector('#curl-id').value"), "char");
  assert.equal(await evaluate("!!document.querySelector('#curl-nokey-warning')"), false);
  const denied = await playCurl();
  assert.deepEqual([denied.status, denied.tone, denied.success], ["HTTP 403 Forbidden", "erreur", false]);
  assert.match(denied.reading, /Refusé malgré la clé/);
  assert.equal(await evaluate(missionDone("avec-cle")), false);
  permit = true;
  await curlId("zzz");
  assert.equal(await evaluate("document.querySelector('#curl-command').textContent"), curlAvecCle("zzz"));
  const unknown = await playCurl();
  assert.deepEqual([unknown.status, unknown.tone, unknown.success], ["HTTP 404 Not Found", "erreur", false]);
  assert.match(unknown.reading, /Introuvable/);
  assert.match(unknown.body, /"message": "Breed not found"/);
  assert.equal(await evaluate(missionDone("avec-cle")), false);
  await curlId("char");
  const accepted = await playCurl();
  assert.deepEqual([accepted.status, accepted.tone, accepted.success, accepted.simulated], ["HTTP 200 OK", "ok", true, false]);
  assert.match(accepted.body, /"name": "Chartreux"/);
  await waitFor(missionDone("avec-cle"), "mission « avec-cle » réussie");
  assert.equal(noKeyRequests.length, 2, "les appels avec clé ne doivent pas passer par la route sans clé");
  await screenshot("fenetre-curl-avec-cle.png");
  await press("Escape", 27);
  await waitFor(`!${curlDialogOpen}`, "Échap referme la fenêtre curl");
  permit = false;
  console.log("OK : fenêtre curl : 403 sans clé, 403 avec clé = erreur, 404, 200, identifiant invalide, Entrée et Échap.");

  // Atelier IA : l'outil validé par l'entreprise, trois prompts progressifs ; seul le premier valide la mission et la clé n'y figure jamais.
  const aiTool = await evaluate("document.querySelector('#ai-tool').textContent");
  for (const expected of ["Copilot Entreprise (version sécurisée)", "GPT-5.6 Sol", "Réfléchir"]) assert.ok(aiTool.includes(expected), `outil IA : « ${expected} » attendu`);
  assert.equal(await evaluate("document.querySelectorAll('#web-basics li').length"), 3);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#ai-lab pre.prompt')].map((node) => node.id)"), ["ai-prompt-1", "ai-prompt-2", "ai-prompt-3"]);
  const aiPrompts = await evaluate("[...document.querySelectorAll('#ai-lab pre.prompt')].map((node) => node.textContent)");
  assert.ok(aiPrompts[0].startsWith("Transforme-moi l’appel curl en application JavaScript simple."));
  assert.ok(aiPrompts[0].includes(curlAvecCle("char")));
  assert.ok(aiPrompts[0].includes("const API_KEY = 'VOTRE_CLE_API';"));
  assert.match(aiPrompts[1], /GET https:\/\/api\.thecatapi\.com\/v1\/breeds,/);
  assert.match(aiPrompts[2], /zoomer sur un chat/);
  assert.ok(aiPrompts.every((text) => !text.includes("live_")), "aucune clé réelle dans les prompts");
  await click("#copy-ai-prompt-2");
  await click("#copy-ai-prompt-3");
  await sleep(300);
  assert.equal(await evaluate(missionDone("page-ia")), false, "seul le prompt 1 valide la mission");
  await click("#copy-ai-prompt-1");
  await waitFor(missionDone("page-ia"), "mission « page-ia » réussie");
  assert.equal(await evaluate("!!document.querySelector('#key-warning')"), true);
  assert.equal(await evaluate("document.body.textContent.includes('live_')"), false, "aucune clé réelle dans la page");
  const afterLab = await journey();
  assert.deepEqual([afterLab.done, afterLab.statuses.contrat], [4, "done"]);
  assert.match(await evaluate("document.querySelector('#next-mission').textContent"), /trois mots du métier/);
  await screenshot("onglet-contrat-atelier-ia.png");
  console.log("OK : atelier IA (Copilot Entreprise, GPT-5.6 Sol, Réfléchir), trois prompts sans clé.");

  // Étape 1 : trois mots du métier, trois ressources. Les boutons précédent et suivant relient les étapes.
  await click("#panel-contrat .panel-nav .quiet");
  await waitFor(tabShown("besoin"), "bouton « étape précédente »");
  for (const id of ["race", "photo", "favori"]) await click(`#reveal-${id}`);
  await waitFor("document.querySelectorAll('.word-call').length === 3", "trois ressources dévoilées");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.word-call')].map((node) => node.textContent.trim())"),
    ["GET /breeds", "GET /images/search?breed_ids=…", "POST /favourites"]);
  await waitFor(missionDone("mots"), "mission « mots » réussie");
  assert.equal((await journey()).done, 5);
  // Langage ubiquitaire : le test du mot « chat », le même mot de la réunion jusqu'au prompt, le glossaire métier ↔ API.
  assert.match(await evaluate("document.querySelector('#ubiq-example').textContent"), /Test du mot «\s*chat\s*»[\s\S]*\/breeds[\s\S]*\/images[\s\S]*\/pets/);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#ubiq-chain > li .chain-stage')].map((node) => node.textContent)"), ["Réunion métier", "Écran", "Contrat OAS", "Appel", "Prompt IA"]);
  assert.equal(await evaluate("document.querySelectorAll('#glossary tbody tr').length"), 7);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#glossary tbody tr th')].slice(0, 4).map((cell) => cell.textContent.trim())"), ["Race", "Photo", "Chat individuel", "Favori"]);
  assert.equal(await evaluate("[...document.querySelectorAll('#glossary tbody code')].some((node) => node.textContent === 'pet')"), true);
  // « En clair » : trois définitions sans jargon, l'image du chantier, et ce que cela change avec une IA.
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#ddd-plain .plain-card h4')].map((node) => node.textContent.trim())"), ["Le domaine", "DDD", "Langage ubiquitaire"]);
  assert.equal(await evaluate("document.querySelectorAll('#ddd-plain .plain-card .plain-here').length"), 3, "chaque définition se rattache au kiosque");
  assert.match(await evaluate("document.querySelector('#ddd-plain .analogy').textContent"), /chantier[\s\S]*cloison[\s\S]*mur porteur[\s\S]*légende du plan/);
  assert.match(await evaluate("document.querySelector('#plain-why').textContent"), /Une IA ne devine pas votre métier/);
  assert.match(await evaluate("document.querySelector('#panel-besoin .lead').textContent"), /Pas de panique/);
  await screenshot("onglet-besoin-en-clair.png");
  await screenshot("onglet-besoin-devoile.png");
  await click("#panel-besoin .panel-nav .primary");
  await waitFor(tabShown("contrat"), "bouton « étape suivante »");
  await click("#next-mission");
  await waitFor(tabShown("appels"), "« Prochaine mission » ouvre l'étape concernée");
  console.log("OK : trois mots du métier, boutons d'étape et prochaine mission.");

  // Richardson : quatre niveaux dont le niveau 2, notre choix ; un lien ramène à l'atelier curl.
  assert.equal(await evaluate("document.querySelectorAll('#richardson-ladder > li.rung').length"), 4);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#richardson-ladder > li.chosen')].map((rung) => rung.dataset.level)"), ["2"]);
  assert.match(await evaluate("document.querySelector('#richardson-ladder .chosen .rung-flag').textContent"), /Notre choix/);
  await click("#back-to-lab");
  await waitFor(tabShown("contrat"), "« Retourner à l'atelier curl »");
  await openTab("appels");
  console.log("OK : échelle de Richardson (niveau 2 choisi) et retour à l'atelier curl.");

  // Plan B : l'adresse /?repetition remplace TheCatAPI par un jeu de données simulé. Page neuve : la progression repart de zéro.
  await loadPage("/?repetition#appels");
  await waitFor("document.querySelectorAll('.breed-card').length === 10 && !document.querySelector('#reload')?.disabled");
  assert.match(await evaluate("document.querySelector('#source-banner').textContent"), /DONNÉES SIMULÉES/);
  await assertBroadcastable("données simulées");
  await input("si");
  await waitFor("document.querySelectorAll('#suggestions li').length > 0");
  const before = await evaluate("document.querySelectorAll('#requests li').length");
  await press("ArrowDown", 40);
  await press("Enter", 13);
  await waitFor("document.querySelector('#search').value === 'Siamese'", "sélection clavier reflétée dans Angular");
  assert.equal(await evaluate("document.querySelector('#search').value"), "Siamese");
  assert.equal(await evaluate("document.querySelectorAll('.breed-card').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#requests li').length"), before);
  await waitFor(missionDone("local"), "mission « local » réussie : complétion sans appel réseau");
  assert.equal(await evaluate(missionDone("search")), false);
  await click("#search-api");
  await waitFor("document.querySelector('#result-count').textContent.includes('résultat de recherche API')");
  assert.match(await evaluate("document.querySelector('#requests li').textContent"), /breeds\/search/);
  await waitFor(missionDone("search"), "mission « search » réussie");
  await click("#reset");
  await select("country", "France");
  assert.equal(await evaluate("document.querySelectorAll('.breed-card').length"), 2);
  await select("sort", "name-desc");
  assert.equal(await evaluate("document.querySelector('.card-body h4').textContent"), "Chartreux");
  await click("#reset");
  await select("sort", "energy");
  assert.equal(await evaluate("document.querySelector('.card-body h4').textContent"), "Persian");
  await select("temperament", "Quiet");
  assert.equal(await evaluate("document.querySelectorAll('.breed-card').length"), 3);
  await click("#reset");
  assert.equal(await evaluate(missionDone("fiche")), false);
  await click('[aria-label="Voir la fiche de Siamese"]');
  await waitFor("!!document.querySelector('#detail-body .detail-grid')");
  assert.match(await evaluate("document.querySelector('#detail-body').textContent"), /FICHE SIMULÉE/);
  assert.equal(await evaluate("document.querySelectorAll('#detail-body img').length"), 0);
  assert.match(await evaluate("document.querySelector('#detail-body').textContent"), /GET \/breeds\/siam → 200/);
  assert.equal(await evaluate(missionDone("fiche")), true);
  assert.equal((await journey()).statuses.appels, "done");
  console.log("OK : complétion clavier, recherche distante, filtres, tris et fiche : les trois missions de l'étape 3.");

  // Étape 4 : la fiche ouvre l'étape IA, où le prompt est construit à partir des réponses de l'API.
  await click("#prepare-ai");
  await waitFor(`${tabShown("ia")} && !!document.querySelector('#ia-prompt')?.value`, "étape IA ouverte depuis la fiche");
  assert.equal(await evaluate("document.querySelector('#detail-dialog').open"), false);
  assert.equal(await evaluate("location.hash"), "#ia");
  assert.equal(await evaluate("document.activeElement.id"), "tab-ia");
  assert.equal(await evaluate("document.querySelector('#ia-breed').value"), "siam");
  assert.match(await evaluate("document.querySelector('#ia-prompt').value"), /SOURCE : JEU DE DONNÉES SIMULÉ/);
  assert.match(await evaluate("document.querySelector('.ia-facts').textContent"), /Siamese/);
  assert.equal(await evaluate("document.querySelectorAll('.ia-calls li').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('img.ia-photo').length"), 0);
  assert.equal(await evaluate("document.querySelector('#copy-ia-prompt').disabled"), false);
  assert.equal(await evaluate(missionDone("prompt")), false);
  await click("#copy-ia-prompt");
  // La mission est réussie même si le presse-papiers du navigateur est refusé : le prompt reste lisible et copiable à la main.
  await waitFor(missionDone("prompt"), "mission « prompt » réussie");
  const afterPrompt = await journey();
  assert.deepEqual([afterPrompt.done, afterPrompt.statuses], [4, statuses(["todo", "todo", "done", "current", "todo"])]);
  assert.match(await evaluate("document.querySelector('#next-mission').textContent"), /trois mots du métier/);
  console.log("OK : fiche → étape IA, prompt fondé sur les réponses de l'API, mission réussie.");

  // Atelier vote : la mission exige un vrai résultat Beekast collé (ou l'exemple fictif), jamais l'emplacement vide.
  assert.equal(await evaluate("document.querySelector('#vote-beekast').maxLength"), 1500);
  assert.equal(await evaluate("document.querySelector('#vote-beekast').value"), "");
  assert.equal(await evaluate("!!document.querySelector('#vote-hint')"), true);
  assert.ok((await evaluate("document.querySelector('#vote-prompt').textContent")).includes("[Collez ici le résultat Beekast"), "emplacement vide signalé dans le prompt");
  await click("#copy-vote-prompt");
  assert.match(await evaluate("document.querySelector('#toast').textContent"), /Collez d’abord le résultat Beekast/);
  await sleep(300);
  assert.equal(await evaluate(missionDone("vote")), false, "un prompt sans résultat Beekast ne valide pas la mission");
  await click("#vote-sample");
  await waitFor("document.querySelector('#vote-beekast').value.includes('Chartreux : 14 voix') && !document.querySelector('#vote-hint')", "exemple Beekast chargé");
  const votePrompt = await evaluate("document.querySelector('#vote-prompt').textContent");
  for (const expected of ["--- DÉBUT DU RÉSULTAT BEEKAST ---", "Chartreux : 14 voix", "--- FIN DU RÉSULTAT BEEKAST ---", "GET https://api.thecatapi.com/v1/breeds", "const API_KEY = 'VOTRE_CLE_API';"]) {
    assert.ok(votePrompt.includes(expected), `prompt de vote : « ${expected} » attendu`);
  }
  assert.ok(!votePrompt.includes("live_"), "aucune clé réelle dans le prompt de vote");
  await screenshot("onglet-ia-vote.png");
  await click("#copy-vote-prompt");
  await waitFor(missionDone("vote"), "mission « vote » réussie");
  const afterVote = await journey();
  assert.deepEqual([afterVote.done, afterVote.statuses], [5, statuses(["todo", "todo", "done", "done", "todo"])]);
  assert.match(await evaluate("document.querySelector('#next-mission').textContent"), /trois mots du métier/);
  console.log("OK : atelier vote : résultat Beekast exigé, prompt délimité, mission réussie.");

  // Données simulées : la fenêtre curl affiche la simulation et n'appelle jamais le fournisseur.
  await openTab("contrat");
  await openCurlDialog("avec-cle", curlAvecCle("char"));
  assert.match(await evaluate("document.querySelector('#curl-dialog .notice.simulated').textContent"), /DONNÉES SIMULÉES/);
  const simulatedOk = await playCurl();
  assert.deepEqual([simulatedOk.status, simulatedOk.tone, simulatedOk.simulated], ["HTTP 200 OK", "ok", true]);
  assert.match(simulatedOk.body, /"name": "Chartreux"/);
  await curlId("zzz");
  const simulatedUnknown = await playCurl();
  assert.deepEqual([simulatedUnknown.status, simulatedUnknown.tone, simulatedUnknown.simulated], ["HTTP 404 Not Found", "erreur", true]);
  assert.match(simulatedUnknown.body, /Race absente du jeu simulé\./);
  await closeCurlDialog();
  await openCurlDialog("sans-cle", CURL_SANS_CLE);
  const simulatedRefusal = await playCurl();
  assert.deepEqual([simulatedRefusal.status, simulatedRefusal.tone, simulatedRefusal.simulated], ["HTTP 403 Forbidden", "refus", true]);
  assert.match(simulatedRefusal.body, /Authentication required\. Please provide a valid API key\./);
  await closeCurlDialog();
  assert.equal(noKeyRequests.length, 2, "la simulation ne doit jamais appeler le fournisseur");
  console.log("OK : fenêtre curl en données simulées : 200, 404 et 403 simulés, aucun appel au fournisseur.");

  // Fenêtre d'essai, données simulées : la page de l'IA tourne dans un cadre isolé, et c'est le kiosque qui simule l'API.
  await command("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await openTab("contrat");
  await openSandbox("fiche");
  assert.match(await evaluate("document.querySelector('#sandbox-simulated').textContent"), /DONNÉES SIMULÉES/);
  assert.equal(await evaluate("!!document.querySelector('#sandbox-live, #sandbox-key-block')"), false, "données simulées : aucune clé à saisir");
  assert.equal(await evaluate("document.querySelector('#sandbox-run').disabled"), true, "rien à exécuter tant que le code est vide");
  assert.equal(await evaluate("!!document.querySelector('#sandbox-empty')"), true);
  const safety = await evaluate("document.querySelector('#sandbox-safety').textContent");
  for (const expected of ["isolé", "thecatapi.com", "code relu"]) assert.ok(safety.includes(expected), `consigne de sécurité : « ${expected} » attendu`);
  await click("#sandbox-sample");
  await waitFor("document.querySelector('#sandbox-code').value.includes('https://api.thecatapi.com/v1/breeds/char') && !document.querySelector('#sandbox-run').disabled", "exemple de la fiche chargé");
  await runSandbox();
  await frameWaitFor("document.querySelector('#fiche h1')?.textContent === 'Chartreux'", "fiche du Chartreux affichée dans le cadre");
  assert.deepEqual(await evaluate(`(() => { const frame = document.querySelector('#sandbox-stage iframe'); return [frame.getAttribute('sandbox'), frame.getAttribute('referrerpolicy'), frame.getAttribute('src'), frame.title]; })()`),
    ["allow-scripts", "no-referrer", "/sandbox.html", "Aperçu isolé de fiche-chartreux.html"]);
  assert.equal(await evaluate("(() => { try { return String(document.querySelector('#sandbox-stage iframe').contentWindow.document.title); } catch (error) { return error.name; } })()"), "SecurityError", "le kiosque ne doit pas pouvoir lire le cadre");
  assert.equal(await frameEvaluate("document.querySelector('#fiche .origine').textContent"), "France");
  assert.equal(await frameEvaluate("self.origin"), "null", "le cadre n'a pas l'origine du kiosque");
  await waitFor("document.querySelectorAll('#sandbox-calls li').length === 1", "appel de la page au journal");
  assert.deepEqual(await sandboxJournal(), [{ method: "GET", url: "https://api.thecatapi.com/v1/breeds/char", status: "HTTP 200 OK", tone: "ok" }]);
  assert.match(await evaluate("document.querySelector('#sandbox-reading').textContent"), /L’API a répondu/);
  assert.deepEqual(apiRequests, [], "avec les données simulées, aucune requête ne part vers le fournisseur");
  await viewportScreenshot("fenetre-essai-fiche.png");

  // Une page qui oublie la clé reçoit le refus de l'API, et le journal l'explique en clair.
  await typeInto("#sandbox-code", NO_KEY_PAGE);
  await runSandbox();
  await frameWaitFor("document.getElementById('out')?.textContent === 'statut 403'", "refus 403 lu par la page");
  await waitFor("document.querySelectorAll('#sandbox-calls li').length === 1 && document.querySelector('#sandbox-calls .call-status').textContent.includes('403')", "refus 403 au journal");
  assert.deepEqual(await sandboxJournal(), [{ method: "GET", url: "https://api.thecatapi.com/v1/breeds/abys", status: "HTTP 403 Forbidden", tone: "erreur" }]);
  assert.match(await evaluate("document.querySelector('#sandbox-reading').textContent"), /clé est absente ou invalide/);

  // Une clé écrite en clair est signalée sans bloquer l'essai ; le repère n'est pas un secret.
  await typeInto("#sandbox-code", "<script>const API_KEY = 'cle_bidon_0123456789abcdef';</script>");
  await waitFor("!!document.querySelector('#sandbox-secret-warning')", "clé en clair signalée");
  assert.equal(await evaluate("document.querySelector('#sandbox-run').disabled"), false, "l'avertissement n'empêche pas l'essai");
  await typeInto("#sandbox-code", "<script>const API_KEY = 'VOTRE_CLE_API';</script>");
  await waitFor("!document.querySelector('#sandbox-secret-warning')", "le repère de clé n'est pas un secret");

  // Une page hostile : tout ce que le cadre doit refuser l'est, et rien ne sort vers un autre hôte.
  await typeInto("#sandbox-code", HOSTILE_PAGE);
  await runSandbox();
  await frameWaitFor("(() => { const text = document.getElementById('out')?.textContent ?? ''; return text.includes('xhr => ') && text.includes('image => '); })()", "tentatives de la page hostile terminées");
  const attempts = Object.fromEntries((await frameEvaluate("document.getElementById('out').textContent")).trim().split("\n").map((line) => line.split(" => ")));
  assert.deepEqual(attempts, { parent: "SecurityError", stockage: "SecurityError", cookie: "SecurityError", eval: "EvalError", popup: "null", xhr: "bloqué", image: "bloquée" });
  await waitFor("/Bloqué par la fenêtre isolée : /.test(document.querySelector('#sandbox-error')?.textContent ?? '')", "blocage signalé dans la fenêtre d'essai");
  assert.match(await evaluate("document.querySelector('#sandbox-error-hint').textContent"), /thecatapi\.com/);
  assert.deepEqual(exfilRequests, [], "aucune requête ne doit sortir vers un autre hôte");
  await viewportScreenshot("fenetre-essai-isolation.png");

  // Quitter l'adresse du cadre est refusé par la politique du kiosque lui-même : Chrome remplace la page par son écran
  // « contenu bloqué », le code de la page hostile ne tourne plus et aucune requête ne part.
  const cspBefore = cspViolations.length;
  await frameEvaluate("void (location.href = 'https://exfil.invalid/navigation')");
  await waitUntil(() => cspViolations.slice(cspBefore).some((text) => text.includes("exfil.invalid")), "navigation du cadre refusée par la politique CSP");
  assert.match(cspViolations.slice(cspBefore).join("\n"), /Framing 'https:\/\/exfil\.invalid[^']*' violates[^]*default-src 'self'/);
  cspViolations.splice(cspBefore);
  await frameWaitFor("location.protocol === 'chrome-error:' && !document.getElementById('out')", "page hostile remplacée par l'écran « contenu bloqué »");
  assert.deepEqual(exfilRequests, []);
  assert.equal(await evaluate(sandboxOpen), true, "le kiosque reste affiché");
  // « Relancer » remet la page saine à la place de l'écran d'erreur.
  await runSandbox();
  await frameWaitFor("(document.getElementById('out')?.textContent ?? '').includes('image => ')", "page relancée après la navigation refusée");

  // Échap ferme la fenêtre même quand le clavier est dans le cadre : le cadre prévient le kiosque.
  await clickInsideSandboxFrame();
  await waitFor("document.activeElement.tagName === 'IFRAME'", "le clavier passe dans le cadre");
  assert.ok(await evaluate("document.querySelector('#sandbox-dialog').scrollTop") > 0, "prémisse : la fenêtre est défilée avant d'être refermée");
  await pressInSandboxFrame("Escape", 27);
  await waitFor(`!${sandboxOpen} && !document.querySelector('#sandbox-stage iframe')`, "Échap pressé dans le cadre : fenêtre d'essai refermée");
  // La souris ne reste pas posée sur la page : un survol décalerait une vignette (translateY) et fausserait les mesures de mise en page.
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await openSandbox("fiche");
  assert.match(await evaluate("document.querySelector('#sandbox-code').value"), /exfil\.invalid/, "le code collé est gardé à la réouverture");
  assert.equal(await evaluate("!!document.querySelector('#sandbox-empty') && !document.querySelector('#sandbox-stage iframe') && !document.querySelector('#sandbox-calls')"), true, "aucune page ne repart seule à la réouverture");
  await closeSandbox();

  // L'application de vote : le résultat Beekast collé dans l'atelier devient les données de la page.
  await openTab("ia");
  await typeInto("#vote-beekast", "Birman : 12\nSiamese : 7\nLicorne : 3");
  await openSandbox("vote");
  await waitFor("/Beekast collé dans l’atelier/.test(document.querySelector('.sandbox-editor > p.hint').textContent)", "l'exemple annonce le résultat Beekast collé");
  await click("#sandbox-sample");
  await waitFor("document.querySelector('#sandbox-code').value.includes('\"nom\":\"Licorne\"')", "exemple de vote chargé");
  assert.ok(!(await evaluate("document.querySelector('#sandbox-code').value")).includes("Chartreux"), "l'exemple reprend le résultat collé, pas l'exemple fictif");
  await runSandbox();
  await frameWaitFor("document.querySelectorAll('#classement .candidat').length === 3 && !!document.querySelector('#fiche h2')", "classement affiché");
  const ranking = "[...document.querySelectorAll('#classement .nom')].map((node) => node.textContent)";
  assert.deepEqual(await frameEvaluate(ranking), ["1. Birman", "2. Siamese", "3. Licorne"]);
  assert.match(await frameEvaluate("document.querySelectorAll('#classement .parts')[2].textContent"), /3 voix Beekast \+ 0 voix ici · race inconnue de l’API/);
  assert.equal(await frameEvaluate("document.querySelector('#fiche h2').textContent"), "En tête : Birman");
  for (let vote = 0; vote < 6; vote++) {
    await frameEvaluate("[...document.querySelectorAll('#classement .candidat')].find((item) => item.querySelector('.nom').textContent.includes('Siamese')).querySelector('button').click()");
  }
  assert.deepEqual(await frameEvaluate(ranking), ["1. Siamese", "2. Birman", "3. Licorne"]);
  assert.match(await frameEvaluate("document.querySelector('#classement .parts').textContent"), /7 voix Beekast \+ 6 voix ici/);
  assert.equal(await frameEvaluate("document.querySelector('#fiche h2').textContent"), "En tête : Siamese");
  await waitFor("document.querySelectorAll('#sandbox-calls li').length === 1", "appel de la page de vote au journal");
  assert.deepEqual(await sandboxJournal(), [{ method: "GET", url: "https://api.thecatapi.com/v1/breeds", status: "HTTP 200 OK", tone: "ok" }]);
  assert.deepEqual(apiRequests, [], "avec les données simulées, aucune requête ne part vers le fournisseur");
  await viewportScreenshot("fenetre-essai-vote.png");
  await closeSandbox();
  console.log("OK : fenêtre d'essai en données simulées : cadre isolé, journal des appels, refus 403, tentatives d'évasion bloquées, Échap, vote fonctionnel.");

  // Retour aux données réelles : adresse ordinaire, page neuve.
  permit = true;
  await loadPage("/#appels");
  await command("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await waitFor("!document.querySelector('#source-banner')?.classList.contains('simulated') && document.querySelectorAll('.breed-card').length === 10 && !document.querySelector('#reload')?.disabled", "retour aux données réelles");
  assert.match(await evaluate("document.querySelector('#source-banner').textContent"), /Les données viennent de TheCatAPI[\s\S]*clé d’accès est configurée côté serveur/);
  // Vue vignette : le BFF réduit les photos, repli sur l'original s'il échoue, puis illustration.
  const photo = (name, selector = "img") => `document.querySelector('[aria-label="Voir la fiche de ${name}"] ${selector}')`;
  const greenDominant = "([r, g, b]) => g > r + 60 && g > b + 60";
  await evaluate(`${photo("Siamese")}.scrollIntoView({ block: 'center' })`);
  await waitFor(`${photo("Siamese")}?.naturalWidth === 320`, "vignette Siamese réduite à 320 px par le BFF");
  assert.equal(await evaluate(`${photo("Siamese")}.getAttribute('src')`), "/photos/photo-fixture.jpg?size=thumb");
  assert.equal(await evaluate(`${photo("Siamese")}.naturalHeight`), 320);
  assert.deepEqual(await evaluate(`(() => {
    const image = ${photo("Siamese")};
    const context = Object.assign(document.createElement('canvas'), { width: 320, height: 320 }).getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return [3, 160, 316].map((x) => (${greenDominant})([...context.getImageData(x, 160, 1, 1).data]));
  })()`), [true, true, true], "la vignette doit être le carré central de la photo");
  await waitFor(`${photo("Chartreux")}?.naturalWidth === 600`, "repli sur l'original quand le BFF ne trouve pas la photo");
  assert.equal(await evaluate(`${photo("Chartreux")}.getAttribute('src')`), "https://cdn2.thecatapi.com/images/direct-only-fixture.jpg");
  await waitFor(`!${photo("Birman")} && !!${photo("Birman", ".placeholder")}`, "illustration quand la photo est introuvable partout");
  const layout = await evaluate(`(() => {
    const image = ${photo("Siamese")}.getBoundingClientRect();
    const tops = new Set([...document.querySelectorAll('.breed-card')].map((card) => Math.round(card.getBoundingClientRect().top)));
    return { width: Math.round(image.width), height: Math.round(image.height), rows: tops.size };
  })()`);
  assert.ok(layout.width <= 220 && layout.height <= 220, `vignette trop grande : ${JSON.stringify(layout)}`);
  assert.ok(layout.rows <= 2, `10 vignettes attendues sur 2 rangées au plus : ${JSON.stringify(layout)}`);
  assert.ok(!cdnRequests.some((url) => url.endsWith("/photo-fixture.jpg")), "la photo d'origine ne doit pas être téléchargée par le navigateur");
  await evaluate("window.scrollTo(0, 0)");
  console.log("OK : vignettes 320 px servies par le BFF, repli sur l'original, illustration, grille compacte.");
  await click('[aria-label="Voir la fiche de Siamese"]');
  await waitFor("!!document.querySelector('#detail-body .detail-grid')");
  assert.equal(await evaluate("document.querySelectorAll('#detail-body img').length"), 1);
  assert.equal(await evaluate("document.querySelector('.detail-photo').getAttribute('src')"), "/photos/photo-fixture.jpg?size=med");
  await waitFor("document.querySelector('.detail-photo').naturalWidth === 800", "photo de la fiche servie par le BFF sans agrandissement");
  assert.equal(await evaluate("document.querySelector('.detail-photo').naturalHeight"), 500);
  assert.deepEqual(await evaluate(`(() => {
    const image = document.querySelector('.detail-photo');
    const context = Object.assign(document.createElement('canvas'), { width: 800, height: 500 }).getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const [left, right] = [3, 796].map((x) => [...context.getImageData(x, 250, 1, 1).data]);
    return [left[0] > left[1] + 60, right[2] > right[1] + 60];
  })()`), [true, true], "la photo de la fiche doit rester entière");
  assert.ok(imageHostRequests.some((request) => request.path === "/images/photo-fixture.jpg"), "le BFF doit télécharger la photo d'origine");
  assert.deepEqual(imageHostRequests.filter((request) => request.apiKey !== undefined), [], "la clé d'API ne doit pas être envoyée à l'hôte d'images");
  assert.match(await evaluate("document.querySelector('#detail-body').textContent"), /<img src=x onerror=/);
  assert.equal(await evaluate("document.querySelectorAll('#detail-body img[src=x]').length"), 0);
  await screenshot("fiche.png");
  // Mode réel : le prompt de l'étape IA cite la vraie source (ici le faux fournisseur) et la photo vient du BFF.
  await click("#prepare-ai");
  await waitFor(`${tabShown("ia")} && !!document.querySelector('#ia-prompt')?.value`, "étape IA ouverte depuis la fiche réelle");
  const livePrompt = await evaluate("document.querySelector('#ia-prompt').value");
  assert.ok(!livePrompt.includes("SIMULÉ"));
  assert.ok(livePrompt.includes(`SOURCE : http://127.0.0.1:${server.address().port}/v1`), "le prompt doit citer la source réelle");
  assert.ok(livePrompt.includes("onerror=alert('unsafe')"), "les données externes sont transmises telles quelles, comme du texte");
  assert.equal(await evaluate("document.querySelector('img.ia-photo').getAttribute('src')"), "/photos/photo-fixture.jpg?size=thumb");
  await waitFor("document.querySelector('img.ia-photo')?.naturalWidth === 320", "photo de l'étape IA réduite par le BFF");
  assert.equal(await evaluate("document.querySelectorAll('#panel-ia img[src=x]').length"), 0);
  await screenshot("onglet-ia-reel.png");
  await click("#copy-ia-prompt");
  await waitFor(missionDone("prompt"), "mission « prompt » réussie (données réelles)");
  await openTab("appels");
  delaySearch = true;
  await input("siam");
  await click("#search-api");
  await input("beng");
  await sleep(450);
  assert.equal(await evaluate("document.querySelector('.card-body h4').textContent"), "Bengal");
  assert.ok(!(await evaluate("document.querySelector('#result-count').textContent")).includes("résultat de recherche API"));
  console.log("OK : parcours proxy avec faux fournisseur, photo, contenu échappé, réponse obsolète ignorée.");

  // La même recherche, laissée aller jusqu'au bout, valide la mission ; un tri local valide l'autre.
  assert.equal(await evaluate(missionDone("search")), false, "une réponse obsolète ne valide pas la mission");
  await input("siam");
  await click("#search-api");
  await waitFor("document.querySelector('#result-count').textContent.includes('résultat de recherche API')", "recherche API réelle terminée");
  await waitFor(missionDone("search"), "mission « search » réussie (données réelles)");
  await select("sort", "name-desc");
  await waitFor(missionDone("local"), "mission « local » réussie (tri local)");
  assert.equal((await journey()).statuses.appels, "done");

  await click("#reset");
  imagesFail = true;
  await click('[aria-label="Voir la fiche de Chartreux"]');
  await waitFor("!!document.querySelector('#detail-body .detail-grid')");
  assert.match(await evaluate("document.querySelector('#detail-body .error').textContent"), /HTTP 429/);
  assert.match(await evaluate("document.querySelector('#detail-title').textContent"), /Chartreux/);
  // Fermer la fiche ne vide pas l'étape IA : elle s'appuie sur la fiche déjà reçue, avec la même erreur d'images.
  await click("#close-detail");
  assert.equal(await evaluate("document.querySelector('#detail-dialog').open"), false);
  await openTab("ia");
  assert.equal(await evaluate("document.querySelector('#ia-breed').value"), "char");
  assert.match(await evaluate("document.querySelector('#panel-ia .error').textContent"), /HTTP 429/);
  assert.match(await evaluate("document.querySelector('#ia-prompt').value"), /"images": \[\]/);
  console.log("OK : erreur images visible sans perdre la fiche, ni dans l'étape IA.");

  // Cette page est neuve : on y refait les missions des autres étapes pour pouvoir terminer le parcours plus bas.
  imagesFail = false;
  await openTab("besoin");
  for (const id of ["race", "photo", "favori"]) await click(`#reveal-${id}`);
  await waitFor(missionDone("mots"), "mission « mots » réussie (page neuve)");
  await openTab("contrat");
  await waitFor("document.querySelectorAll('details.op').length === 5", "contrat lu en direct (page neuve)");
  await evaluate("[...document.querySelectorAll('details.op')].at(-1).querySelector('summary').click()");
  await waitFor(missionDone("contrat"), "mission « contrat » réussie (page neuve)");
  await click("#tech-oas > summary");
  await waitFor("document.querySelector('#tech-oas').open", "bloc technique du contrat déplié (page neuve)");
  await openCurlDialog("sans-cle", CURL_SANS_CLE);
  await playCurl();
  await closeCurlDialog();
  await waitFor(missionDone("sans-cle"), "mission « sans-cle » réussie (page neuve)");
  await openCurlDialog("avec-cle", curlAvecCle("char"));
  await playCurl();
  await closeCurlDialog();
  await waitFor(missionDone("avec-cle"), "mission « avec-cle » réussie (page neuve)");
  await click("#copy-ai-prompt-1");
  await waitFor(missionDone("page-ia"), "mission « page-ia » réussie (page neuve)");
  await openTab("ia");
  await click("#vote-sample");
  await waitFor("document.querySelector('#vote-beekast').value.includes('Chartreux : 14 voix')", "exemple Beekast chargé (page neuve)");
  await click("#copy-vote-prompt");
  await waitFor(missionDone("vote"), "mission « vote » réussie (page neuve)");
  // Un code collé dans la fenêtre d'essai de l'étape IA : « Recommencer » devra l'effacer.
  await openSandbox("vote");
  await click("#sandbox-sample");
  await waitFor("document.querySelector('#sandbox-code').value !== ''", "exemple de la page de vote collé");
  await closeSandbox();
  assert.equal((await journey()).done, 10, "dix missions réussies avant la question flash");

  // Fenêtre d'essai, mode réel : la clé saisie remplace le repère le temps de l'essai et ne quitte jamais la fenêtre.
  const TEST_KEY = "cle-de-test-e2e-12345678";
  watchPageRequests = true;
  await command("Network.enable");
  await openTab("contrat");
  await openSandbox("fiche");
  assert.match(await evaluate("document.querySelector('#sandbox-live').textContent"), /APPELS RÉELS/);
  assert.equal(await evaluate("!!document.querySelector('#sandbox-simulated')"), false);
  assert.equal(await evaluate("!!document.querySelector('#sandbox-key-block')"), false, "pas de champ clé tant que le code ne contient pas le repère");
  await click("#sandbox-sample");
  await waitFor("!!document.querySelector('#sandbox-key-block')", "champ clé affiché dès que le code contient le repère");
  assert.equal(await evaluate("document.querySelector('#sandbox-key').type"), "password");
  assert.equal(await evaluate("document.querySelector('#sandbox-run').disabled"), true, "sans clé, pas d'essai en mode réel");
  await typeInto("#sandbox-key", "court");
  await waitFor("document.querySelector('#sandbox-key').getAttribute('aria-invalid') === 'true'", "clé trop courte signalée");
  assert.equal(await evaluate("document.querySelector('#sandbox-run').disabled"), true);
  await typeInto("#sandbox-key", TEST_KEY);
  await waitFor("document.querySelector('#sandbox-key').getAttribute('aria-invalid') === 'false' && !document.querySelector('#sandbox-run').disabled", "clé valide : essai possible");
  await runSandbox();
  await frameWaitFor("document.querySelector('#fiche h1')?.textContent === 'Chartreux'", "fiche du Chartreux affichée avec l'API jouée en direct");
  await waitFor("document.querySelectorAll('#sandbox-calls li').length === 1", "appel réel au journal");
  assert.deepEqual(await sandboxJournal(), [{ method: "GET", url: "https://api.thecatapi.com/v1/breeds/char", status: "HTTP 200 OK", tone: "ok" }]);
  // Le navigateur demande d'abord la permission d'envoyer l'en-tête (sans la clé), puis l'appel porte la clé saisie.
  assert.deepEqual(apiRequests.map(({ method, path }) => [method, path]), [["OPTIONS", "/v1/breeds/char"], ["GET", "/v1/breeds/char"]]);
  assert.deepEqual(apiRequests.map(({ key }) => key), [undefined, TEST_KEY]);
  const leaks = [
    ["l'écran de la fenêtre", await evaluate("document.querySelector('#sandbox-dialog').innerText")],
    ["le journal", JSON.stringify(await sandboxJournal())],
    ["le code collé", await evaluate("document.querySelector('#sandbox-code').value")],
    ["le stockage du navigateur", await evaluate("JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie, location.href])")],
    ["les requêtes du kiosque", pageRequests.join("\n")],
    ["la sortie du serveur", backendOutput],
  ];
  for (const [where, text] of leaks) assert.ok(!text.includes(TEST_KEY), `la clé saisie ne doit pas apparaître dans ${where}`);
  assert.ok((await evaluate("document.querySelector('#sandbox-code').value")).includes("VOTRE_CLE_API"), "le repère reste dans le code collé");
  await viewportScreenshot("fenetre-essai-reel.png");
  // Fermer la fenêtre efface la clé et la page lancée.
  await closeSandbox();
  await openSandbox("fiche");
  await waitFor("document.querySelector('#sandbox-key')?.value === ''", "la clé est effacée à la fermeture");
  assert.equal(await evaluate("!!document.querySelector('#sandbox-stage iframe') || !!document.querySelector('#sandbox-calls')"), false, "ni page lancée ni journal après réouverture");
  // Réseau coupé : la page l'annonce elle-même, et le journal parle d'une absence de réponse. Entrée dans le champ clé lance l'essai.
  apiBehavior = "fail";
  await typeInto("#sandbox-key", TEST_KEY);
  await waitFor("!document.querySelector('#sandbox-run').disabled", "clé de nouveau saisie");
  await press("Enter", 13);
  await waitFor("document.querySelectorAll('#sandbox-calls li').length === 1", "appel sans réponse au journal");
  assert.deepEqual(await sandboxJournal(), [{ method: "GET", url: "https://api.thecatapi.com/v1/breeds/char", status: "Aucune réponse", tone: "erreur" }]);
  assert.match(await evaluate("document.querySelector('#sandbox-reading').textContent"), /^Aucune réponse exploitable/);
  await frameWaitFor("document.querySelector('#fiche .erreur')?.textContent.includes('Impossible d’afficher la fiche')", "la page signale elle-même l'échec");
  apiBehavior = "ok";
  await closeSandbox();
  watchPageRequests = false;
  assert.deepEqual(exfilRequests, []);
  console.log("OK : fenêtre d'essai en mode réel : clé saisie masquée, substituée sans fuite, effacée à la fermeture, échec réseau expliqué.");

  // Recharger l'API vide l'étape IA : un prompt construit sur d'anciennes réponses ne doit pas survivre.
  await openTab("appels");
  await click("#reload");
  await waitFor("document.querySelectorAll('.breed-card').length === 10 && !document.querySelector('#reload')?.disabled && document.querySelector('#ia-breed').value === ''", "catalogue rechargé, étape IA vidée");
  assert.equal(await evaluate("document.querySelector('#ia-prompt').value"), "");
  assert.equal(await evaluate("document.querySelector('#copy-ia-prompt').disabled"), true);
  await select("ia-breed", "siam");
  await waitFor(`document.querySelector('#ia-prompt')?.value.includes('SOURCE : http://127.0.0.1:${server.address().port}/v1')`, "prompt reconstruit sur les nouvelles réponses");
  console.log("OK : « Recharger l’API » vide l'étape IA, qui repart de zéro.");

  // Étape 5 : la question flash est la dernière mission. Le parcours se termine, puis peut être rejoué.
  await openTab("bilan");
  assert.equal(await evaluate("!!document.querySelector('#flash-answer')"), false);
  await click("#reveal-flash");
  await waitFor("!!document.querySelector('#flash-answer')", "réponse de la question flash");
  await waitFor(missionDone("flash"), "mission « flash » réussie");
  assert.equal(await evaluate("document.querySelector('#toast').hidden"), false);
  const finished = await journey();
  assert.deepEqual([finished.done, finished.statuses, finished.count], [11, statuses(["done", "done", "done", "done", "done"]), "11/11 missions"]);
  assert.equal(await evaluate("!!document.querySelector('#journey-complete') && !!document.querySelector('#journey-done') && !document.querySelector('#next-mission')"), true);
  // Chacun des quatre messages renvoie à ce que le participant a pratiqué.
  assert.equal(await evaluate("document.querySelectorAll('#panel-bilan .recap .practiced').length"), 4);
  // Rien de réservé à l'animateur à l'écran, même parcours terminé ; accueil replié et un bloc technique ouvert avant la remise à zéro.
  await assertBroadcastable("parcours terminé");
  assert.equal(await evaluate("document.querySelector('#welcome').open"), false, "accueil replié avant la remise à zéro");
  assert.equal(await evaluate("document.querySelectorAll('details.tech[open]').length"), 1, "un bloc technique ouvert avant la remise à zéro");
  await screenshot("onglet-bilan-termine.png");
  // Le message « Mission réussie » de la partie précédente ne doit pas survivre à la remise à zéro (il disparaîtrait seul après 4,5 s).
  assert.equal(await evaluate(`(async () => {
    document.querySelector('#restart').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return document.querySelector('#toast').hidden;
  })()`), true);
  await waitFor("document.querySelectorAll('#requests li').length === 1 && document.querySelectorAll('.breed-card').length === 10 && !document.querySelector('#reload')?.disabled", "catalogue rechargé, historique des appels remis à zéro");
  const restarted = await journey();
  assert.deepEqual([restarted.active, restarted.statuses, restarted.missions, restarted.done, restarted.hash],
    [["besoin"], statuses(["current", "todo", "todo", "todo", "todo"]), [], 0, "#besoin"]);
  assert.equal(await evaluate("document.querySelectorAll('.word-call').length"), 0);
  assert.equal(await evaluate("!!document.querySelector('#flash-answer') || !!document.querySelector('#journey-complete')"), false);
  // L'accueil et les blocs techniques repartent eux aussi de zéro : le visiteur suivant découvre le kiosque comme le premier.
  const fresh = await evaluate(`(() => ({
    welcome: document.querySelector('#welcome').open,
    tech: document.querySelectorAll('details.tech[open]').length,
    jargon: document.querySelector('#jargon-dialog').open,
  }))()`);
  assert.equal(fresh.welcome, true, "« Recommencer » doit rouvrir l'accueil");
  assert.equal(fresh.tech, 0, "« Recommencer » doit replier les blocs techniques");
  assert.equal(fresh.jargon, false);
  // Le résultat Beekast collé ne survit pas à la remise à zéro : le kiosque est partagé.
  await waitFor("document.querySelector('#vote-beekast').value === '' && !!document.querySelector('#vote-hint')", "résultat Beekast effacé");
  // Le code collé dans la fenêtre d'essai ne survit pas non plus : le kiosque est partagé.
  for (const [scenario, tab] of [["fiche", "contrat"], ["vote", "ia"]]) {
    await openTab(tab);
    await openSandbox(scenario);
    await waitFor("document.querySelector('#sandbox-code').value === ''", `code collé effacé (${scenario})`);
    await closeSandbox();
  }
  await openTab("besoin");
  console.log("OK : 11 missions réussies, parcours terminé, « Recommencer » remet tout à zéro (accueil, blocs techniques, saisies).");

  for (const [index, id] of STEPS.entries()) {
    await openTab(id);
    if (id === "ia") {
      await select("ia-breed", "siam");
      await waitFor("document.querySelector('#ia-prompt')?.value.includes('Siamese')", "prompt construit pour la capture");
    }
    await screenshot(`onglet-${index + 1}-${id}.png`);
  }
  // Mobile : aucun débordement horizontal, et l'onglet actif reste visible dans la barre d'onglets défilante.
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(100);
  // Accueil ouvert : la mise en page doit tenir dans l'écran d'un téléphone, comme les cinq onglets qui suivent.
  assert.equal(await evaluate("document.querySelector('#welcome').open"), false, "accueil replié par la navigation");
  await click("#welcome > summary");
  await waitFor("document.querySelector('#welcome').open", "accueil rouvert (mobile)");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= 390"), true, "débordement horizontal avec l'accueil ouvert");
  await evaluate("scrollTo(0, 0)");
  await viewportScreenshot("mobile-accueil.png");
  for (const id of STEPS) {
    await openTab(id);
    // Tous les blocs « Côté technique » ouverts : c'est le cas le plus large pour la mise en page.
    await evaluate(`document.querySelectorAll('#panel-${id} details.tech:not([open]) > summary').forEach((summary) => summary.click())`);
    await waitFor(`!document.querySelector('#panel-${id} details.tech:not([open])')`, `blocs techniques ouverts, onglet « ${id} »`);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= 390"), true, `débordement horizontal sur mobile, onglet « ${id} »`);
    assert.equal(await evaluate(`(() => { const box = document.querySelector('#tab-${id}').getBoundingClientRect(); return box.left >= 0 && box.right <= 390; })()`), true, `onglet « ${id} » hors de la barre d'onglets visible sur mobile`);
    await screenshot(`mobile-${id}.png`);
  }
  await openTab("appels");
  assert.equal(await evaluate("new Set([...document.querySelectorAll('.breed-card')].map((card) => Math.round(card.getBoundingClientRect().left))).size >= 2"), true, "au moins deux vignettes par ligne sur mobile");
  // Le dico du jargon reste dans l'écran d'un téléphone, et son bouton Fermer reste atteignable au bas d'une longue liste.
  await click("#open-jargon");
  await waitFor(jargonOpen, "dico du jargon ouvert (mobile)");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= 390"), true, "débordement horizontal avec le dico ouvert");
  assert.equal(await evaluate("(() => { const dialog = document.querySelector('#jargon-dialog'); const box = dialog.getBoundingClientRect(); return dialog.scrollWidth <= dialog.clientWidth && box.left >= 0 && box.right <= 390 && box.top >= 0 && box.bottom <= 844; })()"), true, "dico hors de l'écran mobile");
  await viewportScreenshot("mobile-dico.png");
  await evaluate("document.querySelector('#jargon-dialog').scrollTop = 100000");
  assert.equal(await evaluate("(() => { const box = document.querySelector('#jargon-close').getBoundingClientRect(); const dialog = document.querySelector('#jargon-dialog').getBoundingClientRect(); return box.top >= dialog.top && box.bottom <= dialog.bottom && box.right <= 390; })()"), true, "bouton Fermer du dico hors de la partie visible");
  await click("#jargon-close");
  await waitFor(`!${jargonOpen}`, "dico refermé (mobile)");
  // La fenêtre curl, résultat affiché, reste entièrement dans l'écran d'un téléphone.
  await openTab("contrat");
  await openCurlDialog("avec-cle", curlAvecCle("char"));
  const mobileCurl = await playCurl();
  assert.deepEqual([mobileCurl.status, mobileCurl.simulated], ["HTTP 200 OK", false]);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= 390"), true, "débordement horizontal avec la fenêtre curl ouverte");
  assert.equal(await evaluate("(() => { const box = document.querySelector('#curl-dialog').getBoundingClientRect(); return box.left >= 0 && box.right <= 390 && box.top >= 0 && box.bottom <= 844; })()"), true, "fenêtre curl hors de l'écran mobile");
  assert.equal(await evaluate("(() => { const dialog = document.querySelector('#curl-dialog'); return dialog.scrollWidth <= dialog.clientWidth; })()"), true, "débordement horizontal dans la fenêtre curl");
  await screenshot("mobile-fenetre-curl.png");
  await closeCurlDialog();
  // La fenêtre d'essai, page lancée et journal affichés, reste elle aussi dans l'écran d'un téléphone.
  await openTab("contrat");
  await openSandbox("fiche");
  await click("#sandbox-sample");
  await typeInto("#sandbox-key", TEST_KEY);
  await waitFor("!document.querySelector('#sandbox-run').disabled", "exemple chargé (mobile)");
  await runSandbox();
  await frameWaitFor("document.querySelector('#fiche h1')?.textContent === 'Chartreux'", "fiche affichée dans le cadre isolé (mobile)");
  await waitFor("document.querySelectorAll('#sandbox-calls li').length === 1", "appel au journal (mobile)");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= 390"), true, "débordement horizontal avec la fenêtre d'essai ouverte");
  assert.equal(await evaluate("(() => { const box = document.querySelector('#sandbox-dialog').getBoundingClientRect(); return box.left >= 0 && box.right <= 390 && box.top >= 0; })()"), true, "fenêtre d'essai hors de l'écran mobile");
  assert.equal(await evaluate("(() => { const dialog = document.querySelector('#sandbox-dialog'); return dialog.scrollWidth <= dialog.clientWidth; })()"), true, "débordement horizontal dans la fenêtre d'essai");
  assert.equal(await evaluate("(() => { const box = document.querySelector('#sandbox-stage iframe').getBoundingClientRect(); return box.left >= 0 && box.right <= 390; })()"), true, "cadre isolé hors de l'écran mobile");
  // La saisie de la clé a fait défiler la fenêtre : on la remonte, comme le ferait le visiteur avant de chercher « Fermer ».
  await evaluate("document.querySelector('#sandbox-dialog').scrollTop = 0");
  assert.equal(await evaluate("(() => { const box = document.querySelector('#sandbox-close').getBoundingClientRect(); const dialog = document.querySelector('#sandbox-dialog').getBoundingClientRect(); return box.top >= dialog.top && box.bottom <= dialog.bottom && box.right <= 390; })()"), true, "bouton Fermer hors de la partie visible de la fenêtre mobile");
  await viewportScreenshot("mobile-fenetre-essai.png");
  await closeSandbox();
  await command("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(cspViolations, []);
  console.log("OK : affichage mobile sans débordement (accueil, dico, blocs techniques ouverts, cinq onglets), aucune erreur JavaScript.");

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command("Network.enable");
  await command("Log.enable");
  editorPhase = true;
  await command("Page.navigate", { url: `${bffBase}/oas.html` });
  await waitFor("window.editor && !!document.querySelector('.ace_editor') && document.querySelector('.swagger-ui .info .title')?.textContent.includes('TheCatAPI')", "source et documentation Swagger affichées");
  assert.equal(await evaluate("window.editor.specSelectors.specJson().get('openapi')"), "3.0.0");
  assert.equal(await evaluate("window.editor.getConfigs().supportedSubmitMethods.length"), 0);
  await evaluate("(() => { const spec = window.editor.specSelectors.specJson().toJS(); spec.info.title = 'Contrat de repetition'; window.editor.specActions.updateSpec(JSON.stringify(spec, null, 2)); })()");
  await waitFor("document.querySelector('.swagger-ui .info .title')?.textContent.includes('Contrat de repetition')", "édition reflétée dans la documentation");
  assert.equal(await evaluate("(async () => (await (await fetch('/openapi.json')).json()).info.title)()"), "TheCatAPI");
  await click("#reset-contract");
  await waitFor("document.querySelector('.swagger-ui .info .title')?.textContent.includes('TheCatAPI')", "contrat restauré");
  await screenshot("swagger-editor.png");
  assert.deepEqual(editorRequests.filter((url) => /^https?:/.test(url) && !url.startsWith(`${bffBase}/`)), []);
  assert.deepEqual(editorErrors, []);
  assert.deepEqual(errors, []);
  console.log("OK : Swagger Editor local, édition et restauration, aucune requête externe ni erreur CSP.");

  browserSocket = new WebSocket(`ws://127.0.0.1:${port}${browserPath}`);
  await once(browserSocket, "open");
  browserSocket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  await Promise.race([once(chrome, "exit"), sleep(5000)]);
} finally {
  socket?.close();
  browserSocket?.close();
  for (const callback of pending.values()) callback.reject(new Error("Fin du test navigateur"));
  pending.clear();
  if (chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([once(chrome, "exit"), sleep(2000)]);
  }
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  if (backend.exitCode === null) {
    backend.kill();
    await Promise.race([once(backend, "exit"), sleep(5000)]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
