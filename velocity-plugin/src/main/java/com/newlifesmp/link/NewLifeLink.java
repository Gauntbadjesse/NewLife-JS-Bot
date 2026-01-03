package com.newlifesmp.link;

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
    id = "newlife-link",
    name = "NewLife Link",
    version = "1.0.0",
    description = "Discord account linking enforcement for NewLife SMP",
    authors = {"NewLife SMP"}
)
public class NewLifeLink {

    private final ProxyServer server;
    private final Logger logger;
    private final Path dataDirectory;
    private Config config;
    private LinkApiClient apiClient;

    @Inject
    public NewLifeLink(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
        this.server = server;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        logger.info("╔════════════════════════════════════════╗");
        logger.info("║        NewLife Link v1.0.0             ║");
        logger.info("║   Discord Account Linking Enforcer     ║");
        logger.info("╚════════════════════════════════════════╝");

        // Load configuration
        try {
            loadConfig();
        } catch (IOException e) {
            logger.error("Failed to load configuration!", e);
            return;
        }

        // Initialize API client
        this.apiClient = new LinkApiClient(
            config.getApiUrl(),
            config.getApiKey(),
            config.getTimeout(),
            logger
        );

        // Register event listeners
        server.getEventManager().register(this, new PlayerJoinListener(this));

        // Register commands
        server.getCommandManager().register(
            server.getCommandManager().metaBuilder("linkstatus")
                .aliases("ls", "checklink")
                .plugin(this)
                .build(),
            new LinkStatusCommand(this)
        );

        logger.info("NewLife Link enabled successfully!");
        logger.info("API URL: {}", config.getApiUrl());
    }

    @Subscribe
    public void onProxyShutdown(ProxyShutdownEvent event) {
        logger.info("NewLife Link disabled.");
    }

    private void loadConfig() throws IOException {
        if (!Files.exists(dataDirectory)) {
            Files.createDirectories(dataDirectory);
        }

        Path configPath = dataDirectory.resolve("config.yml");
        
        if (!Files.exists(configPath)) {
            // Copy default config
            try (InputStream in = getClass().getResourceAsStream("/config.yml")) {
                if (in != null) {
                    Files.copy(in, configPath);
                    logger.info("Created default configuration file.");
                } else {
                    // Create minimal config if resource not found
                    Files.writeString(configPath, getDefaultConfig());
                    logger.info("Created minimal configuration file.");
                }
            }
        }

        this.config = new Config(configPath, logger);
        logger.info("Configuration loaded successfully.");
    }

    private String getDefaultConfig() {
        return """
            # NewLife Link Configuration
            
            # API Settings
            api:
              # The URL of your Discord bot's Link API
              url: "http://localhost:3001"
              # API key for authentication (must match LINK_API_KEY in bot .env)
              key: "your-secure-api-key-here"
              # Request timeout in milliseconds
              timeout: 5000
            
            # Messages (supports MiniMessage format)
            messages:
              # Kick message shown to unlinked players
              kick: |
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
            
              # Message shown when API is unavailable
              api-error: |
                <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
                <gradient:#FF6B6B:#FFE66D><bold>CONNECTION ERROR</bold></gradient>
                
                <gray>Unable to verify your account link.
                <gray>Please try again in a moment.
                
                <yellow>If this persists, contact staff on Discord:
                <click:open_url:'https://discord.gg/YKhHRCgaSv'><aqua><underlined>discord.gg/YKhHRCgaSv</underlined></aqua></click>
                
                <dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            # Discord invite URL
            discord-invite: "https://discord.gg/YKhHRCgaSv"
            
            # Bypass permission - players with this permission skip the link check
            bypass-permission: "newlife.link.bypass"
            
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

    public Config getConfig() {
        return config;
    }

    public LinkApiClient getApiClient() {
        return apiClient;
    }
}
