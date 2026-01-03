package com.newlifesmp.bans;

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

public class BanApiClient {

    private final String baseUrl;
    private final String apiKey;
    private final int timeout;
    private final Logger logger;
    private final HttpClient httpClient;
    private final Gson gson;

    public BanApiClient(String baseUrl, String apiKey, int timeout, Logger logger) {
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
     * Check if a UUID is banned
     * @param uuid The player's UUID (with or without dashes)
     * @return BanResult containing the ban status and data
     */
    public CompletableFuture<BanResult> checkBan(String uuid) {
        String normalizedUuid = uuid.replace("-", "");
        String url = baseUrl + "/api/ban/" + normalizedUuid;

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
                            boolean isBanned = json.has("banned") && json.get("banned").getAsBoolean();
                            
                            if (isBanned && json.has("data")) {
                                JsonObject data = json.getAsJsonObject("data");
                                return new BanResult(
                                    true,
                                    true,
                                    data.has("reason") ? data.get("reason").getAsString() : "No reason provided",
                                    data.has("duration") ? data.get("duration").getAsString() : "Unknown",
                                    data.has("isPermanent") && data.get("isPermanent").getAsBoolean(),
                                    data.has("remaining") ? data.get("remaining").getAsString() : "Unknown",
                                    data.has("caseNumber") ? data.get("caseNumber").getAsInt() : 0,
                                    data.has("staffTag") ? data.get("staffTag").getAsString() : "Staff",
                                    null
                                );
                            }
                            
                            return new BanResult(true, false, null, null, false, null, 0, null, null);
                        }
                    }
                    
                    logger.warn("Ban API returned non-success response: {} - {}", response.statusCode(), response.body());
                    return new BanResult(false, false, null, null, false, null, 0, null, "API error: " + response.statusCode());
                    
                } catch (Exception e) {
                    logger.error("Failed to parse ban API response", e);
                    return new BanResult(false, false, null, null, false, null, 0, null, "Parse error: " + e.getMessage());
                }
            })
            .exceptionally(e -> {
                logger.error("Ban API request failed", e);
                return new BanResult(false, false, null, null, false, null, 0, null, "Connection error: " + e.getMessage());
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
     * Result of a ban check
     */
    public static class BanResult {
        private final boolean success;
        private final boolean banned;
        private final String reason;
        private final String duration;
        private final boolean isPermanent;
        private final String remaining;
        private final int caseNumber;
        private final String staffTag;
        private final String error;

        public BanResult(boolean success, boolean banned, String reason, String duration,
                        boolean isPermanent, String remaining, int caseNumber, 
                        String staffTag, String error) {
            this.success = success;
            this.banned = banned;
            this.reason = reason;
            this.duration = duration;
            this.isPermanent = isPermanent;
            this.remaining = remaining;
            this.caseNumber = caseNumber;
            this.staffTag = staffTag;
            this.error = error;
        }

        public boolean isSuccess() {
            return success;
        }

        public boolean isBanned() {
            return banned;
        }

        public String getReason() {
            return reason != null ? reason : "No reason provided";
        }

        public String getDuration() {
            return duration != null ? duration : "Unknown";
        }

        public boolean isPermanent() {
            return isPermanent;
        }

        public String getRemaining() {
            return remaining != null ? remaining : "Unknown";
        }

        public int getCaseNumber() {
            return caseNumber;
        }

        public String getStaffTag() {
            return staffTag != null ? staffTag : "Staff";
        }

        public Optional<String> getError() {
            return Optional.ofNullable(error);
        }
    }
}
