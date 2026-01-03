package com.newlifesmp.link;

import org.slf4j.Logger;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public class Config {

    private final Path configPath;
    private final Logger logger;
    
    private String apiUrl;
    private String apiKey;
    private int timeout;
    private String kickMessage;
    private String apiErrorMessage;
    private String discordInvite;
    private String bypassPermission;
    private boolean debug;

    public Config(Path configPath, Logger logger) throws IOException {
        this.configPath = configPath;
        this.logger = logger;
        load();
    }

    @SuppressWarnings("unchecked")
    public void load() throws IOException {
        try (InputStream in = Files.newInputStream(configPath)) {
            Yaml yaml = new Yaml();
            Map<String, Object> data = yaml.load(in);

            // API settings
            Map<String, Object> api = (Map<String, Object>) data.getOrDefault("api", Map.of());
            this.apiUrl = (String) api.getOrDefault("url", "http://localhost:3001");
            this.apiKey = (String) api.getOrDefault("key", "your-secure-api-key-here");
            this.timeout = ((Number) api.getOrDefault("timeout", 5000)).intValue();

            // Messages
            Map<String, Object> messages = (Map<String, Object>) data.getOrDefault("messages", Map.of());
            this.kickMessage = (String) messages.getOrDefault("kick", getDefaultKickMessage());
            this.apiErrorMessage = (String) messages.getOrDefault("api-error", getDefaultApiErrorMessage());

            // Other settings
            this.discordInvite = (String) data.getOrDefault("discord-invite", "https://discord.gg/YKhHRCgaSv");
            this.bypassPermission = (String) data.getOrDefault("bypass-permission", "newlife.link.bypass");
            this.debug = (Boolean) data.getOrDefault("debug", false);

            if (debug) {
                logger.info("[DEBUG] Config loaded:");
                logger.info("[DEBUG] API URL: {}", apiUrl);
                logger.info("[DEBUG] Timeout: {}ms", timeout);
                logger.info("[DEBUG] Bypass Permission: {}", bypassPermission);
            }
        }
    }

    private String getDefaultKickMessage() {
        return """
            <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            <gradient:#FF6B6B:#FFE66D><bold>ACCOUNT NOT LINKED</bold></gradient>
            
            <gray>You must link your Discord account
            <gray>to join <gradient:#10b981:#3b82f6>NewLife SMP</gradient>.
            
            <white>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            <aqua><bold>HOW TO LINK:</bold>
            
            <yellow>1.</yellow> <gray>Join our Discord server:
               <click:open_url:'https://discord.gg/YKhHRCgaSv'><aqua><underlined>discord.gg/YKhHRCgaSv</underlined></aqua></click>
            
            <yellow>2.</yellow> <gray>Run the command in any channel:
               <white>/linkaccount <platform> <username>
            
            <yellow>3.</yellow> <gray>Examples:
               <green>/linkaccount Java Edition YourName
               <green>/linkaccount Bedrock Edition YourGamertag
            
            <white>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            <gray>After linking, try joining again!
            
            <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            """;
    }

    private String getDefaultApiErrorMessage() {
        return """
            <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            <gradient:#FF6B6B:#FFE66D><bold>CONNECTION ERROR</bold></gradient>
            
            <gray>Unable to verify your account link.
            <gray>Please try again in a moment.
            
            <yellow>If this persists, contact staff on Discord:
            <click:open_url:'https://discord.gg/YKhHRCgaSv'><aqua><underlined>discord.gg/YKhHRCgaSv</underlined></aqua></click>
            
            <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            """;
    }

    public String getApiUrl() {
        return apiUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public int getTimeout() {
        return timeout;
    }

    public String getKickMessage() {
        return kickMessage;
    }

    public String getApiErrorMessage() {
        return apiErrorMessage;
    }

    public String getDiscordInvite() {
        return discordInvite;
    }

    public String getBypassPermission() {
        return bypassPermission;
    }

    public boolean isDebug() {
        return debug;
    }
}
