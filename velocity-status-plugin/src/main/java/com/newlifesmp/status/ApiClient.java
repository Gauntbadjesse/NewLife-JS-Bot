package com.newlifesmp.status;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.logging.Logger;

public class ApiClient {

    private final String apiUrl;
    private final String apiKey;
    private final Logger logger;
    private final Gson gson;

    public ApiClient(String apiUrl, String apiKey, Logger logger) {
        this.apiUrl = apiUrl.endsWith("/") ? apiUrl.substring(0, apiUrl.length() - 1) : apiUrl;
        this.apiKey = apiKey;
        this.logger = logger;
        this.gson = new Gson();
    }

    public CompletableFuture<Void> logStatusChange(String uuid, String username, String type, String metadata) {
        return CompletableFuture.runAsync(() -> {
            try {
                JsonObject payload = new JsonObject();
                payload.addProperty("type", "status_change");
                payload.addProperty("uuid", uuid);
                payload.addProperty("username", username);
                payload.addProperty("timestamp", System.currentTimeMillis());
                
                // Map type to enabled boolean for PvP status changes
                if (type.equals("pvp_enabled")) {
                    payload.addProperty("enabled", true);
                } else if (type.equals("pvp_disabled")) {
                    payload.addProperty("enabled", false);
                } else if (type.equals("recording") || type.equals("streaming") || type.equals("status_cleared")) {
                    // For recording/streaming status, store as metadata
                    payload.addProperty("status", type);
                    // These don't change PvP enabled state, just indicate status change
                    payload.addProperty("enabled", false); // Will be ignored by Discord logger for non-PvP changes
                }

                String endpoint = apiUrl + "/api/pvp/log";
                logger.info("Sending log to " + endpoint + " - Type: " + type + ", User: " + username);
                
                HttpURLConnection conn = (HttpURLConnection) URI.create(endpoint).toURL().openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = gson.toJson(payload).getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                int responseCode = conn.getResponseCode();
                if (responseCode == 200 || responseCode == 201) {
                    logger.info("✓ Successfully logged to Discord: " + type + " for " + username);
                } else {
                    logger.warning("✗ Discord API returned " + responseCode + " for status change log");
                }

                conn.disconnect();
            } catch (Exception e) {
                logger.warning("✗ Failed to log to Discord API: " + e.getMessage());
                e.printStackTrace();
            }
        });
    }

    /**
     * Send a generic log to the Discord API
     * @param endpoint The API endpoint (e.g., "pvp/damage-session" or "pvp/combat-log")
     * @param payload The JSON payload to send
     */
    public CompletableFuture<Void> sendLog(String endpoint, JsonObject payload) {
        return CompletableFuture.runAsync(() -> {
            try {
                String fullEndpoint = apiUrl + "/api/" + endpoint;
                logger.info("Sending log to " + fullEndpoint);
                
                HttpURLConnection conn = (HttpURLConnection) URI.create(fullEndpoint).toURL().openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = gson.toJson(payload).getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                int responseCode = conn.getResponseCode();
                if (responseCode == 200 || responseCode == 201) {
                    logger.info("✓ Successfully logged to Discord: " + endpoint);
                } else {
                    logger.warning("✗ Discord API returned " + responseCode + " for " + endpoint);
                }

                conn.disconnect();
            } catch (Exception e) {
                logger.warning("✗ Failed to log to Discord API: " + e.getMessage());
                e.printStackTrace();
            }
        });
    }
}
