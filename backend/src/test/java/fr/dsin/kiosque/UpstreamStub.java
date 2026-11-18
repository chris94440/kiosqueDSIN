package fr.dsin.kiosque;

import com.sun.net.httpserver.HttpServer;
import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;

public class UpstreamStub implements QuarkusTestResourceLifecycleManager {
    static final AtomicInteger calls = new AtomicInteger();
    static final AtomicInteger imageCalls = new AtomicInteger();
    static volatile String lastKey;
    static volatile String lastImageKey;
    static volatile String lastQuery;
    private HttpServer server;

    @Override public Map<String, String> start() {
        try {
            byte[] big = bigPhoto();
            byte[] logo = transparentLogo();
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/v1", exchange -> {
                calls.incrementAndGet();
                lastKey = exchange.getRequestHeaders().getFirst("x-api-key");
                lastQuery = exchange.getRequestURI().getRawQuery();
                String path = exchange.getRequestURI().getPath();
                String query = exchange.getRequestURI().getQuery();
                int status = 200;
                String body = "[{\"id\":\"siam\",\"name\":\"Siamese\",\"country_code\":\"TH\"}]";
                if (path.equals("/v1/breeds/siam")) body = "{\"id\":\"siam\",\"name\":\"Siamese\"}";
                if (path.equals("/v1/images/search")) body = "[]";
                if ("q=forbidden".equals(query)) { status = 403; body = "{\"message\":\"Authentication required\"}"; }
                if ("q=quota".equals(query)) { status = 429; body = "{\"message\":\"Quota exceeded\"}"; }
                if ("q=unavailable".equals(query)) { status = 503; body = "{\"message\":\"Unavailable\"}"; }
                if ("q=nonjson".equals(query)) body = "<html>Not JSON</html>";
                // Comme le vrai fournisseur : sans clé, refus 403 avant toute autre vérification.
                if (lastKey == null) {
                    status = 403;
                    body = "{\"statusCode\":403,\"path\":\"" + path + "\",\"message\":\"Authentication required. Please provide a valid API key.\",\"error\":\"Forbidden\"}";
                }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var output = exchange.getResponseBody()) { output.write(bytes); }
            });
            server.createContext("/images/", exchange -> {
                imageCalls.incrementAndGet();
                lastImageKey = exchange.getRequestHeaders().getFirst("x-api-key");
                String name = exchange.getRequestURI().getPath().substring("/images/".length());
                int status = 200;
                String type = "image/jpeg";
                byte[] bytes = big;
                if (name.equals("logo.png")) { type = "image/png"; bytes = logo; }
                else if (name.equals("broken.jpg")) { bytes = "<html>Pas une image</html>".getBytes(StandardCharsets.UTF_8); }
                else if (!name.equals("big.jpg")) { status = 404; type = "text/plain"; bytes = "absent".getBytes(StandardCharsets.UTF_8); }
                exchange.getResponseHeaders().set("Content-Type", type);
                exchange.sendResponseHeaders(status, bytes.length);
                try (var output = exchange.getResponseBody()) { output.write(bytes); }
            });
            server.start();
            int port = server.getAddress().getPort();
            return Map.of("thecatapi.base-url", "http://127.0.0.1:" + port + "/v1",
                    "thecatapi.images-base-url", "http://127.0.0.1:" + port + "/images/",
                    "thecatapi.api-key", "test-only-not-a-real-key");
        } catch (IOException error) { throw new IllegalStateException("Faux fournisseur impossible à démarrer", error); }
    }

    // 1600 x 1000 : rouge 300 px, vert 1000 px, bleu 300 px, avec du bruit pour que l'original reste lourd.
    private static byte[] bigPhoto() throws IOException {
        BufferedImage image = new BufferedImage(1600, 1000, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(new Color(220, 20, 20)); graphics.fillRect(0, 0, 300, 1000);
        graphics.setColor(new Color(20, 200, 20)); graphics.fillRect(300, 0, 1000, 1000);
        graphics.setColor(new Color(20, 20, 220)); graphics.fillRect(1300, 0, 300, 1000);
        Random random = new Random(7);
        for (int i = 0; i < 6000; i++) {
            int x = random.nextInt(1600);
            int y = random.nextInt(1000);
            Color base = new Color(image.getRGB(x, y));
            int shade = random.nextInt(40);
            graphics.setColor(new Color(Math.min(255, base.getRed() + shade), Math.min(255, base.getGreen() + shade), Math.min(255, base.getBlue() + shade)));
            graphics.fillRect(x, y, 3, 3);
        }
        graphics.dispose();
        return encode(image, "jpg");
    }

    // 120 x 80, un disque rouge au centre, coins transparents.
    private static byte[] transparentLogo() throws IOException {
        BufferedImage image = new BufferedImage(120, 80, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(new Color(220, 20, 20));
        graphics.fillOval(30, 10, 60, 60);
        graphics.dispose();
        return encode(image, "png");
    }

    private static byte[] encode(BufferedImage image, String format) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!ImageIO.write(image, format, output)) throw new IOException("Format de test non écrit : " + format);
        return output.toByteArray();
    }

    @Override public void stop() { if (server != null) server.stop(0); }
}
