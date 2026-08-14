#!/bin/bash
# End-to-end test of CSV ZIP restore:
# 1. Login as developer (backdoor)
# 2. Download a CSV ZIP backup
# 3. Upload it to /api/restore
# 4. Verify the restore succeeded (HTTP 200, imported > 0 records)

BASE=http://localhost:3000

echo "=== Step 1: Backdoor login ==="
curl -sS -c /tmp/cookies-dev.txt -X POST "$BASE/api/auth/backdoor-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@gmail.com","password":"dev123356"}' > /dev/null
echo "logged in"

echo
echo "=== Step 2: Download CSV ZIP backup ==="
curl -sS -b /tmp/cookies-dev.txt "$BASE/api/backup?format=csv" -o /tmp/test-backup.zip -w "HTTP %{http_code} | size=%{size_download} bytes | content-type=%{content_type}\n"
file /tmp/test-backup.zip | head -1

echo
echo "=== Step 3: Upload ZIP to /api/restore ==="
RESP=$(curl -sS -b /tmp/cookies-dev.txt -X POST "$BASE/api/restore" \
  -F "file=@/tmp/test-backup.zip;type=application/zip" \
  -w "\nHTTP %{http_code}")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -n -1)
echo "HTTP status: $HTTP"
echo "Body: $BODY" | head -3

echo
echo "=== Step 4: Verify restore worked ==="
echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('success'):
    print(f'✓ PASS: restore succeeded — {d.get(\"imported\", 0)} records imported, {d.get(\"errors\", 0)} errors, format={d.get(\"format\")}')
else:
    print(f'✗ FAIL: {d.get(\"error\", \"unknown\")}')
"

# Cleanup
rm -f /tmp/test-backup.zip
