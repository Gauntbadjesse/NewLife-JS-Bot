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
