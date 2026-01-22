package com.newlifesmp.status;

import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.util.Map;

public class StatusConfig {
    private final Map<String, Object> config;

    public StatusConfig(InputStream configStream) {
        Yaml yaml = new Yaml();
        this.config = yaml.load(configStream);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getSection(String path) {
        String[] parts = path.split("\\.");
        Map<String, Object> current = config;
        
        for (int i = 0; i < parts.length - 1; i++) {
            Object next = current.get(parts[i]);
            if (next instanceof Map) {
                current = (Map<String, Object>) next;
            } else {
                return null;
            }
        }
        
        return current;
    }

    private Object get(String path, Object defaultValue) {
        String[] parts = path.split("\\.");
        Map<String, Object> section = getSection(path);
        
        if (section == null) {
            return defaultValue;
        }
        
        Object value = section.get(parts[parts.length - 1]);
        return value != null ? value : defaultValue;
    }

    public String getString(String path, String defaultValue) {
        Object value = get(path, defaultValue);
        return value != null ? value.toString() : defaultValue;
    }

    public int getInt(String path, int defaultValue) {
        Object value = get(path, defaultValue);
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        return defaultValue;
    }

    public double getDouble(String path, double defaultValue) {
        Object value = get(path, defaultValue);
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return defaultValue;
    }

    public boolean getBoolean(String path, boolean defaultValue) {
        Object value = get(path, defaultValue);
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        return defaultValue;
    }

    // API Settings
    public String getApiUrl() {
        return getString("api.url", "http://localhost:3000/api/pvp");
    }

    public String getApiKey() {
        return getString("api.key", "your-api-key-here");
    }

    public int getApiTimeout() {
        return getInt("api.timeout", 5000);
    }

    // PvP Settings
    public int getPvpCooldownMinutes() {
        return getInt("pvp.cooldown_minutes", 5);
    }

    public double getDamageThreshold() {
        return getDouble("pvp.damage_threshold", 3.75);
    }

    // Colors
    public String getColorPvpOn() {
        return getString("colors.pvp_on", "§a");
    }

    public String getColorPvpOff() {
        return getString("colors.pvp_off", "§7");
    }

    public String getColorPvpCooldown() {
        return getString("colors.pvp_cooldown", "§e");
    }

    public String getColorStatusRecording() {
        return getString("colors.status_recording", "§c");
    }

    public String getColorStatusStreaming() {
        return getString("colors.status_streaming", "§5");
    }

    public String getColorStatusNone() {
        return getString("colors.status_none", "§7");
    }

    // TAB Format
    public String getTabFormat() {
        return getString("tab_format", "{player_name} {pvp}{status}");
    }

    // Messages
    public String getMessage(String key) {
        return getString("messages." + key, "§cMessage not configured: " + key);
    }
}
