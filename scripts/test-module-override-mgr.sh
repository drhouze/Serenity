#!/bin/bash
# Verify MANAGER can now PATCH the org-custom-tabs endpoint (previously OWNER+DEV only)

BASE=http://localhost:3000

echo "=== Login as manager@demo.com (demo-org) ==="
curl -sS -c /tmp/cookies-mgr.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@demo.com","password":"demo123"}' > /dev/null

# Confirm session
ME=$(curl -sS -b /tmp/cookies-mgr.txt "$BASE/api/auth/me")
echo "Logged in as: $(echo "$ME" | python3 -c "import json,sys; u=json.load(sys.stdin)['user']; print(f\"{u['name']} <{u['email']}> role={u['role']} org={u.get('organizationId')}\")")"

ORG_ID="demo-org"

# Pick "Vital Signs" tab
TABS=$(curl -sS -b /tmp/cookies-mgr.txt "$BASE/api/org-custom-tabs?orgId=$ORG_ID")
SELECTION_ID=$(echo "$TABS" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
m = next((t for t in tabs if t['label'] == 'Vital Signs'), None)
if m and m.get('orgSelectionId'): print(m['orgSelectionId'])
")
echo "Target: Vital Signs (orgSelectionId=$SELECTION_ID)"

echo
echo "=== Manager PATCH moduleOverride=residents ==="
RESP=$(curl -sS -b /tmp/cookies-mgr.txt -X PATCH "$BASE/api/org-custom-tabs?id=$SELECTION_ID" \
  -H "Content-Type: application/json" \
  -d '{"moduleOverride":"residents"}' -w "\nHTTP %{http_code}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -n -1)
echo "Status: $CODE"
echo "Body: $BODY" | head -3

if echo "$CODE" | grep -q "200"; then
  echo "✓ PASS: Manager can now override module"
else
  echo "✗ FAIL: Manager got $CODE — expected 200"
fi

# Verify the override took effect
echo
echo "=== Verify Vital Signs now appears under residents module ==="
curl -sS -b /tmp/cookies-mgr.txt "$BASE/api/org-custom-tabs?orgId=$ORG_ID&module=residents" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
print(f'Tabs in residents module: {len(tabs)}')
for t in tabs: print(f'  • {t[\"label\"]} (effectiveModule={t[\"effectiveModule\"]})')
ok = any(t['label'] == 'Vital Signs' for t in tabs)
print('✓ PASS: Vital Signs now visible under residents module' if ok else '✗ FAIL: Vital Signs NOT under residents')
"

# Reset
echo
echo "=== Reset moduleOverride back to null ==="
curl -sS -b /tmp/cookies-mgr.txt -X PATCH "$BASE/api/org-custom-tabs?id=$SELECTION_ID" \
  -H "Content-Type: application/json" -d '{"moduleOverride":null}' > /dev/null
echo "Reset done"

