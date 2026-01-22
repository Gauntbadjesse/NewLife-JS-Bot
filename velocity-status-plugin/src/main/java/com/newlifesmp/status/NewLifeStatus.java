package com.newlifesmp.status;

import com.google.inject.Inject;
import com.newlifesmp.status.commands.PvpCommand;
import com.newlifesmp.status.commands.StatusCommand;
import com.newlifesmp.status.listeners.PlayerConnectionListener;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.command.CommandMeta;
import org.slf4j.Logger;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

@Plugin(
    id = "newlife-status",
    name = "NewLife Status",
    version = "1.0.0",
    description = "PvP consent and recording status system for NewLife SMP",
    authors = {"NewLife SMP"}
)
public class NewLifeStatus {

    private final ProxyServer server;
    private final Logger logger;
    private final Path dataDirectory;
    
    private StatusConfig config;
    private PlayerDataManager dataManager;
    private TabListManager tabListManager;
    private ApiClient apiClient;

    @Inject
    public NewLifeStatus(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
        this.server = server;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        logger.info("╔════════════════════════════════════════╗");
        logger.info("║        NewLife Status v1.0.0           ║");
        logger.info("║   PvP Consent & Status System          ║");
        logger.info("╚════════════════════════════════════════╝");

        // Load configuration
        try {
            loadConfig();
        } catch (IOException e) {
            logger.error("Failed to load configuration!", e);
            return;
        }

        // Initialize managers
        Path playerDataPath = dataDirectory.resolve("playerdata");
        this.dataManager = new PlayerDataManager(playerDataPath, logger);
        this.tabListManager = new TabListManager(server, dataManager, config, logger);
        this.apiClient = new ApiClient(
            config.getApiUrl(),
            config.getApiKey(),
            config.getApiTimeout(),
            logger
        );

        // Register event listeners
        server.getEventManager().register(this, new PlayerConnectionListener(this));

        // Register commands
        CommandMeta pvpMeta = server.getCommandManager().metaBuilder("pvp")
            .aliases("pvpstatus")
            .plugin(this)
            .build();
        server.getCommandManager().register(pvpMeta, new PvpCommand(this));

        CommandMeta statusMeta = server.getCommandManager().metaBuilder("status")
            .aliases("recordstatus", "streamstatus")
            .plugin(this)
            .build();
        server.getCommandManager().register(statusMeta, new StatusCommand(this));

        // Schedule cooldown checker task (every 30 seconds)
        server.getScheduler()
            .buildTask(this, this::checkCooldowns)
            .repeat(30, TimeUnit.SECONDS)
            .schedule();

        logger.info("NewLife Status enabled successfully!");
        logger.info("API URL: {}", config.getApiUrl());
        logger.info("PvP Cooldown: {} minutes", config.getPvpCooldownMinutes());
    }

    @Subscribe
    public void onProxyShutdown(ProxyShutdownEvent event) {
        logger.info("Saving all player data...");
        dataManager.saveAll();
        apiClient.shutdown();
        logger.info("NewLife Status disabled.");
    }

    private void loadConfig() throws IOException {
        if (!Files.exists(dataDirectory)) {
            Files.createDirectories(dataDirectory);
        }

        Path configPath = dataDirectory.resolve("config.yml");
        
        if (!Files.exists(configPath)) {
            // Copy default config from resources
            try (InputStream in = getClass().getResourceAsStream("/config.yml")) {
                if (in != null) {
                    Files.copy(in, configPath);
                    logger.info("Created default configuration file.");
                } else {
                    throw new IOException("Could not find default config.yml in resources");
                }
            }
        }

        // Load config
        try (InputStream in = Files.newInputStream(configPath)) {
            this.config = new StatusConfig(in);
            logger.info("Configuration loaded successfully.");
        }
    }

    /**
     * Check all players for expired cooldowns and update tab list
     */
    private void checkCooldowns() {
        server.getAllPlayers().forEach(player -> {
            PlayerDataManager.PlayerData data = dataManager.getPlayerData(player.getUniqueId());
            
            if (data.isInCooldown()) {
                // Check if cooldown just expired
                if (data.getCooldownRemaining() == 0) {
                    // PvP is now OFF
                    tabListManager.updatePlayer(player);
                    
                    // Log to Discord
                    apiClient.logPvpStatusChange(
                        player.getUniqueId().toString(),
                        player.getUsername(),
                        false
                    );
                    
                    player.sendMessage(net.kyori.adventure.text.Component.text(
                        config.getMessage("pvp_disabled")
                    ));
                    
                    dataManager.savePlayerData(player.getUniqueId(), data);
                }
            }
        });
    }

    // Getters
    public ProxyServer getServer() {
        return server;
    }

    public Logger getLogger() {
        return logger;
    }

    public StatusConfig getConfig() {
        return config;
    }

    public PlayerDataManager getPlayerDataManager() {
        return dataManager;
    }

    public TabListManager getTabListManager() {
        return tabListManager;
    }

    public ApiClient getApiClient() {
        return apiClient;
    }
}
