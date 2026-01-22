package com.newlifesmp.link;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.slf4j.Logger;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

public class LinkApiClient {

    private final String baseUrl;
    private final String apiKey;
    private final int timeout;
    private final Logger logger;
    private final HttpClient httpClient;
    private final Gson gson;

    public LinkApiClient(String baseUrl, String apiKey, int timeout, Logger logger) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.apiKey = apiKey;
        this.timeout = timeout;
        this.logger = logger;
        this.gson = new Gson();
        
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(timeout))
            .build();
    }

    /**
     * Check if a UUID is linked to a Discord account
     * @param uuid The player's UUID (with or without dashes)
     * @return LinkResult containing the link status and data
     */
    public CompletableFuture<LinkResult> checkLinked(String uuid) {
        String normalizedUuid = uuid.replace("-", "");
        String url = baseUrl + "/api/linked/" + normalizedUuid;

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .timeout(Duration.ofMillis(timeout))
            .GET()
            .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply(response -> {
                try {
                    if (response.statusCode() == 200) {
                        JsonObject json = gson.fromJson(response.body(), JsonObject.class);
                        
                        if (json.has("success") && json.get("success").getAsBoolean()) {
                            boolean isLinked = json.has("linked") && json.get("linked").getAsBoolean();
                            
                            if (isLinked && json.has("data")) {
                                JsonObject data = json.getAsJsonObject("data");
                                return new LinkResult(
                                    true,
                                    true,
                                    data.has("discordId") ? data.get("discordId").getAsString() : null,
                                    data.has("minecraftUsername") ? data.get("minecraftUsername").getAsString() : null,
                                    data.has("platform") ? data.get("platform").getAsString() : null,
                                    null
                                );
                            }
                            
                            return new LinkResult(true, false, null, null, null, null);
                        }
                    }
                    
                    logger.warn("API returned non-success response: {} - {}", response.statusCode(), response.body());
                    return new LinkResult(false, false, null, null, null, "API error: " + response.statusCode());
                    
                } catch (Exception e) {
                    logger.error("Failed to parse API response", e);
                    return new LinkResult(false, false, null, null, null, "Parse error: " + e.getMessage());
                }
            })
            .exceptionally(e -> {
                logger.error("API request failed", e);
                return new LinkResult(false, false, null, null, null, "Connection error: " + e.getMessage());
            });
    }

    /**
     * Health check for the API
     */
    public CompletableFuture<Boolean> healthCheck() {
        String url = baseUrl + "/api/health";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Authorization", "Bearer " + apiKey)
            .timeout(Duration.ofMillis(timeout))
            .GET()
            .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply(response -> response.statusCode() == 200)
            .exceptionally(e -> false);
    }

    /**
     * Result of a link check
     */
    public static class LinkResult {
        private final boolean success;
        private final boolean linked;
        private final String discordId;
        private final String minecraftUsername;
        private final String platform;
        private final String error;

        public LinkResult(boolean success, boolean linked, String discordId, 
                         String minecraftUsername, String platform, String error) {
            this.success = success;
            this.linked = linked;
            this.discordId = discordId;
            this.minecraftUsername = minecraftUsername;
            this.platform = platform;
            this.error = error;
        }

        public boolean isSuccess() {
            return success;
        }

        public boolean isLinked() {
            return linked;
        }

        public Optional<String> getDiscordId() {
            return Optional.ofNullable(discordId);
        }

        public Optional<String> getMinecraftUsername() {
            return Optional.ofNullable(minecraftUsername);
        }

        public Optional<String> getPlatform() {
            return Optional.ofNullable(platform);
        }

        public Optional<String> getError() {
            return Optional.ofNullable(error);
        }
    }
}
