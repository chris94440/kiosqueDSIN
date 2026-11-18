package fr.dsin.kiosque;

import io.vertx.ext.web.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

@ApplicationScoped
public class HttpHeaders {
    private static final String APP_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    private static final String EDITOR_POLICY = "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    // Cadre d'essai du code généré par l'IA : origine opaque (aucun accès au kiosque, ni cookies ni stockage),
    // scripts et styles en ligne autorisés pour la page testée, réseau limité à TheCatAPI, et incrustable par le seul kiosque.
    private static final String SANDBOX_POLICY = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://*.thecatapi.com data:; connect-src https://*.thecatapi.com; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

    void configure(@Observes Router router) {
        router.route().order(-1000).handler(context -> {
            String policy = switch (context.request().path()) {
                case "/oas.html" -> EDITOR_POLICY;
                case "/sandbox.html" -> SANDBOX_POLICY;
                default -> APP_POLICY;
            };
            context.response().putHeader("Content-Security-Policy", policy)
                    .putHeader("X-Content-Type-Options", "nosniff")
                    .putHeader("Referrer-Policy", "no-referrer");
            // Les pages et fichiers sans empreinte sont revalidés : une ancienne page en cache ne masque pas une mise à jour.
            context.addHeadersEndHandler(done -> {
                String path = context.request().path();
                if (path.equals("/") || path.endsWith(".html") || path.endsWith(".json") || path.equals("/oas.js") || path.equals("/oas.css")) {
                    context.response().headers().set("Cache-Control", "no-cache");
                }
            });
            context.next();
        });
    }
}
