package fr.dsin.kiosque;

import io.smallrye.common.annotation.Blocking;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import java.util.Map;

@Path("/photos")
@Produces(MediaType.APPLICATION_JSON)
@Blocking
public class PhotoResource {
    @Inject PhotoService photos;
    @Context UriInfo uri;

    @GET @Path("/{file}")
    public Response photo(@PathParam("file") String file) {
        for (Map.Entry<String, List<String>> entry : uri.getQueryParameters().entrySet()) {
            if (!entry.getKey().equals("size")) return CatApiGateway.failure(400, "Paramètre non autorisé : " + entry.getKey());
            if (entry.getValue().size() != 1) return CatApiGateway.failure(400, "Paramètre répété : size");
        }
        String label = uri.getQueryParameters().getFirst("size");
        PhotoService.Size size = PhotoService.Size.parse(label == null ? "thumb" : label);
        if (size == null) return CatApiGateway.failure(400, "size doit valoir thumb ou med.");
        if (!PhotoService.isValidFile(file)) return CatApiGateway.failure(400, "Nom de photo invalide.");
        try {
            return Response.ok(photos.render(file, size)).type("image/jpeg")
                    .header("Cache-Control", "public, max-age=86400").build();
        } catch (PhotoService.PhotoException error) {
            return CatApiGateway.failure(error.status, error.getMessage());
        }
    }
}
