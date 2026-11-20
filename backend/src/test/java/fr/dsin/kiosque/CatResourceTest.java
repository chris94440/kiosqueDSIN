package fr.dsin.kiosque;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
@QuarkusTestResource(UpstreamStub.class)
class CatResourceTest {
    @Test void proxiesReadWithServerSideKey() {
        given().get("/api/breeds").then().statusCode(200).body("[0].id", equalTo("siam"))
                .body(not(containsString("test-only-not-a-real-key")));
        assertEquals("test-only-not-a-real-key", UpstreamStub.lastKey);
        given().queryParam("q", "siam").get("/api/breeds/search").then().statusCode(200);
        assertEquals("q=siam", UpstreamStub.lastQuery);
        given().get("/api/breeds/siam").then().statusCode(200).body("name", equalTo("Siamese"));
        given().queryParam("breed_ids", "siam").queryParam("limit", 3).queryParam("include_breeds", 1)
                .get("/api/images/search").then().statusCode(200).body("size()", equalTo(0));
    }

    @Test void exposesConfigurationAndPrefilledApiKey() {
        given().get("/config").then().statusCode(200).body("hasApiKey", equalTo(true))
                .body("backend", equalTo("Quarkus")).body("prefillApiKey", equalTo("test-only-not-a-real-key"));
    }

    @Test void preservesUpstreamErrorsAndRejectsNonJson() {
        given().queryParam("q", "forbidden").get("/api/breeds/search").then().statusCode(403).body("message", equalTo("Authentication required"));
        given().queryParam("q", "quota").get("/api/breeds/search").then().statusCode(429);
        given().queryParam("q", "unavailable").get("/api/breeds/search").then().statusCode(503);
        given().queryParam("q", "nonjson").get("/api/breeds/search").then().statusCode(502).body("message", containsString("non JSON"));
    }

    @Test void letsTheBrowserOverrideTheServerKeyForItsOwnSession() {
        String clientKey = "client_session_key_1234";
        given().header("X-Kiosque-Api-Key", clientKey).get("/api/breeds").then().statusCode(200);
        assertEquals(clientKey, UpstreamStub.lastKey);
    }

    @Test void rejectsInvalidClientKeyHeaderBeforeCallingUpstream() {
        int before = UpstreamStub.calls.get();
        given().header("X-Kiosque-Api-Key", "cle invalide !").get("/api/breeds")
                .then().statusCode(400).body("message", containsString("Format de clé API invalide"));
        assertEquals(before, UpstreamStub.calls.get());
    }

    @Test void rejectsInvalidInputAndWritesBeforeCallingUpstream() {
        int before = UpstreamStub.calls.get();
        given().get("/api/breeds/search").then().statusCode(400);
        given().queryParam("q", "a", "b").get("/api/breeds/search").then().statusCode(400);
        given().queryParam("api_key", "forbidden").get("/api/breeds").then().statusCode(400);
        given().queryParam("limit", 999).get("/api/images/search").then().statusCode(400);
        given().queryParam("breed_ids", "a,b").get("/api/images/search").then().statusCode(400);
        given().queryParam("include_breeds", 2).get("/api/images/search").then().statusCode(400);
        given().post("/api/breeds").then().statusCode(405);
        given().get("/api/favourites").then().statusCode(404);
        assertEquals(before, UpstreamStub.calls.get());
    }

    @Test void replaysTheCallWithoutKeyForTheCurlExerciseOnly() {
        int before = UpstreamStub.calls.get();
        given().header("X-Kiosque-Api-Key", "client_session_key_1234")
                .get("/api/no-key/breeds/abys").then().statusCode(403)
                .body("error", equalTo("Forbidden")).body("message", containsString("API key"))
                .body(not(containsString("test-only-not-a-real-key")));
        assertEquals(before + 1, UpstreamStub.calls.get());
        assertNull(UpstreamStub.lastKey, "l'appel de l'atelier ne doit transporter aucune clé");
        // Les routes normales envoient toujours la clé du serveur.
        given().get("/api/breeds/siam").then().statusCode(200);
        assertEquals("test-only-not-a-real-key", UpstreamStub.lastKey);
    }

    @Test void validatesTheKeylessRouteBeforeCallingUpstream() {
        int before = UpstreamStub.calls.get();
        given().queryParam("api_key", "forbidden").get("/api/no-key/breeds/abys").then().statusCode(400);
        given().get("/api/no-key/breeds/a.b").then().statusCode(404);
        given().post("/api/no-key/breeds/abys").then().statusCode(405);
        assertEquals(before, UpstreamStub.calls.get());
    }

    @Test void simulatedDataNeverCallsUpstream() {
        int before = UpstreamStub.calls.get();
        given().get("/demo/breeds").then().statusCode(200).header("X-Kiosque-Source", "simulated").body("size()", equalTo(10));
        given().queryParam("q", "siam").get("/demo/breeds/search").then().statusCode(200).body("[0].id", equalTo("siam"));
        given().get("/demo/breeds/siam").then().statusCode(200).body("name", equalTo("Siamese"));
        given().get("/demo/images/search").then().statusCode(200).body("size()", equalTo(0));
        given().get("/demo/breeds/absent").then().statusCode(404);
        given().get("/demo/no-key/breeds/abys").then().statusCode(403).header("X-Kiosque-Source", "simulated")
                .body("statusCode", equalTo(403)).body("path", equalTo("/v1/breeds/abys")).body("error", equalTo("Forbidden"));
        assertEquals(before, UpstreamStub.calls.get());
    }

    // La politique CSP interdit styles et gestionnaires d'événements en ligne : la page d'accueil
    // doit donc rester sans <style> ni onload, sinon la feuille de style n'est jamais appliquée.
    @Test void servesAnIndexThatTheStrictPolicyLetsStyleItself() {
        var response = given().get("/").then().statusCode(200).header("Cache-Control", "no-cache");
        String html = response.extract().asString();
        assertFalse(html.contains("<style"), "style en ligne bloqué par la CSP");
        assertFalse(html.contains("onload="), "gestionnaire en ligne bloqué par la CSP");
        assertFalse(html.contains("media=\"print\""), "feuille de style différée par un script bloqué");
        assertTrue(html.contains("rel=\"stylesheet\""));
        given().get("/openapi.json").then().header("Cache-Control", "no-cache");
    }

    @Test void servesAngularAndIsolatesSwaggerPolicy() {
        given().get("/").then().statusCode(200).body(containsString("<app-root>"))
                .header("Content-Security-Policy", not(containsString("unsafe-eval")));
        given().get("/oas.html").then().statusCode(200).body(containsString("swagger-editor-bundle.js"))
                .header("Content-Security-Policy", containsString("unsafe-eval"));
        given().get("/openapi.json").then().statusCode(200).body("info.title", equalTo("TheCatAPI"));
        given().get("/config/application.properties").then().statusCode(404);
    }

    // Le cadre d'essai du code de l'IA reçoit sa propre politique : origine opaque, réseau limité à TheCatAPI, incrustable par le kiosque seul.
    @Test void isolatesTheSandboxFrameWithItsOwnPolicy() {
        String policy = given().get("/sandbox.html").then().statusCode(200).body(containsString("kiosque-sandbox"))
                .header("Cache-Control", "no-cache").header("Referrer-Policy", "no-referrer")
                .extract().header("Content-Security-Policy");
        assertTrue(policy.startsWith("sandbox allow-scripts;"), policy);
        assertFalse(policy.contains("allow-same-origin"), "l'origine doit rester opaque");
        assertTrue(policy.contains("default-src 'none'"), policy);
        assertTrue(policy.contains("connect-src https://*.thecatapi.com;"), policy);
        assertTrue(policy.contains("frame-ancestors 'self'"), policy);
        assertTrue(policy.contains("form-action 'none'") && policy.contains("base-uri 'none'"), policy);
        assertFalse(policy.contains("unsafe-eval"), policy);
        // L'assouplissement reste cantonné au cadre : la page du kiosque garde des scripts et styles strictement locaux.
        String app = given().get("/").then().extract().header("Content-Security-Policy");
        assertTrue(app.contains("script-src 'self';") && app.contains("style-src 'self';") && app.contains("connect-src 'self';"), app);
        assertTrue(app.contains("img-src 'self' https: data:;"), app);
        assertFalse(app.contains("unsafe-inline"), app);
        assertFalse(app.contains("thecatapi.com;"), app);
    }
}
