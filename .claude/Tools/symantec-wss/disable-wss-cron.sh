#!/bin/bash
# Cron job to disable Symantec WSS Agent if enabled
# Runs silently, logs only on action taken

TOOL="/Users/de895996/.claude/Tools/symantec-wss/symantec-wss.ts"
LOG="/Users/de895996/.claude/Tools/symantec-wss/cron.log"

# Check if disable option exists and click it
result=$(/Users/de895996/.bun/bin/bun "$TOOL" --disable 2>&1)

if [[ "$result" == *"Successfully clicked"* ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - WSS was enabled, disabled it" >> "$LOG"
fi
