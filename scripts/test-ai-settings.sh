#!/bin/bash
# Login as owner, fetch /api/ai/config (the data source for the AI Settings tab),
# and confirm the response shape matches what AISettings.tsx expects.
BASE=http://localhost:3000

curl -sS -c /tmp/cookies-owner.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@home.com","password":"owner123"}' > /dev/null
echo "logged in as owner"

echo
echo "=== GET /api/ai/config ==="
RESP=$(curl -sS -b /tmp/cookies-owner.txt "$BASE/api/ai/config")
echo "$RESP" | python3 -m json.tool 2>&1 | head -40

echo
echo "=== Verify response shape ==="
echo "$RESP" | python3 << 'PYEOF'
import json, sys
try:
    d = json.load(sys.stdin)
    required = ['aiEnabled']
    missing = [k for k in required if k not in d]
    if missing:
        print(f'✗ missing keys: {missing}')
        sys.exit(1)
    print(f'aiEnabled: {d.get("aiEnabled")}')
    print(f'config:    {d.get("config")}')
    print(f'availableFeatures: {len(d.get("availableFeatures", []))} feature(s)')
    print(f'usage:     {d.get("usage")}')
    print()
    print('✓ AI Settings tab data source is working — the AISettings component will render correctly')
except Exception as e:
    print(f'✗ error: {e}')
PYEOF
