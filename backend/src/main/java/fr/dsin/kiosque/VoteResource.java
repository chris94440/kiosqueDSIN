package fr.dsin.kiosque;

import io.smallrye.common.annotation.Blocking;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.regex.Pattern;

@Path("/vote")
@Produces(MediaType.APPLICATION_JSON)
@Blocking
public class VoteResource {
    private static final Pattern BREED_ID_FORMAT = Pattern.compile("[A-Za-z0-9_-]{1,40}");
    @Inject VoteStore voteStore;

    @GET
    @Path("/dsin")
    public Response board() {
        return Response.ok(voteStore.snapshot()).header("Cache-Control", "no-store").build();
    }

    @POST
    @Path("/dsin/{breedId}")
    public Response vote(@PathParam("breedId") String breedId) {
        String normalized = breedId == null ? "" : breedId.trim();
        if (!BREED_ID_FORMAT.matcher(normalized).matches()) return CatApiGateway.failure(400, "Identifiant de race invalide.");
        return Response.ok(voteStore.vote(normalized)).header("Cache-Control", "no-store").build();
    }

    @DELETE
    @Path("/dsin")
    public Response reset() {
        return Response.ok(voteStore.reset()).header("Cache-Control", "no-store").build();
    }
}
