/* global SwaggerEditorBundle, SwaggerEditorStandalonePreset */
const OPENAPI_PATH = "/openapi.yaml";
const OPENAPI_URL = `${OPENAPI_PATH}?v=${Date.now()}`;

let originalSpec;

function showStatus(message, failed = false) {
  const status = document.getElementById("oas-status");
  status.textContent = message;
  status.classList.toggle("failed", failed);
  status.hidden = !message;
}

document.getElementById("reset-contract").addEventListener("click", () => {
  if (!originalSpec || !window.editor) return;
  window.editor.specActions.updateSpec(originalSpec);
  showStatus("Contrat fourni restauré dans l’éditeur. Aucun fichier n’a été modifié.");
});

async function initEditor() {
  try {
    const sourceLink = document.getElementById("oas-source-link");
    if (sourceLink) sourceLink.setAttribute("href", OPENAPI_URL);
    const response = await fetch(OPENAPI_URL);
    if (!response.ok) throw new Error(`Le contrat ne peut pas être chargé : HTTP ${response.status}.`);
    originalSpec = await response.text();
    if (!originalSpec.trim()) throw new Error("Le contrat OpenAPI YAML est vide.");
    if (typeof SwaggerEditorBundle !== "function" || typeof SwaggerEditorStandalonePreset !== "function") {
      throw new Error("Les ressources locales de Swagger Editor ne sont pas disponibles.");
    }
    window.editor = SwaggerEditorBundle({
      dom_id: "#swagger-editor",
      layout: "StandaloneLayout",
      presets: [SwaggerEditorStandalonePreset],
      url: OPENAPI_URL,
      queryConfigEnabled: false,
      validatorUrl: null,
      swagger2ConverterUrl: null,
      swagger2GeneratorUrl: null,
      oas3GeneratorUrl: null,
      supportedSubmitMethods: [],
      tryItOutEnabled: false,
      persistAuthorization: false,
      docExpansion: "none",
      defaultModelsExpandDepth: -1,
    });
    showStatus("");
  } catch (error) {
    showStatus(error.message, true);
  }
}

initEditor();
