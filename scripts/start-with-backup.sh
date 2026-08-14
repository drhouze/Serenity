#!/bin/bash
# Start the Next.js dev server + auto-backup scheduler
cd /home/z/my-project

# Start auto-backup scheduler (10 PM Malaysia time daily)
nohup bash scripts/auto-backup-scheduler.sh > scripts/auto-backup-scheduler.log 2>&1 &

# Start Next.js dev server
npx next dev -p 3000
