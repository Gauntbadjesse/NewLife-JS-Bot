package com.newlife.analytics;

import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.DisconnectEvent;
import com.velocitypowered.api.event.connection.LoginEvent;
import com.velocitypowered.api.event.player.ServerConnectedEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import org.slf4j.Logger;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Plugin(
    id = "newlife-analytics",
    name = "NewLife Analytics",
    version = "1.0.0",
    description = "ALT detection and connection analytics",
    authors = {"NewLife SMP"}
)
public class NewLifeAnalytics {

    private final ProxyServer server;
    private final Logger logger;
    private final Path dataDirectory;
    
    private String apiUrl;
    private String apiKey;
    private boolean debug;
    
    // Track session start times
    private final Map<UUID, Long> sessionStartTimes = new ConcurrentHashMap<>();
    private final Map<UUID, String> lastServer = new ConcurrentHashMap<>();

    @Inject
    public NewLifeAnalytics(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
        this.server = server;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        loadConfig();
        logger.info("NewLife Analytics initialized!");
        logger.info("API URL: {}", apiUrl);
    }

    private void loadConfig() {
        try {
            if (!Files.exists(dataDirectory)) {
                Files.createDirectories(dataDirectory);
            }
            
            Path configPath = dataDirectory.resolve("config.properties");
            
            if (!Files.exists(configPath)) {
                // Create default config
                Properties defaults = new Properties();
                defaults.setProperty("api.url", "http://YOUR_BOT_IP:3002");
                defaults.setProperty("api.key", "your-analytics-api-key-here");
                defaults.setProperty("debug", "false");
                
                try (OutputStream out = Files.newOutputStream(configPath)) {
                    defaults.store(out, "NewLife Analytics Configuration - Update api.url to point to your bot server");
                }
            }
            
            Properties config = new Properties();
            try (InputStream in = Files.newInputStream(configPath)) {
                config.load(in);
            }
            
            apiUrl = config.getProperty("api.url", "http://localhost:3002");
            apiKey = config.getProperty("api.key", "");
            debug = Boolean.parseBoolean(config.getProperty("debug", "false"));
            
        } catch (IOException e) {
            logger.error("Failed to load config", e);
            apiUrl = "http://localhost:27289";
            apiKey = "";
            debug = false;
        }
    }

    @Subscribe
    public void onLogin(LoginEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        String username = player.getUsername();
        
        // Get IP address
        InetSocketAddress address = player.getRemoteAddress();
        String ip = address != null ? address.getAddress().getHostAddress() : "unknown";
        
        // Record session start
        sessionStartTimes.put(uuid, System.currentTimeMillis());
        
        if (debug) {
            logger.info("Player login: {} ({}) from {}", username, uuid, ip);
        }
        
        // Send connection event to API (async)
        server.getScheduler().buildTask(this, () -> {
            sendConnectionEvent(uuid.toString(), username, ip, "proxy", "join", 0, player.getPing());
        }).schedule();
    }

    @Subscribe
    public void onServerConnected(ServerConnectedEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        String serverName = event.getServer().getServerInfo().getName();
        
        // Track server changes
        String previousServer = lastServer.put(uuid, serverName);
        
        if (previousServer != null && !previousServer.equals(serverName)) {
            // Player switched servers
            InetSocketAddress address = player.getRemoteAddress();
            String ip = address != null ? address.getAddress().getHostAddress() : "unknown";
            
            if (debug) {
                logger.info("Player {} switched from {} to {}", player.getUsername(), previousServer, serverName);
            }
            
            server.getScheduler().buildTask(this, () -> {
                sendConnectionEvent(uuid.toString(), player.getUsername(), ip, serverName, "server_switch", 0, player.getPing());
            }).schedule();
        }
    }

    @Subscribe
    public void onDisconnect(DisconnectEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        String username = player.getUsername();
        
        // Calculate session duration
        Long startTime = sessionStartTimes.remove(uuid);
        long sessionDuration = startTime != null ? (System.currentTimeMillis() - startTime) / 1000 : 0;
        
        // Clean up
        String serverName = lastServer.remove(uuid);
        
        InetSocketAddress address = player.getRemoteAddress();
        String ip = address != null ? address.getAddress().getHostAddress() : "unknown";
        
        if (debug) {
            logger.info("Player disconnect: {} - session duration: {}s", username, sessionDuration);
        }
        
        // Send disconnect event
        final long duration = sessionDuration;
        server.getScheduler().buildTask(this, () -> {
            sendConnectionEvent(uuid.toString(), username, ip, serverName != null ? serverName : "proxy", "leave", duration, 0);
        }).schedule();
    }

    private void sendConnectionEvent(String uuid, String username, String ip, String serverName, String type, long sessionDuration, long ping) {
        try {
            String json = String.format(
                "{\"uuid\":\"%s\",\"username\":\"%s\",\"ip\":\"%s\",\"server\":\"%s\",\"type\":\"%s\",\"sessionDuration\":%d,\"ping\":%d}",
                uuid, username, ip, serverName, type, sessionDuration, ping
            );
            
            ApiClient.post(apiUrl + "/api/analytics/connection", apiKey, json);
            
            if (debug) {
                logger.info("Sent connection event: {} {} on {}", type, username, serverName);
            }
        } catch (Exception e) {
            if (debug) {
                logger.error("Failed to send connection event", e);
            }
        }
    }
}
