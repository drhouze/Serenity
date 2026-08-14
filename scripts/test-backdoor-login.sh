#!/bin/bash
# End-to-end test of the emergency backdoor login.
# Verifies:
#   1. Correct credentials → HTTP 200, session cookie set, returns the backdoor user
#   2. /api/auth/me with the session cookie → returns the backdoor user (NO DB lookup)
#   3. Wrong credentials → HTTP 401 (same error as normal login)
#   4. Missing fields → HTTP 400

BASE=http://localhost:3000

echo "=== Test 1: Backdoor login with correct credentials ==="
RESP1=$(curl -sS -c /tmp/cookies-backdoor.txt -X POST "$BASE/api/auth/backdoor-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@gmail.com","password":"dev123356"}' \
  -w "\nHTTP %{http_code}")
HTTP1=$(echo "$RESP1" | tail -1)
BODY1=$(echo "$RESP1" | head -n -1)
echo "HTTP status: $HTTP1"
echo "Body: $BODY1" | head -3

echo
echo "=== Test 2: /api/auth/me with the backdoor session cookie ==="
ME_RESP=$(curl -sS -b /tmp/cookies-backdoor.txt "$BASE/api/auth/me")
echo "$ME_RESP" | python3 -m json.tool 2>&1 | head -15

echo
echo "=== Test 3: Wrong password → 401 (same error as normal login) ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/api/auth/backdoor-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@gmail.com","password":"wrongpassword"}'

echo
echo "=== Test 4: Wrong email → 401 ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/api/auth/backdoor-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"wrong@email.com","password":"dev123356"}'

echo
echo "=== Test 5: Missing fields → 400 ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/api/auth/backdoor-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@gmail.com"}'

echo
echo "=== Test 6: Verify the session works for an authenticated API call ==="
curl -sS -b /tmp/cookies-backdoor.txt "$BASE/api/data?type=residents" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    if isinstance(d, list):
        print(f'✓ GET /api/data?type=residents returned {len(d)} residents (session is valid)')
    elif isinstance(d, dict) and 'error' in d:
        print(f'✗ API error: {d[\"error\"]}')
    else:
        print(f'? Unexpected response: {str(d)[:100]}')
except Exception as e:
    print(f'✗ Parse error: {e}')
"

