package com.newlifesmp.bans;

import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.ProxyServer;
import org.slf4j.Logger;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

@Plugin(
    id = "newlife-bans",
    name = "NewLife Bans",
    version = "1.0.0",
    description = "Discord-integrated ban system for NewLife SMP",
    authors = {"NewLife SMP"}
)
public class NewLifeBans {

    private final ProxyServer server;
    private final Logger logger;
    private final Path dataDirectory;
    private BanConfig config;
    private BanApiClient apiClient;

    @Inject
    public NewLifeBans(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
        this.server = server;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        logger.info("╔════════════════════════════════════════╗");
        logger.info("║        NewLife Bans v1.0.0             ║");
        logger.info("║   Discord-Integrated Ban System        ║");
        logger.info("╚════════════════════════════════════════╝");

        // Load configuration
        try {
            loadConfig();
        } catch (IOException e) {
            logger.error("Failed to load configuration!", e);
            return;
        }

        // Initialize API client
        this.apiClient = new BanApiClient(
            config.getApiUrl(),
            config.getApiKey(),
            config.getTimeout(),
            logger
        );

        // Register event listeners
        server.getEventManager().register(this, new BanCheckListener(this));

        // Register commands
        server.getCommandManager().register(
            server.getCommandManager().metaBuilder("baninfo")
                .aliases("bi", "checkban")
                .plugin(this)
                .build(),
            new BanInfoCommand(this)
        );

        logger.info("NewLife Bans enabled successfully!");
        logger.info("API URL: {}", config.getApiUrl());
    }

    @Subscribe
    public void onProxyShutdown(ProxyShutdownEvent event) {
        logger.info("NewLife Bans disabled.");
    }

    private void loadConfig() throws IOException {
        if (!Files.exists(dataDirectory)) {
            Files.createDirectories(dataDirectory);
        }

        Path configPath = dataDirectory.resolve("config.yml");
        
        if (!Files.exists(configPath)) {
            try (InputStream in = getClass().getResourceAsStream("/config.yml")) {
                if (in != null) {
                    Files.copy(in, configPath);
                    logger.info("Created default configuration file.");
                } else {
                    Files.writeString(configPath, getDefaultConfig());
                    logger.info("Created minimal configuration file.");
                }
            }
        }

        this.config = new BanConfig(configPath, logger);
        logger.info("Configuration loaded successfully.");
    }

    private String getDefaultConfig() {
        return """
            # NewLife Bans Configuration
            
            # API Settings
            api:
              # The URL of your Discord bot's API
              url: "http://localhost:3001"
              # API key for authentication (must match LINK_API_KEY in bot .env)
              key: "your-secure-api-key-here"
              # Request timeout in milliseconds
              timeout: 5000
            
            # Messages (supports MiniMessage format)
            messages:
              # Kick message shown to banned players
              banned: |
                <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
                <gradient:#FF4444:#FF6B6B><bold>YOU ARE BANNED</bold></gradient>
                
                <gray>You have been banned from
                <gradient:#10b981:#3b82f6>NewLife SMP</gradient>.
                
                <white>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
                <yellow><bold>BAN DETAILS:</bold>
                
                <gray>Reason: <white>{reason}
                <gray>Duration: <white>{duration}
                <gray>Expires: <white>{expires}
                <gray>Case: <white>#{case}
                
                <white>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
                <aqua><bold>APPEAL:</bold>
                
                <gray>If you believe this ban was issued in error,
                <gray>you may appeal on our Discord server:
                <click:open_url:'https://discord.gg/YKhHRCgaSv'><aqua><underlined>discord.gg/YKhHRCgaSv</underlined></aqua></click>
                
                <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
              # Message shown when API is unavailable
              api-error: |
                <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
                <gradient:#FF6B6B:#FFE66D><bold>CONNECTION ERROR</bold></gradient>
                
                <gray>Unable to verify your ban status.
                <gray>Please try again in a moment.
                
                <yellow>If this persists, contact staff on Discord:
                <click:open_url:'https://discord.gg/YKhHRCgaSv'><aqua><underlined>discord.gg/YKhHRCgaSv</underlined></aqua></click>
                
                <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            # Discord invite URL
            discord-invite: "https://discord.gg/YKhHRCgaSv"
            
            # Bypass permission - players with this permission skip the ban check
            bypass-permission: "newlife.bans.bypass"
            
            # Debug mode - enables verbose logging
            debug: false
            """;
    }

    public ProxyServer getServer() {
        return server;
    }

    public Logger getLogger() {
        return logger;
    }

    public BanConfig getConfig() {
        return config;
    }

    public BanApiClient getApiClient() {
        return apiClient;
    }
}
