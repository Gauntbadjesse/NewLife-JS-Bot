package com.newlifesmp.status;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;

public class ApiClient {
    private final String apiUrl;
    private final String apiKey;
    private final int timeout;
    private final Logger logger;
    private final Gson gson;
    private final ExecutorService executor;

    public ApiClient(String apiUrl, String apiKey, int timeout, Logger logger) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.timeout = timeout;
        this.logger = logger;
        this.gson = new Gson();
        this.executor = Executors.newCachedThreadPool();
    }

    public CompletableFuture<Boolean> logPvpStatusChange(String uuid, String username, boolean enabled) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                JsonObject payload = new JsonObject();
                payload.addProperty("type", "status_change");
                payload.addProperty("uuid", uuid);
                payload.addProperty("username", username);
                payload.addProperty("enabled", enabled);
                payload.addProperty("timestamp", System.currentTimeMillis());

                return sendRequest("/log", payload);
            } catch (Exception e) {
                logger.error("Failed to log PvP status change", e);
                return false;
            }
        }, executor);
    }

    public CompletableFuture<Boolean> logPvpKill(
            String killerUuid, String killerName, boolean killerPvp, String killerStatus,
            String victimUuid, String victimName, boolean victimPvp, String victimStatus,
            boolean consensual) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                JsonObject payload = new JsonObject();
                payload.addProperty("type", "pvp_kill");
                
                JsonObject killer = new JsonObject();
                killer.addProperty("uuid", killerUuid);
                killer.addProperty("username", killerName);
                killer.addProperty("pvp_enabled", killerPvp);
                killer.addProperty("status", killerStatus);
                payload.add("killer", killer);
                
                JsonObject victim = new JsonObject();
                victim.addProperty("uuid", victimUuid);
                victim.addProperty("username", victimName);
                victim.addProperty("pvp_enabled", victimPvp);
                victim.addProperty("status", victimStatus);
                payload.add("victim", victim);
                
                payload.addProperty("consensual", consensual);
                payload.addProperty("timestamp", System.currentTimeMillis());

                return sendRequest("/log", payload);
            } catch (Exception e) {
                logger.error("Failed to log PvP kill", e);
                return false;
            }
        }, executor);
    }

    public CompletableFuture<Boolean> logInvalidPvp(
            String attackerUuid, String attackerName, boolean attackerPvp,
            String victimUuid, String victimName, boolean victimPvp,
            double damage) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                JsonObject payload = new JsonObject();
                payload.addProperty("type", "invalid_pvp");
                
                JsonObject attacker = new JsonObject();
                attacker.addProperty("uuid", attackerUuid);
                attacker.addProperty("username", attackerName);
                attacker.addProperty("pvp_enabled", attackerPvp);
                payload.add("attacker", attacker);
                
                JsonObject victim = new JsonObject();
                victim.addProperty("uuid", victimUuid);
                victim.addProperty("username", victimName);
                victim.addProperty("pvp_enabled", victimPvp);
                payload.add("victim", victim);
                
                payload.addProperty("damage", damage);
                payload.addProperty("timestamp", System.currentTimeMillis());

                return sendRequest("/log", payload);
            } catch (Exception e) {
                logger.error("Failed to log invalid PvP", e);
                return false;
            }
        }, executor);
    }

    public CompletableFuture<Boolean> logDeath(String uuid, String username, String cause) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                JsonObject payload = new JsonObject();
                payload.addProperty("type", "death");
                payload.addProperty("uuid", uuid);
                payload.addProperty("username", username);
                payload.addProperty("cause", cause);
                payload.addProperty("timestamp", System.currentTimeMillis());

                return sendRequest("/log", payload);
            } catch (Exception e) {
                logger.error("Failed to log death", e);
                return false;
            }
        }, executor);
    }

    private boolean sendRequest(String endpoint, JsonObject payload) {
        try {
            URL url = new URL(apiUrl + endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setConnectTimeout(timeout);
            conn.setReadTimeout(timeout);
            conn.setDoOutput(true);

            String jsonPayload = gson.toJson(payload);
            
            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = jsonPayload.getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }

            int responseCode = conn.getResponseCode();
            
            if (responseCode >= 200 && responseCode < 300) {
                logger.debug("Successfully sent API request to {}", endpoint);
                return true;
            } else {
                logger.warn("API request failed with status {}", responseCode);
                return false;
            }
        } catch (Exception e) {
            logger.error("Error sending API request", e);
            return false;
        }
    }

    public void shutdown() {
        executor.shutdown();
    }
}
