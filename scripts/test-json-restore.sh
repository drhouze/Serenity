#!/bin/bash
# Regression check: JSON restore still works
BASE=http://localhost:3000

echo "=== JSON restore regression check ==="
# Already logged in from previous test
echo "Step 1: Download JSON backup..."
curl -sS -b /tmp/cookies-dev.txt "$BASE/api/backup?format=json" -o /tmp/test-backup.json -w "HTTP %{http_code} | size=%{size_download} bytes\n"

echo "Step 2: Upload JSON to /api/restore..."
RESP=$(curl -sS -b /tmp/cookies-dev.txt -X POST "$BASE/api/restore" \
  -F "file=@/tmp/test-backup.json;type=application/json" \
  -w "\nHTTP %{http_code}")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -n -1)
echo "HTTP status: $HTTP"

echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('success'):
    print(f'✓ PASS: JSON restore succeeded — {d.get(\"imported\", 0)} records imported, {d.get(\"errors\", 0)} errors, format={d.get(\"format\")}')
else:
    print(f'✗ FAIL: {d.get(\"error\", \"unknown\")}')
"

rm -f /tmp/test-backup.json
