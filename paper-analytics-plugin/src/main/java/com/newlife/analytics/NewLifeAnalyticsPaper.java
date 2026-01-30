package com.newlife.analytics;

import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.World;
import org.bukkit.block.BlockState;
import org.bukkit.block.Hopper;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class NewLifeAnalyticsPaper extends JavaPlugin {

    private String apiUrl;
    private String apiKey;
    private String serverName;
    private boolean debug;
    
    // TPS tracking
    private long lastTickTime = System.currentTimeMillis();
    private final LinkedList<Double> tpsHistory = new LinkedList<>();
    private double currentTps = 20.0;
    private double currentMspt = 50.0;
    
    // Redstone tracking
    private final Map<String, Integer> redstoneActivity = new ConcurrentHashMap<>();
    private final Map<String, Integer> pistonActivity = new ConcurrentHashMap<>();
    
    // Thresholds
    private int entityWarning = 50;
    private int entityCritical = 150;
    private int hopperWarning = 50;
    private int redstoneWarning = 100;
    private double tpsAlertThreshold = 18.0;
    private double tpsCriticalThreshold = 15.0;
    
    // Scan intervals (in ticks)
    private int tpsInterval = 20;       // 1 second
    private int chunkScanInterval = 1200; // 1 minute (was 5 mins)
    private int tpsReportInterval = 60;   // 3 seconds (report to API)

    @Override
    public void onEnable() {
        saveDefaultConfig();
        loadConfig();
        
        getLogger().info("NewLife Analytics Paper enabled!");
        getLogger().info("Server: " + serverName);
        getLogger().info("API URL: " + apiUrl);
        getLogger().info("API Key: " + (apiKey != null && apiKey.length() > 8 ? apiKey.substring(0, 8) + "..." : "NOT SET"));
        
        // Test API connection on startup
        testApiConnection();
        
        // Start TPS monitor
        startTpsMonitor();
        
        // Start chunk scanner
        startChunkScanner();
        
        // Start TPS reporter
        startTpsReporter();
        
        getLogger().info("Analytics monitors started!");
    }
    
    private void testApiConnection() {
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            try {
                getLogger().info("Testing API connection to: " + apiUrl + "/api/analytics/tps");
                String testJson = String.format(
                    "{\"server\":\"%s\",\"tps\":20.0,\"mspt\":50.0,\"loadedChunks\":0,\"entityCount\":0,\"playerCount\":0,\"memoryUsed\":0,\"memoryMax\":0}",
                    serverName
                );
                ApiClient.post(apiUrl + "/api/analytics/tps", apiKey, testJson);
                getLogger().info("✓ API connection successful!");
            } catch (Exception e) {
                getLogger().severe("✗ API connection FAILED: " + e.getMessage());
                getLogger().severe("Check that:");
                getLogger().severe("  1. Bot is running and Analytics API is started");
                getLogger().severe("  2. api.url in config.yml points to the correct address");
                getLogger().severe("  3. api.key matches ANALYTICS_API_KEY in bot's .env");
                getLogger().severe("  4. Port 3002 is not blocked by firewall");
            }
        });
    }

    @Override
    public void onDisable() {
        getLogger().info("NewLife Analytics Paper disabled!");
    }

    private void loadConfig() {
        FileConfiguration config = getConfig();
        
        config.addDefault("api.url", "http://localhost:3002");
        config.addDefault("api.key", "your-analytics-api-key-here");
        config.addDefault("server.name", "main");
        config.addDefault("debug", false);
        
        config.addDefault("thresholds.entity.warning", 50);
        config.addDefault("thresholds.entity.critical", 150);
        config.addDefault("thresholds.hopper.warning", 50);
        config.addDefault("thresholds.redstone.warning", 100);
        config.addDefault("thresholds.tps.alert", 18.0);
        config.addDefault("thresholds.tps.critical", 15.0);
        
        config.addDefault("intervals.tps", 20);
        config.addDefault("intervals.chunkScan", 1200);
        config.addDefault("intervals.tpsReport", 60);
        
        config.options().copyDefaults(true);
        saveConfig();
        
        apiUrl = config.getString("api.url");
        apiKey = config.getString("api.key");
        serverName = config.getString("server.name");
        debug = config.getBoolean("debug");
        
        entityWarning = config.getInt("thresholds.entity.warning");
        entityCritical = config.getInt("thresholds.entity.critical");
        hopperWarning = config.getInt("thresholds.hopper.warning");
        redstoneWarning = config.getInt("thresholds.redstone.warning");
        tpsAlertThreshold = config.getDouble("thresholds.tps.alert");
        tpsCriticalThreshold = config.getDouble("thresholds.tps.critical");
        
        tpsInterval = config.getInt("intervals.tps");
        chunkScanInterval = config.getInt("intervals.chunkScan");
        tpsReportInterval = config.getInt("intervals.tpsReport");
    }

    private void startTpsMonitor() {
        new BukkitRunnable() {
            @Override
            public void run() {
                long now = System.currentTimeMillis();
                long diff = now - lastTickTime;
                lastTickTime = now;
                
                // Calculate TPS (20 ticks per second ideally)
                double tps = 1000.0 / diff * tpsInterval;
                tps = Math.min(tps, 20.0); // Cap at 20
                
                currentTps = tps;
                currentMspt = diff / (double) tpsInterval;
                
                // Keep history (last 60 samples = 1 minute at 1 sample/sec)
                synchronized (tpsHistory) {
                    tpsHistory.addLast(tps);
                    while (tpsHistory.size() > 60) {
                        tpsHistory.removeFirst();
                    }
                }
                
                if (debug) {
                    getLogger().info(String.format("TPS: %.2f, MSPT: %.2fms", tps, currentMspt));
                }
            }
        }.runTaskTimer(this, tpsInterval, tpsInterval);
    }

    private void startTpsReporter() {
        new BukkitRunnable() {
            @Override
            public void run() {
                // Collect data on main thread (required for Bukkit API)
                int entityCount = 0;
                int loadedChunks = 0;
                
                for (World world : Bukkit.getWorlds()) {
                    entityCount += world.getEntityCount();
                    loadedChunks += world.getLoadedChunks().length;
                }
                
                int playerCount = Bukkit.getOnlinePlayers().size();
                double tps = currentTps;
                double mspt = currentMspt;
                
                // Capture values for async task
                final int finalEntityCount = entityCount;
                final int finalLoadedChunks = loadedChunks;
                final int finalPlayerCount = playerCount;
                final double finalTps = tps;
                final double finalMspt = mspt;
                
                // Send to API async
                Bukkit.getScheduler().runTaskAsynchronously(NewLifeAnalyticsPaper.this, () -> {
                    reportTps(finalTps, finalMspt, finalLoadedChunks, finalEntityCount, finalPlayerCount);
                });
            }
        }.runTaskTimer(this, tpsReportInterval, tpsReportInterval);
    }

    private void reportTps(double tps, double mspt, int loadedChunks, int entityCount, int playerCount) {
        try {
            Runtime runtime = Runtime.getRuntime();
            long memoryUsed = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024);
            long memoryMax = runtime.maxMemory() / (1024 * 1024);
            
            String json = String.format(
                "{\"server\":\"%s\",\"tps\":%.2f,\"mspt\":%.2f,\"loadedChunks\":%d,\"entityCount\":%d,\"playerCount\":%d,\"memoryUsed\":%d,\"memoryMax\":%d}",
                serverName, tps, mspt, loadedChunks, entityCount, playerCount, memoryUsed, memoryMax
            );
            
            ApiClient.post(apiUrl + "/api/analytics/tps", apiKey, json);
            
            if (debug) {
                getLogger().info("Reported TPS: " + tps);
            }
            
            // Check for TPS alerts
            if (currentTps < tpsCriticalThreshold) {
                sendLagAlert("tps_drop", "critical", 
                    String.format("Critical TPS drop: %.2f (threshold: %.2f)", currentTps, tpsCriticalThreshold),
                    null, null);
                // Trigger immediate chunk scan when TPS is critical
                Bukkit.getScheduler().runTask(NewLifeAnalyticsPaper.this, () -> scanChunks());
            } else if (currentTps < tpsAlertThreshold) {
                sendLagAlert("tps_drop", "high",
                    String.format("TPS warning: %.2f (threshold: %.2f)", currentTps, tpsAlertThreshold),
                    null, null);
            }
            
        } catch (Exception e) {
            if (debug) {
                getLogger().warning("Failed to report TPS: " + e.getMessage());
            }
        }
    }

    private void startChunkScanner() {
        new BukkitRunnable() {
            @Override
            public void run() {
                scanChunks();
            }
        }.runTaskTimer(this, chunkScanInterval, chunkScanInterval);
    }

    private void scanChunks() {
        List<Map<String, Object>> flaggedChunks = new ArrayList<>();
        
        for (World world : Bukkit.getWorlds()) {
            for (Chunk chunk : world.getLoadedChunks()) {
                Map<String, Object> chunkData = analyzeChunk(world, chunk);
                
                if (chunkData != null) {
                    flaggedChunks.add(chunkData);
                }
            }
        }
        
        // Send to API async
        if (!flaggedChunks.isEmpty()) {
            final List<Map<String, Object>> chunks = new ArrayList<>(flaggedChunks);
            Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
                sendChunkData(chunks);
            });
        }
    }

    private Map<String, Object> analyzeChunk(World world, Chunk chunk) {
        Entity[] entities = chunk.getEntities();
        int entityCount = entities.length;
        
        // Count entity types
        Map<String, Integer> entityBreakdown = new HashMap<>();
        for (Entity entity : entities) {
            String type = entity.getType().name().toLowerCase();
            entityBreakdown.merge(type, 1, Integer::sum);
        }
        
        // Count hoppers and redstone
        int hopperCount = 0;
        int redstoneCount = 0;
        
        BlockState[] tileEntities = chunk.getTileEntities();
        for (BlockState state : tileEntities) {
            if (state instanceof Hopper) {
                hopperCount++;
            }
            // Count redstone components
            String typeName = state.getType().name().toLowerCase();
            if (typeName.contains("redstone") || typeName.contains("repeater") || 
                typeName.contains("comparator") || typeName.contains("piston") ||
                typeName.contains("observer") || typeName.contains("dropper") ||
                typeName.contains("dispenser")) {
                redstoneCount++;
            }
        }
        
        // Check if chunk should be flagged
        boolean flagged = entityCount >= entityWarning || hopperCount >= hopperWarning || redstoneCount >= redstoneWarning;
        
        // Only report flagged chunks to reduce data
        if (!flagged && entityCount < 50) {
            return null;
        }
        
        // Find nearby players
        List<Map<String, String>> playersNearby = new ArrayList<>();
        int chunkX = chunk.getX() * 16 + 8;
        int chunkZ = chunk.getZ() * 16 + 8;
        
        for (Player player : world.getPlayers()) {
            double distance = player.getLocation().distance(
                new org.bukkit.Location(world, chunkX, player.getLocation().getY(), chunkZ)
            );
            if (distance < 64) { // Within 4 chunks
                Map<String, String> playerData = new HashMap<>();
                playerData.put("uuid", player.getUniqueId().toString());
                playerData.put("username", player.getName());
                playersNearby.add(playerData);
            }
        }
        
        Map<String, Object> chunkData = new HashMap<>();
        chunkData.put("world", world.getName());
        chunkData.put("x", chunk.getX());
        chunkData.put("z", chunk.getZ());
        chunkData.put("entities", entityCount);
        chunkData.put("entityBreakdown", entityBreakdown);
        chunkData.put("hoppers", hopperCount);
        chunkData.put("redstone", redstoneCount);
        chunkData.put("tileEntities", tileEntities.length);
        chunkData.put("playersNearby", playersNearby);
        
        // Send alert for critical chunks
        if (entityCount >= entityCritical) {
            String details = String.format("Critical chunk at (%d, %d) in %s: %d entities", 
                chunk.getX(), chunk.getZ(), world.getName(), entityCount);
            
            Map<String, Object> location = new HashMap<>();
            location.put("world", world.getName());
            location.put("chunkX", chunk.getX());
            location.put("chunkZ", chunk.getZ());
            location.put("x", chunk.getX() * 16);
            location.put("z", chunk.getZ() * 16);
            
            Map<String, String> player = playersNearby.isEmpty() ? null : playersNearby.get(0);
            sendLagAlert("entity_spam", "critical", details, location, player);
        }
        
        return chunkData;
    }

    private void sendChunkData(List<Map<String, Object>> chunks) {
        try {
            StringBuilder json = new StringBuilder();
            json.append("{\"server\":\"").append(serverName).append("\",\"chunks\":[");
            
            for (int i = 0; i < chunks.size(); i++) {
                if (i > 0) json.append(",");
                json.append(mapToJson(chunks.get(i)));
            }
            
            json.append("]}");
            
            ApiClient.post(apiUrl + "/api/analytics/chunks", apiKey, json.toString());
            
            if (debug) {
                getLogger().info("Sent " + chunks.size() + " chunk reports");
            }
        } catch (Exception e) {
            if (debug) {
                getLogger().warning("Failed to send chunk data: " + e.getMessage());
            }
        }
    }

    private void sendLagAlert(String type, String severity, String details, 
                              Map<String, Object> location, Map<String, String> playerNearby) {
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            try {
                StringBuilder json = new StringBuilder();
                json.append("{");
                json.append("\"server\":\"").append(serverName).append("\",");
                json.append("\"type\":\"").append(type).append("\",");
                json.append("\"severity\":\"").append(severity).append("\",");
                json.append("\"details\":\"").append(escapeJson(details)).append("\"");
                
                if (location != null) {
                    json.append(",\"location\":").append(mapToJson(location));
                }
                
                if (playerNearby != null) {
                    json.append(",\"playerNearby\":{");
                    json.append("\"uuid\":\"").append(playerNearby.get("uuid")).append("\",");
                    json.append("\"username\":\"").append(playerNearby.get("username")).append("\"");
                    json.append("}");
                }
                
                json.append(",\"metrics\":{");
                json.append("\"tps\":").append(String.format("%.2f", currentTps)).append(",");
                json.append("\"mspt\":").append(String.format("%.2f", currentMspt));
                json.append("}}");
                
                ApiClient.post(apiUrl + "/api/analytics/lag-alert", apiKey, json.toString());
                
                getLogger().warning("Lag alert sent: " + type + " - " + severity);
            } catch (Exception e) {
                if (debug) {
                    getLogger().warning("Failed to send lag alert: " + e.getMessage());
                }
            }
        });
    }

    private String mapToJson(Map<String, Object> map) {
        StringBuilder json = new StringBuilder("{");
        boolean first = true;
        
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            if (!first) json.append(",");
            first = false;
            
            json.append("\"").append(entry.getKey()).append("\":");
            Object value = entry.getValue();
            
            if (value instanceof String) {
                json.append("\"").append(escapeJson((String) value)).append("\"");
            } else if (value instanceof Number) {
                json.append(value);
            } else if (value instanceof Map) {
                json.append(mapToJson((Map<String, Object>) value));
            } else if (value instanceof List) {
                json.append(listToJson((List<?>) value));
            } else {
                json.append("\"").append(value).append("\"");
            }
        }
        
        json.append("}");
        return json.toString();
    }

    private String listToJson(List<?> list) {
        StringBuilder json = new StringBuilder("[");
        boolean first = true;
        
        for (Object item : list) {
            if (!first) json.append(",");
            first = false;
            
            if (item instanceof Map) {
                json.append(mapToJson((Map<String, Object>) item));
            } else if (item instanceof String) {
                json.append("\"").append(escapeJson((String) item)).append("\"");
            } else {
                json.append(item);
            }
        }
        
        json.append("]");
        return json.toString();
    }

    private String escapeJson(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }

    public double getCurrentTps() {
        return currentTps;
    }

    public double getCurrentMspt() {
        return currentMspt;
    }
}
