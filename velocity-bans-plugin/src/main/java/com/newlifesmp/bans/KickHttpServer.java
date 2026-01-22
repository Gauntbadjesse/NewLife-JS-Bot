package com.newlifesmp.bans;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import org.slf4j.Logger;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * Simple HTTP server to receive kick notifications from Discord bot
 */
public class KickHttpServer {
    
    private final HttpServer server;
    private final Logger logger;
    private final BanCheckListener banCheckListener;
    private final String apiKey;
    private final Gson gson;
    
    public KickHttpServer(int port, String apiKey, BanCheckListener banCheckListener, Logger logger) throws IOException {
        this.logger = logger;
        this.banCheckListener = banCheckListener;
        this.apiKey = apiKey;
        this.gson = new Gson();
        
        this.server = HttpServer.create(new InetSocketAddress(port), 0);
        this.server.createContext("/kick", this::handleKickNotification);
        this.server.setExecutor(null); // Use default executor
    }
    
    public void start() {
        server.start();
        logger.info("Kick notification server started on port {}", 
            server.getAddress().getPort());
    }
    
    public void stop() {
        server.stop(0);
        logger.info("Kick notification server stopped");
    }
    
    private void handleKickNotification(HttpExchange exchange) throws IOException {
        try {
            // Only accept POST requests
            if (!"POST".equals(exchange.getRequestMethod())) {
                sendResponse(exchange, 405, createErrorResponse("Method not allowed"));
                return;
            }
            
            // Check API key
            String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
            if (authHeader == null || !authHeader.equals("Bearer " + apiKey)) {
                sendResponse(exchange, 401, createErrorResponse("Unauthorized"));
                return;
            }
            
            // Read request body
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonObject json = gson.fromJson(body, JsonObject.class);
            
            if (!json.has("uuid")) {
                sendResponse(exchange, 400, createErrorResponse("Missing UUID"));
                return;
            }
            
            String uuid = json.get("uuid").getAsString();
            
            // Record the kick
            banCheckListener.recordKick(uuid);
            
            logger.info("Received kick notification for player {}", uuid);
            
            // Send success response
            JsonObject response = new JsonObject();
            response.addProperty("success", true);
            response.addProperty("message", "Kick recorded");
            
            sendResponse(exchange, 200, gson.toJson(response));
            
        } catch (Exception e) {
            logger.error("Error handling kick notification", e);
            sendResponse(exchange, 500, createErrorResponse("Internal server error"));
        }
    }
    
    private void sendResponse(HttpExchange exchange, int statusCode, String response) throws IOException {
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
    
    private String createErrorResponse(String message) {
        JsonObject response = new JsonObject();
        response.addProperty("success", false);
        response.addProperty("error", message);
        return gson.toJson(response);
    }
}
