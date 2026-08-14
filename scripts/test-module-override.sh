#!/bin/bash
# Test: org owner/manager can override which module a custom tab appears under.
# Scenario:
#   1. Login as owner@home.com (manages the "default-org")
#   2. List the org's custom tabs — confirm the new fields are present
#   3. Pick the "Measurement History" tab (currently module=residents by dev default)
#   4. Override its module to "clinical" via PATCH
#   5. Confirm GET /api/org-custom-tabs?module=clinical now includes it
#   6. Confirm GET /api/org-custom-tabs?module=residents no longer includes it
#   7. Reset the override (PATCH moduleOverride=null) and confirm it returns to residents

BASE=http://localhost:3000

echo "=== Step 1: Login as owner@home.com ==="
curl -sS -c /tmp/cookies-owner.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@home.com","password":"owner123"}' > /dev/null
echo "logged in"

ORG_ID="default-org"

echo
echo "=== Step 2: List custom tabs (verify new fields: moduleOverride, effectiveModule) ==="
TABS=$(curl -sS -b /tmp/cookies-owner.txt "$BASE/api/org-custom-tabs?orgId=$ORG_ID")
echo "$TABS" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
print(f'Found {len(tabs)} tabs:')
for t in tabs:
    print(f'  • {t[\"label\"]:<25} module={t[\"module\"]:<10} moduleOverride={t[\"moduleOverride\"]} effectiveModule={t[\"effectiveModule\"]} orgSelectionId={t.get(\"orgSelectionId\") or \"—\"}')
"

# Pick the Measurement History tab (currently in residents module by dev default)
TAB_ID=$(echo "$TABS" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
m = next((t for t in tabs if t['label'] == 'Measurement History'), None)
if m: print(m['globalTabId'])
")
SELECTION_ID=$(echo "$TABS" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
m = next((t for t in tabs if t['label'] == 'Measurement History'), None)
if m and m.get('orgSelectionId'): print(m['orgSelectionId'])
")

echo
echo "=== Picked tab: Measurement History (globalTabId=$TAB_ID, orgSelectionId=${SELECTION_ID:-none}) ==="

if [ -z "$SELECTION_ID" ]; then
  echo "=== Step 3a: No org selection yet — POST to enable + set moduleOverride=clinical ==="
  curl -sS -b /tmp/cookies-owner.txt -X POST "$BASE/api/org-custom-tabs" \
    -H "Content-Type: application/json" \
    -d "{\"orgId\":\"$ORG_ID\",\"globalTabId\":\"$TAB_ID\",\"enabled\":true,\"moduleOverride\":\"clinical\"}" | python3 -m json.tool
  SELECTION_ID=$(curl -sS -b /tmp/cookies-owner.txt "$BASE/api/org-custom-tabs?orgId=$ORG_ID" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
m = next((t for t in tabs if t['label'] == 'Measurement History'), None)
if m and m.get('orgSelectionId'): print(m['orgSelectionId'])
")
else
  echo "=== Step 3b: PATCH existing selection to set moduleOverride=clinical ==="
  curl -sS -b /tmp/cookies-owner.txt -X PATCH "$BASE/api/org-custom-tabs?id=$SELECTION_ID" \
    -H "Content-Type: application/json" \
    -d '{"moduleOverride":"clinical"}' | python3 -m json.tool
fi

echo
echo "=== Step 4: GET module=clinical should now include Measurement History ==="
curl -sS -b /tmp/cookies-owner.txt "$BASE/api/org-custom-tabs?orgId=$ORG_ID&module=clinical" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
print(f'Tabs in clinical module: {len(tabs)}')
for t in tabs: print(f'  • {t[\"label\"]} (effectiveModule={t[\"effectiveModule\"]})')
ok = any(t['label'] == 'Measurement History' for t in tabs)
print('✓ PASS: Measurement History now in clinical module' if ok else '✗ FAIL: Measurement History NOT in clinical module')
"

echo
echo "=== Step 5: GET module=residents should NOT include Measurement History ==="
curl -sS -b /tmp/cookies-owner.txt "$BASE/api/org-custom-tabs?orgId=$ORG_ID&module=residents" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
print(f'Tabs in residents module: {len(tabs)}')
for t in tabs: print(f'  • {t[\"label\"]} (effectiveModule={t[\"effectiveModule\"]})')
ok = not any(t['label'] == 'Measurement History' for t in tabs)
print('✓ PASS: Measurement History no longer in residents module' if ok else '✗ FAIL: Measurement History still in residents module')
"

echo
echo "=== Step 6: Reset moduleOverride (PATCH moduleOverride=null) → back to residents ==="
curl -sS -b /tmp/cookies-owner.txt -X PATCH "$BASE/api/org-custom-tabs?id=$SELECTION_ID" \
  -H "Content-Type: application/json" \
  -d '{"moduleOverride":null}' > /dev/null

curl -sS -b /tmp/cookies-owner.txt "$BASE/api/org-custom-tabs?orgId=$ORG_ID&module=residents" | python3 -c "
import json, sys
tabs = json.load(sys.stdin)
ok = any(t['label'] == 'Measurement History' for t in tabs)
print('✓ PASS: Measurement History back in residents module after reset' if ok else '✗ FAIL: Measurement History NOT back in residents module')
"

echo
echo "=== Step 7: Verify MANAGER can also PATCH (was previously OWNER+DEV only) ==="
curl -sS -c /tmp/cookies-mgr.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@home.com","password":"manager123"}' > /dev/null

RESP=$(curl -sS -b /tmp/cookies-mgr.txt -X PATCH "$BASE/api/org-custom-tabs?id=$SELECTION_ID" \
  -H "Content-Type: application/json" \
  -d '{"moduleOverride":"staff"}' -w "\nHTTP %{http_code}")
CODE=$(echo "$RESP" | tail -1)
echo "Manager PATCH result: $CODE"
if echo "$CODE" | grep -q "200"; then
  echo "✓ PASS: Manager can override module"
  # Reset
  curl -sS -b /tmp/cookies-mgr.txt -X PATCH "$BASE/api/org-custom-tabs?id=$SELECTION_ID" \
    -H "Content-Type: application/json" -d '{"moduleOverride":null}' > /dev/null
else
  echo "✗ FAIL: Manager got $CODE — expected 200"
fi
