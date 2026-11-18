package fr.dsin.kiosque;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
@QuarkusTestResource(UpstreamStub.class)
class PhotoResourceTest {
    private static BufferedImage decode(byte[] bytes) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }

    private static int[] rgb(BufferedImage image, int x, int y) {
        int value = image.getRGB(x, y);
        return new int[] { (value >> 16) & 255, (value >> 8) & 255, value & 255 };
    }

    @Test void cropsTheCenterOfTheOriginalIntoALightSquareThumbnail() throws IOException {
        byte[] bytes = given().get("/photos/big.jpg").then().statusCode(200).contentType("image/jpeg")
                .header("Cache-Control", containsString("max-age")).extract().asByteArray();
        BufferedImage thumbnail = decode(bytes);
        assertEquals(320, thumbnail.getWidth());
        assertEquals(320, thumbnail.getHeight());
        assertTrue(bytes.length < 60_000, "vignette trop lourde : " + bytes.length);
        for (int x : new int[] { 4, 315 }) {
            int[] pixel = rgb(thumbnail, x, 160);
            assertTrue(pixel[1] > 150 && pixel[0] < 110 && pixel[2] < 110, "le bord devrait être vert, pas rouge ni bleu");
        }
        assertNull(UpstreamStub.lastImageKey, "la clé API ne doit jamais partir vers le serveur d'images");
    }

    @Test void fitsAMediumPhotoWithoutCroppingIt() throws IOException {
        BufferedImage photo = decode(given().queryParam("size", "med").get("/photos/big.jpg")
                .then().statusCode(200).contentType("image/jpeg").extract().asByteArray());
        assertEquals(900, photo.getWidth());
        assertTrue(Math.abs(photo.getHeight() - 563) <= 1, "ratio d'origine conservé : " + photo.getHeight());
        assertTrue(rgb(photo, 2, 280)[0] > 150, "bord gauche rouge");
        assertTrue(rgb(photo, 897, 280)[2] > 150, "bord droit bleu");
    }

    @Test void rendersEachPhotoOnlyOnce() {
        given().get("/photos/big.jpg").then().statusCode(200);
        int before = UpstreamStub.imageCalls.get();
        given().get("/photos/big.jpg").then().statusCode(200);
        assertEquals(before, UpstreamStub.imageCalls.get());
    }

    @Test void neverUpscalesAndFlattensTransparencyOnWhite() throws IOException {
        BufferedImage thumbnail = decode(given().get("/photos/logo.png").then().statusCode(200).contentType("image/jpeg").extract().asByteArray());
        assertEquals(80, thumbnail.getWidth());
        assertEquals(80, thumbnail.getHeight());
        int[] corner = rgb(thumbnail, 1, 1);
        assertTrue(corner[0] > 240 && corner[1] > 240 && corner[2] > 240, "coin transparent aplati sur fond blanc");
        assertTrue(rgb(thumbnail, 40, 40)[0] > 150, "disque rouge conservé");
    }

    @Test void reportsImageHostProblemsInsteadOfInventingAPhoto() {
        given().get("/photos/absente.jpg").then().statusCode(404).body("message", containsString("introuvable"));
        given().get("/photos/broken.jpg").then().statusCode(502).body("message", containsString("vignette impossible"));
    }

    @Test void rejectsInvalidRequestsBeforeCallingTheImageHost() {
        int before = UpstreamStub.imageCalls.get();
        given().get("/photos/script.exe").then().statusCode(400);
        given().get("/photos/modele.webp").then().statusCode(400);
        given().get("/photos/a.b.jpg").then().statusCode(400);
        given().queryParam("size", "full").get("/photos/big.jpg").then().statusCode(400);
        given().queryParam("size", "thumb", "med").get("/photos/big.jpg").then().statusCode(400);
        given().queryParam("url", "http://exemple.invalid/x.jpg").get("/photos/big.jpg").then().statusCode(400);
        given().get("/photos/..%2Fsecret.jpg").then().statusCode(anyOf(is(400), is(404)));
        given().post("/photos/big.jpg").then().statusCode(405);
        assertEquals(before, UpstreamStub.imageCalls.get());
    }
}
