package fr.dsin.kiosque;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import javax.net.ssl.SSLHandshakeException;
import org.jboss.logging.Logger;

/**
 * TheCatAPI ignore le paramètre de contrat « size » : chaque photo arrive en pleine définition
 * (souvent plus de 1 Mo). Le BFF télécharge donc l'original une fois et sert une version réduite.
 */
@ApplicationScoped
public class PhotoService {
    static { System.setProperty("java.awt.headless", "true"); }

    /** thumb : vignette carrée recadrée au centre ; med : photo entière, plus petite que l'original. */
    public enum Size {
        THUMB("thumb", 320, true), MED("med", 900, false);

        final String label;
        final int pixels;
        final boolean square;

        Size(String label, int pixels, boolean square) {
            this.label = label;
            this.pixels = pixels;
            this.square = square;
        }

        public static Size parse(String label) {
            for (Size size : values()) if (size.label.equals(label)) return size;
            return null;
        }
    }

    public static class PhotoException extends Exception {
        final int status;

        PhotoException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private static final Logger LOG = Logger.getLogger(PhotoService.class);
    private static final Pattern FILE = Pattern.compile("[A-Za-z0-9_-]{1,40}\\.(?:jpe?g|png|gif)", Pattern.CASE_INSENSITIVE);
    private static final int MAX_SOURCE_BYTES = 15 * 1024 * 1024;
    private static final long MAX_SOURCE_PIXELS = 150_000_000L;
    private static final double MAX_DECODED_PIXELS = 12_000_000.0;
    private static final int MAX_CACHED_PHOTOS = 400;

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private final Semaphore slots = new Semaphore(4);
    private final Map<String, byte[]> cache = new LinkedHashMap<>(64, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, byte[]> eldest) { return size() > MAX_CACHED_PHOTOS; }
    };

    @Inject CatApiConfig config;

    public static boolean isValidFile(String file) { return file != null && FILE.matcher(file).matches(); }

    public byte[] render(String file, Size size) throws PhotoException {
        String key = size.label + '/' + file;
        byte[] ready = cached(key);
        if (ready != null) return ready;
        try {
            if (!slots.tryAcquire(20, TimeUnit.SECONDS)) throw new PhotoException(503, "Trop de vignettes en préparation. Réessayez.");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new PhotoException(503, "Appel interrompu. Réessayez.");
        }
        try {
            ready = cached(key);
            if (ready != null) return ready;
            byte[] rendered = resize(download(file), size);
            synchronized (cache) { cache.put(key, rendered); }
            return rendered;
        } finally {
            slots.release();
        }
    }

    private byte[] cached(String key) {
        synchronized (cache) { return cache.get(key); }
    }

    private byte[] download(String file) throws PhotoException {
        String base = config.imagesBaseUrl();
        HttpRequest request = HttpRequest.newBuilder(URI.create((base.endsWith("/") ? base : base + "/") + file))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "image/*")
                .GET().build();
        try {
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                int status = response.statusCode();
                if (status == 404) throw new PhotoException(404, "Photo introuvable chez le fournisseur.");
                if (status != 200) throw new PhotoException(502, "Le fournisseur d’images a répondu HTTP " + status + ".");
                byte[] data = body.readNBytes(MAX_SOURCE_BYTES + 1);
                if (data.length > MAX_SOURCE_BYTES) throw new PhotoException(502, "Photo source trop volumineuse.");
                return data;
            }
        } catch (HttpTimeoutException error) {
            LOG.warnf("Délai dépassé pour la photo %s", file);
            throw new PhotoException(504, "Le fournisseur d’images ne répond pas dans le délai de 15 secondes.");
        } catch (SSLHandshakeException error) {
            LOG.warnf("Confiance TLS impossible pour la photo %s", file);
            throw new PhotoException(502, "Certificat HTTPS non reconnu par Java. Utilisez le lanceur Windows ou un truststore approuvé ; ne désactivez pas TLS.");
        } catch (IOException error) {
            LOG.warnf("Téléchargement impossible pour la photo %s : %s", file, error.getClass().getSimpleName());
            throw new PhotoException(502, "Impossible de joindre le fournisseur d’images.");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new PhotoException(503, "Appel interrompu. Réessayez.");
        }
    }

    static byte[] resize(byte[] source, Size size) throws PhotoException {
        try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(source))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new PhotoException(502, "Format de photo non pris en charge : vignette impossible.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, false, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || (long) width * height > MAX_SOURCE_PIXELS) {
                    throw new PhotoException(502, "Dimensions de photo refusées.");
                }
                // Le décodage saute des pixels : on garde au moins deux fois la taille cible pour rester net.
                int quality = Math.min(width, height) / (2 * size.pixels);
                int memory = (int) Math.ceil(Math.sqrt(width * (double) height / MAX_DECODED_PIXELS));
                int step = Math.max(1, Math.max(quality, memory));
                ImageReadParam parameters = reader.getDefaultReadParam();
                parameters.setSourceSubsampling(step, step, 0, 0);
                return encode(scale(reader.read(0, parameters), size));
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException error) {
            LOG.warnf("Photo illisible : %s", error.getClass().getSimpleName());
            throw new PhotoException(502, "Photo illisible : vignette impossible.");
        }
    }

    private static BufferedImage scale(BufferedImage decoded, Size size) {
        BufferedImage image = decoded;
        int targetWidth;
        int targetHeight;
        if (size.square) {
            int side = Math.min(image.getWidth(), image.getHeight());
            image = image.getSubimage((image.getWidth() - side) / 2, (image.getHeight() - side) / 2, side, side);
            targetWidth = targetHeight = Math.min(side, size.pixels);
        } else {
            double ratio = Math.min(1.0, (double) size.pixels / Math.max(image.getWidth(), image.getHeight()));
            targetWidth = Math.max(1, (int) Math.round(image.getWidth() * ratio));
            targetHeight = Math.max(1, (int) Math.round(image.getHeight() * ratio));
        }
        int width = image.getWidth();
        int height = image.getHeight();
        while (width / 2 >= targetWidth && height / 2 >= targetHeight) {
            width /= 2;
            height /= 2;
            image = draw(image, width, height, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        }
        return draw(image, targetWidth, targetHeight, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    }

    // Fond blanc : le JPEG n'a pas de transparence (PNG et GIF).
    private static BufferedImage draw(BufferedImage source, int width, int height, Object interpolation) {
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interpolation);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        return target;
    }

    private static byte[] encode(BufferedImage image) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(32 * 1024);
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (ImageOutputStream stream = new MemoryCacheImageOutputStream(output)) {
            ImageWriteParam parameters = writer.getDefaultWriteParam();
            parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            parameters.setCompressionQuality(0.82f);
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), parameters);
        } finally {
            writer.dispose();
        }
        return output.toByteArray();
    }
}
