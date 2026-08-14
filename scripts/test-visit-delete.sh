#!/bin/bash
# End-to-end test of the visit deletion flow:
#   1. Login as nurse@home.com
#   2. Create a test visit (POST /api/data?type=visits)
#   3. Confirm it appears in GET /api/data?type=visits
#   4. Delete it (DELETE /api/data?type=visits&id=...)
#   5. Confirm it's gone from GET /api/data?type=visits
#   6. Verify a VISIT_DELETED audit entry was written

BASE=http://localhost:3000

echo "=== Step 1: Login as nurse@home.com ==="
curl -sS -c /tmp/cookies-nurse.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nurse@home.com","password":"nurse123"}' > /dev/null
echo "logged in"

# Use the linked staff's resident (Hannah Martin, C-0001)
RESIDENT_ID="cmr79t8j0001mre5t97a274hd"
FACILITY_ID="cmr7osxis0000reviu9fp9etu"

echo
echo "=== Step 2: Create a test visit ==="
CREATE_RESP=$(curl -sS -b /tmp/cookies-nurse.txt -X POST "$BASE/api/data?type=visits" \
  -H "Content-Type: application/json" \
  -d '{
    "residentId": "'"$RESIDENT_ID"'",
    "visitType": "DOCTOR",
    "scheduledAt": "2026-08-13T16:00:00+08:00",
    "status": "COMPLETED",
    "completedAt": "2026-08-13T16:30:00+08:00",
    "completedByName": "Dr. Test (Delete Me)",
    "chiefComplaint": "Test visit — will be deleted",
    "diagnosis": "Test diagnosis",
    "prescription": "Test prescription"
  }')
VISIT_ID=$(echo "$CREATE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
echo "Created visit ID: $VISIT_ID"

echo
echo "=== Step 3: Confirm it appears in the visits list ==="
COUNT_BEFORE=$(curl -sS -b /tmp/cookies-nurse.txt "$BASE/api/data?type=visits&facilityId=$FACILITY_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
found = [v for v in d if v.get('id') == '$VISIT_ID']
print(f'{len(found)} (\"{found[0]['chiefComplaint'] if found else 'not found'}\")')
")
echo "Matches for new visit ID: $COUNT_BEFORE"

echo
echo "=== Step 4: DELETE the visit ==="
DEL_RESP=$(curl -sS -b /tmp/cookies-nurse.txt -X DELETE "$BASE/api/data?type=visits&id=$VISIT_ID" -w "\nHTTP %{http_code}")
DEL_CODE=$(echo "$DEL_RESP" | tail -1)
DEL_BODY=$(echo "$DEL_RESP" | head -n -1)
echo "HTTP status: $DEL_CODE"
echo "Body: $DEL_BODY"

if echo "$DEL_CODE" | grep -q "200"; then
  echo "✓ PASS: visit deleted (HTTP 200)"
else
  echo "✗ FAIL: expected 200, got $DEL_CODE"
fi

echo
echo "=== Step 5: Confirm it's gone from the visits list ==="
COUNT_AFTER=$(curl -sS -b /tmp/cookies-nurse.txt "$BASE/api/data?type=visits&facilityId=$FACILITY_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
found = [v for v in d if v.get('id') == '$VISIT_ID']
print(len(found))
")
echo "Matches for deleted visit ID: $COUNT_AFTER (should be 0)"
if [ "$COUNT_AFTER" = "0" ]; then
  echo "✓ PASS: visit no longer in list"
else
  echo "✗ FAIL: visit still in list"
fi

echo
echo "=== Step 6: Verify VISIT_DELETED audit entry ==="
# Query the audit log directly via Prisma to confirm the entry
echo "(checking via Prisma — run scripts/verify-visit-delete-audit.cjs next)"

