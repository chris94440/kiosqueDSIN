package fr.dsin.kiosque;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Map;
import javax.net.ssl.SSLHandshakeException;
import org.jboss.logging.Logger;

@ApplicationScoped
public class CatApiGateway {
    private static final Logger LOG = Logger.getLogger(CatApiGateway.class);
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @Inject CatApiConfig config;
    @Inject ObjectMapper mapper;

    public Response get(String path, Map<String, String> parameters) {
        return get(path, parameters, true, null);
    }

    public Response get(String path, Map<String, String> parameters, String clientKey) {
        return get(path, parameters, true, clientKey);
    }

    /** Sans clé, l'appel sert uniquement l'atelier curl : il montre le refus 403 du fournisseur. */
    public Response get(String path, Map<String, String> parameters, boolean withKey) {
        return get(path, parameters, withKey, null);
    }

    /** Si une clé client est fournie et valide, elle prime sur la clé serveur pour cette requête uniquement. */
    public Response get(String path, Map<String, String> parameters, boolean withKey, String clientKey) {
        UriBuilder uri = UriBuilder.fromUri(config.baseUrl()).path(path);
        parameters.forEach(uri::queryParam);
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(uri.build().toString()))
                .timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json")
                .GET();
        if (withKey) {
            String key = clientKey != null && !clientKey.isBlank() ? clientKey.trim() : null;
            if (key == null) {
                key = config.apiKey().filter(candidate -> !candidate.isBlank()).map(String::trim).orElse(null);
            }
            if (key != null) request.header("x-api-key", key);
        }
        try {
            HttpResponse<String> upstream = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
            try {
                var json = mapper.readTree(upstream.body());
                if (json == null) return failure(502, "Le fournisseur a renvoyé une réponse JSON vide.");
                if (upstream.statusCode() >= 400) LOG.warnf("TheCatAPI : HTTP %d sur %s", upstream.statusCode(), path);
                return Response.status(upstream.statusCode()).entity(json)
                        .header("Cache-Control", "no-store").build();
            } catch (JsonProcessingException error) {
                LOG.warnf("TheCatAPI : réponse non JSON sur %s", path);
                return failure(502, "Le fournisseur a renvoyé une réponse non JSON.");
            }
        } catch (HttpTimeoutException error) {
            LOG.warnf("Délai TheCatAPI dépassé sur %s", path);
            return failure(504, "TheCatAPI ne répond pas dans le délai de 12 secondes.");
        } catch (SSLHandshakeException error) {
            LOG.warnf("Confiance TLS impossible pour TheCatAPI sur %s", path);
            return failure(502, "Certificat HTTPS non reconnu par Java. Utilisez le lanceur Windows ou un truststore approuvé ; ne désactivez pas TLS.");
        } catch (IOException error) {
            LOG.warnf("Connexion TheCatAPI impossible sur %s : %s", path, error.getClass().getSimpleName());
            return failure(502, "Impossible de joindre TheCatAPI. Vérifiez le réseau.");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return failure(503, "Appel interrompu. Réessayez.");
        }
    }

    public static Response failure(int status, String message) {
        return Response.status(status).entity(Map.of("message", message))
                .header("Cache-Control", "no-store").build();
    }
}
