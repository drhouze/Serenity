#!/bin/bash
# Keep the Next.js production server alive — restart if it dies
cd /home/z/my-project
while true; do
  if ! pgrep -f "standalone/server.js" > /dev/null 2>&1; then
    echo "[$(date)] Starting server..." >> /tmp/server-watchdog.log
    PORT=3000 setsid bun .next/standalone/server.js >> /tmp/server.log 2>&1 < /dev/null &
    disown
    sleep 5
    if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
      echo "[$(date)] Server is up" >> /tmp/server-watchdog.log
    else
      echo "[$(date)] Server failed to start" >> /tmp/server-watchdog.log
    fi
  fi
  sleep 10
done
