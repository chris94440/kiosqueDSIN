package fr.dsin.kiosque;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;

@Path("/")
@Produces(MediaType.APPLICATION_JSON)
public class KiosqueResource {
    @Inject CatApiConfig config;
    @Inject ObjectMapper mapper;
    private JsonNode demo;

    @PostConstruct
    void loadDemo() throws IOException {
        try (InputStream source = getClass().getResourceAsStream("/demo-breeds.json")) {
            if (source == null) throw new IOException("Jeu de données simulées introuvable.");
            demo = mapper.readTree(source);
        }
    }

    @GET @Path("/config")
    public Map<String, Object> config() {
        String apiKey = config.apiKey().map(String::trim).orElse("");
        return Map.of("hasApiKey", !apiKey.isBlank(), "prefillApiKey", apiKey,
                "apiBase", config.baseUrl(), "backend", "Quarkus");
    }

    @GET @Path("/demo/breeds")
    public Response breeds() { return simulated(demo); }

    @GET @Path("/demo/breeds/search")
    public Response search(@QueryParam("q") String query) {
        if (query == null || query.isBlank() || query.length() > 30) return CatApiGateway.failure(400, "q doit contenir entre 1 et 30 caractères.");
        var result = mapper.createArrayNode();
        for (JsonNode breed : demo) {
            String text = breed.path("name").asText() + " " + breed.path("alt_names").asText();
            if (text.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT))) result.add(breed);
        }
        return simulated(result);
    }

    @GET @Path("/demo/breeds/{id}")
    public Response detail(@PathParam("id") String id) {
        for (JsonNode breed : demo) if (breed.path("id").asText().equals(id)) return simulated(breed);
        return CatApiGateway.failure(404, "Race absente du jeu simulé.");
    }

    // Atelier curl avec les données simulées : le refus du fournisseur sans clé est fabriqué, avec la même forme que le vrai.
    @GET @Path("/demo/no-key/breeds/{id: [a-zA-Z0-9_-]+}")
    public Response detailWithoutKey(@PathParam("id") String id) {
        var body = mapper.createObjectNode()
                .put("statusCode", 403)
                .put("timestamp", Instant.now().toString())
                .put("path", "/v1/breeds/" + id)
                .put("message", "Authentication required. Please provide a valid API key.")
                .put("error", "Forbidden");
        return Response.status(403).entity(body).header("Cache-Control", "no-store")
                .header("X-Kiosque-Source", "simulated").build();
    }

    @GET @Path("/demo/images/search")
    public Response images() { return simulated(mapper.createArrayNode()); }

    private Response simulated(JsonNode body) {
        return Response.ok(body).header("Cache-Control", "no-store")
                .header("X-Kiosque-Source", "simulated").build();
    }
}
