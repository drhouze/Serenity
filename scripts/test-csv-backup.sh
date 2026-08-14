#!/bin/bash
# Test the CSV backup end-to-end:
# 1. Login as developer (backdoor login — no DB needed)
# 2. GET /api/backup?format=csv
# 3. Verify the response is a valid ZIP file (not JSON fallback)
# 4. Inspect the ZIP contents — confirm it has _meta.csv + residents.csv etc.

BASE=http://localhost:3000

echo "=== Step 1: Backdoor login as developer ==="
curl -sS -c /tmp/cookies-dev.txt -X POST "$BASE/api/auth/backdoor-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@gmail.com","password":"dev123356"}' > /dev/null
echo "logged in"

echo
echo "=== Step 2: GET /api/backup?format=csv ==="
curl -sS -b /tmp/cookies-dev.txt "$BASE/api/backup?format=csv" -o /tmp/backup-test.zip -w "HTTP %{http_code} | size=%{size_download} bytes | content-type=%{content_type}\n"

echo
echo "=== Step 3: Verify it's a valid ZIP (not JSON fallback) ==="
file /tmp/backup-test.zip
echo

echo "=== Step 4: List ZIP contents ==="
unzip -l /tmp/backup-test.zip 2>&1 | head -30
echo

echo "=== Step 5: Inspect a sample CSV (residents.csv) ==="
unzip -p /tmp/backup-test.zip residents.csv 2>/dev/null | head -3
echo "  ..."

echo
echo "=== Step 6: Inspect _meta.csv ==="
unzip -p /tmp/backup-test.zip _meta.csv 2>/dev/null

echo
echo "=== Step 7: Verify JSON backup still works (regression check) ==="
curl -sS -b /tmp/cookies-dev.txt "$BASE/api/backup?format=json" -o /tmp/backup-test.json -w "HTTP %{http_code} | size=%{size_download} bytes | content-type=%{content_type}\n"
echo "JSON file starts with:"
head -c 100 /tmp/backup-test.json
echo "..."

