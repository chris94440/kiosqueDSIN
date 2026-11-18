package fr.dsin.kiosque;

import io.smallrye.common.annotation.Blocking;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
@Blocking
public class CatResource {
    private static final Pattern KEY_FORMAT = Pattern.compile("[A-Za-z0-9_-]{8,120}");
    @Inject CatApiGateway gateway;
    @Context UriInfo uri;

    @GET @Path("/breeds")
    public Response breeds(@HeaderParam("X-Kiosque-Api-Key") String clientKey) {
        String problem = validateParameters(Set.of());
        if (problem != null) return CatApiGateway.failure(400, problem);
        String keyProblem = validateClientKeyProblem(clientKey);
        if (keyProblem != null) return CatApiGateway.failure(400, keyProblem);
        String key = normalizeClientKey(clientKey);
        return key != null ? gateway.get("breeds", Map.of(), key) : gateway.get("breeds", Map.of());
    }

    @GET @Path("/breeds/search")
    public Response search(@QueryParam("q") String query,
                           @HeaderParam("X-Kiosque-Api-Key") String clientKey) {
        String problem = validateParameters(Set.of("q"));
        if (problem != null) return CatApiGateway.failure(400, problem);
        String keyProblem = validateClientKeyProblem(clientKey);
        if (keyProblem != null) return CatApiGateway.failure(400, keyProblem);
        if (query == null || query.isBlank() || query.length() > 30) {
            return CatApiGateway.failure(400, "q doit contenir entre 1 et 30 caractères.");
        }
        String key = normalizeClientKey(clientKey);
        return key != null
                ? gateway.get("breeds/search", Map.of("q", query.trim()), key)
                : gateway.get("breeds/search", Map.of("q", query.trim()));
    }

    @GET @Path("/breeds/{id: [a-zA-Z0-9_-]+}")
    public Response detail(@PathParam("id") String id,
                           @HeaderParam("X-Kiosque-Api-Key") String clientKey) {
        String problem = validateParameters(Set.of());
        if (problem != null) return CatApiGateway.failure(400, problem);
        String keyProblem = validateClientKeyProblem(clientKey);
        if (keyProblem != null) return CatApiGateway.failure(400, keyProblem);
        String key = normalizeClientKey(clientKey);
        return key != null ? gateway.get("breeds/" + id, Map.of(), key) : gateway.get("breeds/" + id, Map.of());
    }

    // Atelier curl : rejoue sans clé l'appel de la fiche pour montrer le 403 du fournisseur. Aucun secret n'est transmis.
    @GET @Path("/no-key/breeds/{id: [a-zA-Z0-9_-]+}")
    public Response detailWithoutKey(@PathParam("id") String id) {
        String problem = validateParameters(Set.of());
        return problem == null ? gateway.get("breeds/" + id, Map.of(), false) : CatApiGateway.failure(400, problem);
    }

    @GET @Path("/images/search")
    public Response images(@QueryParam("breed_ids") String breedId,
                           @QueryParam("limit") String limit,
                           @QueryParam("include_breeds") String includeBreeds,
                           @HeaderParam("X-Kiosque-Api-Key") String clientKey) {
        String problem = validateParameters(Set.of("breed_ids", "limit", "include_breeds"));
        if (problem != null) return CatApiGateway.failure(400, problem);
        String keyProblem = validateClientKeyProblem(clientKey);
        if (keyProblem != null) return CatApiGateway.failure(400, keyProblem);
        if (breedId != null && !breedId.matches("[a-zA-Z0-9_-]+")) return CatApiGateway.failure(400, "Identifiant de race invalide.");
        if (limit != null && !limit.matches("[1-6]")) return CatApiGateway.failure(400, "limit doit être compris entre 1 et 6.");
        if (includeBreeds != null && !includeBreeds.equals("1")) return CatApiGateway.failure(400, "include_breeds doit valoir 1.");
        Map<String, String> params = new LinkedHashMap<>();
        if (breedId != null) params.put("breed_ids", breedId);
        if (limit != null) params.put("limit", limit);
        if (includeBreeds != null) params.put("include_breeds", includeBreeds);
        String key = normalizeClientKey(clientKey);
        return key != null ? gateway.get("images/search", params, key) : gateway.get("images/search", params);
    }

    private String validateParameters(Set<String> allowed) {
        for (var entry : uri.getQueryParameters().entrySet()) {
            if (!allowed.contains(entry.getKey())) return "Paramètre non autorisé : " + entry.getKey();
            if (entry.getValue().size() != 1) return "Paramètre répété : " + entry.getKey();
        }
        return null;
    }

    private String normalizeClientKey(String key) {
        if (key == null) return null;
        String trimmed = key.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String validateClientKeyProblem(String key) {
        String normalized = normalizeClientKey(key);
        return normalized != null && !KEY_FORMAT.matcher(normalized).matches()
                ? "Format de clé API invalide."
                : null;
    }
}
