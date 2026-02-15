#!/bin/bash
# NewLife SMP - Purpur Server Startup Script
# Optimized for 14GB RAM with Java 21

# Java executable (adjust path if needed)
JAVA="java"

# Memory allocation (adjust based on your server)
MIN_RAM="10G"
MAX_RAM="14G"

# Server JAR file
SERVER_JAR="purpur.jar"

# ============================================
# BACKUP CONFIGURATION
# ============================================
BACKUP_ENABLED=true
BACKUP_DIR="./backups"
WORLD_FOLDER="world"
MAX_BACKUPS=7  # Keep last 7 backups (1 week of daily backups)

# ============================================
# BACKUP FUNCTION
# ============================================
create_backup() {
    if [ "$BACKUP_ENABLED" != "true" ]; then
        echo "[Backup] Backups are disabled, skipping..."
        return 0
    fi

    echo "[Backup] Starting backup process..."
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Generate timestamp for backup name
    TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
    BACKUP_NAME="world_backup_${TIMESTAMP}.tar.gz"
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
    
    # Check if world folder exists
    if [ ! -d "$WORLD_FOLDER" ]; then
        echo "[Backup] WARNING: World folder '$WORLD_FOLDER' not found. Skipping backup."
        return 1
    fi
    
    # Create the backup (compress world folder)
    echo "[Backup] Creating backup: $BACKUP_NAME"
    tar -czf "$BACKUP_PATH" "$WORLD_FOLDER" "world_nether" "world_the_end" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
        echo "[Backup] Backup created successfully: $BACKUP_NAME ($BACKUP_SIZE)"
    else
        echo "[Backup] WARNING: Backup may be incomplete (some dimensions might not exist)"
    fi
    
    # Rotate old backups (delete oldest if over MAX_BACKUPS)
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/world_backup_*.tar.gz 2>/dev/null | wc -l)
    
    if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
        DELETE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
        echo "[Backup] Rotating backups: removing $DELETE_COUNT old backup(s)..."
        
        # Delete oldest backups (sorted by name/date)
        ls -1t "$BACKUP_DIR"/world_backup_*.tar.gz | tail -n "$DELETE_COUNT" | while read OLD_BACKUP; do
            echo "[Backup] Deleting old backup: $(basename $OLD_BACKUP)"
            rm -f "$OLD_BACKUP"
        done
    fi
    
    echo "[Backup] Backup process complete. Current backups: $(ls -1 "$BACKUP_DIR"/world_backup_*.tar.gz 2>/dev/null | wc -l)"
    return 0
}

# ============================================
# RUN BACKUP BEFORE SERVER START
# ============================================
create_backup

# ============================================
# OPTIMIZED JVM FLAGS FOR JAVA 21 + PURPUR
# ============================================

# Base flags
BASE_FLAGS="-Xms${MIN_RAM} -Xmx${MAX_RAM}"

# Aikar's flags (industry standard for Minecraft servers)
AIKAR_FLAGS="-XX:+UseG1GC \
-XX:+ParallelRefProcEnabled \
-XX:MaxGCPauseMillis=200 \
-XX:+UnlockExperimentalVMOptions \
-XX:+DisableExplicitGC \
-XX:+AlwaysPreTouch \
-XX:G1NewSizePercent=30 \
-XX:G1MaxNewSizePercent=40 \
-XX:G1HeapRegionSize=8M \
-XX:G1ReservePercent=20 \
-XX:G1HeapWastePercent=5 \
-XX:G1MixedGCCountTarget=4 \
-XX:InitiatingHeapOccupancyPercent=15 \
-XX:G1MixedGCLiveThresholdPercent=90 \
-XX:G1RSetUpdatingPauseTimePercent=5 \
-XX:SurvivorRatio=32 \
-XX:+PerfDisableSharedMem \
-XX:MaxTenuringThreshold=1"

# Additional performance flags
EXTRA_FLAGS="-Dusing.aikars.flags=https://mcflags.emc.gs \
-Daikars.new.flags=true \
-Dpaper.playerconnection.keepalive=60"

# Uncomment for --safeMode if recovering from datapack issues
# SAFE_MODE="--safeMode"

# ============================================
# START THE SERVER
# ============================================

echo "Starting NewLife SMP Purpur Server..."
echo "RAM: ${MIN_RAM} - ${MAX_RAM}"
echo "Server JAR: ${SERVER_JAR}"

${JAVA} ${BASE_FLAGS} ${AIKAR_FLAGS} ${EXTRA_FLAGS} -jar ${SERVER_JAR} --nogui ${SAFE_MODE}
