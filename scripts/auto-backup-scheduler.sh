#!/bin/bash
# Auto-backup scheduler — runs the Google Drive auto-backup at 10 PM Malaysia time (14:00 UTC) daily.
# This script checks every 5 minutes if it's 10 PM MYT, and if so, triggers the backup.
# It's designed to run as a background process alongside the Next.js dev server.

INTERVAL=300  # 5 minutes
TARGET_HOUR_UTC=14  # 10 PM MYT = 14:00 UTC
LAST_RUN_DATE=""

while true; do
  CURRENT_HOUR=$(date -u +%H)
  CURRENT_DATE=$(date -u +%Y-%m-%d)
  
  # Check if it's 10 PM MYT (14:00 UTC) and we haven't run today
  if [ "$CURRENT_HOUR" -eq "$TARGET_HOUR_UTC" ] && [ "$LAST_RUN_DATE" != "$CURRENT_DATE" ]; then
    echo "[$(date)] Triggering auto-backup..."
    RESPONSE=$(curl -s -X POST http://127.0.0.1:3000/api/google-drive/auto-backup \
      -H "x-auto-backup-trigger: dashboard-cron" \
      --max-time 120 2>&1)
    echo "[$(date)] Response: $RESPONSE"
    LAST_RUN_DATE="$CURRENT_DATE"
  fi
  
  sleep $INTERVAL
done
