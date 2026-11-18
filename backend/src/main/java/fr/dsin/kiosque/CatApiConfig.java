package fr.dsin.kiosque;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;
import java.util.Optional;

@ConfigMapping(prefix = "thecatapi")
public interface CatApiConfig {
    String baseUrl();
    Optional<String> apiKey();
    @WithDefault("https://cdn2.thecatapi.com/images/")
    String imagesBaseUrl();
}
