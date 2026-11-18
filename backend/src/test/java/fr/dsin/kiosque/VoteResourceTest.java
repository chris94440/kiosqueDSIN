package fr.dsin.kiosque;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
@QuarkusTestResource(UpstreamStub.class)
class VoteResourceTest {
    @Test void sharesVoteResultsAcrossClients() {
        given().delete("/vote/dsin").then().statusCode(200).body("totalVotes", equalTo(0)).body("votes.size()", equalTo(0));
        given().post("/vote/dsin/siam").then().statusCode(200).body("totalVotes", equalTo(1));
        given().post("/vote/dsin/siam").then().statusCode(200).body("totalVotes", equalTo(2));
        given().post("/vote/dsin/beng").then().statusCode(200).body("totalVotes", equalTo(3));

        given().get("/vote/dsin").then().statusCode(200)
                .body("totalVotes", equalTo(3))
                .body("votes.size()", equalTo(2))
                .body("votes[0].breedId", equalTo("siam"))
                .body("votes[0].count", equalTo(2))
                .body("votes[1].breedId", equalTo("beng"))
                .body("votes[1].count", equalTo(1))
                .header("Cache-Control", equalTo("no-store"));
    }

    @Test void rejectsInvalidBreedIdAndKeepsTheBoardUnchanged() {
        given().delete("/vote/dsin").then().statusCode(200);
        given().post("/vote/dsin/char").then().statusCode(200).body("totalVotes", equalTo(1));

        int before = UpstreamStub.calls.get();
        given().post("/vote/dsin/si.am").then().statusCode(400).body("message", containsString("Identifiant de race invalide"));
        given().get("/vote/dsin").then().statusCode(200).body("totalVotes", equalTo(1)).body("votes.size()", equalTo(1));
        assertEquals(before, UpstreamStub.calls.get(), "les votes ne doivent pas appeler TheCatAPI");
    }

    @Test void resetsTheSharedBoard() {
        given().delete("/vote/dsin").then().statusCode(200);
        given().post("/vote/dsin/sphynx").then().statusCode(200).body("totalVotes", equalTo(1));

        given().delete("/vote/dsin").then().statusCode(200)
                .body("totalVotes", equalTo(0))
                .body("votes.size()", equalTo(0))
                .header("Cache-Control", equalTo("no-store"));
    }
}
