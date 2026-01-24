package com.newlifesmp.status;

import com.newlifesmp.status.commands.PvpCommand;
import com.newlifesmp.status.commands.StatusCommand;
import com.newlifesmp.status.listeners.CombatLogListener;
import com.newlifesmp.status.listeners.PlayerConnectionListener;
import com.newlifesmp.status.listeners.PlayerDamageListener;
import com.newlifesmp.status.listeners.PlayerDeathListener;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

public class NewLifeStatus extends JavaPlugin {

    private StatusConfig config;
    private PlayerDataManager dataManager;
    private TabListManager tabListManager;
    private ApiClient apiClient;
    private DamageTracker damageTracker;
    private CombatLogListener combatLogListener;
    private BukkitTask cooldownTask;

    @Override
    public void onEnable() {
        getLogger().info("╔════════════════════════════════════════╗");
        getLogger().info("║      NewLife Status v1.0.0            ║");
        getLogger().info("║   PvP Consent & Status System         ║");
        getLogger().info("╚════════════════════════════════════════╝");

        // Load configuration
        try {
            loadConfiguration();
        } catch (IOException e) {
            getLogger().severe("Failed to load configuration!");
            e.printStackTrace();
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        // Initialize managers
        Path dataPath = getDataFolder().toPath().resolve("playerdata");
        this.dataManager = new PlayerDataManager(dataPath, getLogger());
        this.tabListManager = new TabListManager(dataManager);
        
        // Initialize API client if enabled
        if (config.isDiscordEnabled()) {
            this.apiClient = new ApiClient(
                config.getDiscordApiUrl(),
                config.getDiscordApiKey(),
                getLogger()
            );
            getLogger().info("Discord logging enabled");
        } else {
            getLogger().info("Discord logging disabled");
        }

        // Initialize damage tracker
        this.damageTracker = new DamageTracker(this, config.getDamageSessionTimeout());
        getLogger().info("Damage tracker initialized (timeout: " + config.getDamageSessionTimeout() + "s)");

        // Initialize combat log listener
        this.combatLogListener = new CombatLogListener(this, config.getCombatTagDuration());
        getLogger().info("Combat logging system initialized (tag duration: " + config.getCombatTagDuration() + "s)");

        // Register commands
        PvpCommand pvpCommand = new PvpCommand(this);
        getCommand("pvp").setExecutor(pvpCommand);
        getCommand("pvp").setTabCompleter(pvpCommand);
        
        StatusCommand statusCommand = new StatusCommand(this);
        getCommand("status").setExecutor(statusCommand);
        getCommand("status").setTabCompleter(statusCommand);

        // Register listeners
        getServer().getPluginManager().registerEvents(
            new PlayerConnectionListener(this), 
            this
        );
        getServer().getPluginManager().registerEvents(
            new PlayerDeathListener(this),
            this
        );
        getServer().getPluginManager().registerEvents(
            new PlayerDamageListener(this),
            this
        );
        getServer().getPluginManager().registerEvents(
            combatLogListener,
            this
        );

        // Start cooldown check task (runs every second)
        this.cooldownTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            Bukkit.getOnlinePlayers().forEach(player -> {
                PlayerDataManager.PlayerData data = dataManager.getPlayerData(player.getUniqueId());
                if (data != null && data.hasPvpCooldown()) {
                    tabListManager.updatePlayer(player);
                }
            });
        }, 20L, 20L); // 20 ticks = 1 second

        getLogger().info("NewLife Status enabled successfully!");
        getLogger().info("PvP Cooldown: " + config.getPvpCooldown() + " seconds");
    }

    @Override
    public void onDisable() {
        if (cooldownTask != null) {
            cooldownTask.cancel();
        }
        getLogger().info("NewLife Status disabled");
    }

    private void loadConfiguration() throws IOException {
        if (!getDataFolder().exists()) {
            getDataFolder().mkdirs();
        }

        Path configPath = getDataFolder().toPath().resolve("config.yml");
        
        if (!Files.exists(configPath)) {
            try (InputStream in = getResource("config.yml")) {
                if (in != null) {
                    Files.copy(in, configPath);
                    getLogger().info("Created default configuration file");
                }
            }
        }

        this.config = new StatusConfig(configPath, getLogger());
        getLogger().info("Configuration loaded successfully");
    }

    public StatusConfig getStatusConfig() {
        return config;
    }

    public PlayerDataManager getDataManager() {
        return dataManager;
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

    public DamageTracker getDamageTracker() {
        return damageTracker;
    }

    public CombatLogListener getCombatLogListener() {
        return combatLogListener;
    }
}
