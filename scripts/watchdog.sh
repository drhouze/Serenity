#!/bin/bash
cd /home/z/my-project
while true; do
  if ! curl -s --max-time 3 http://localhost:3000/ > /dev/null 2>&1; then
    echo "[$(date)] Server down — starting with node..." >> /tmp/watchdog.log
    PORT=3000 node .next/standalone/server.js >> /tmp/server.log 2>&1 &
    sleep 5
    if curl -s --max-time 3 http://localhost:3000/ > /dev/null 2>&1; then
      echo "[$(date)] Server up" >> /tmp/watchdog.log
    fi
  fi
  sleep 15
done
