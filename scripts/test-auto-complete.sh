#!/bin/bash
# End-to-end test: appointment in Serenity + doctor visit in doctor app → auto-complete.
APPT_ID=$(cat /tmp/test-appt-id.txt)
API_KEY="ext_9c4b0dfffd6f25ca6c0da144bcb5596a"
FACILITY_ID="cmrbc9fhq0004s5dwy4l8m74x"
RESIDENT_CODE="C-0085"
BASE=http://localhost:3000

echo "=== Step 2: Push visit note via /api/external/visits (15 min after appointment) ==="
# Build the visit time: today at 10:15 local time
VISIT_TIME=$(date -u -d "today 10:15" +%Y-%m-%dT%H:%M:%S+08:00 2>/dev/null || date -u -v+today +%Y-%m-%dT10:15:00+08:00)
echo "Doctor visit time: $VISIT_TIME"

RESP=$(curl -sS -X POST "$BASE/api/external/visits" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "DOCTOR",
    "scheduledAt": "'"$VISIT_TIME"'",
    "doctorName": "Dr. Tan Wei Ming",
    "soap": {
      "subjective": "Patient complains of mild headache.",
      "objective":  "BP 140/90, HR 76.",
      "assessment": "Hypertension stage 1.",
      "plan":       "Continue Metformin; reduce salt."
    },
    "prescription": "Metformin 500mg BD"
  }')
echo "Response:"
echo "$RESP" | python3 -m json.tool 2>&1 | head -15
echo

ACTION=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('action',''))")
VISIT_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('visitId',''))")
MATCHED_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('matchedVisitId',''))")

echo "=== Step 3: Verify auto-complete happened ==="
echo "  action:           $ACTION"
echo "  visitId:          $VISIT_ID"
echo "  matchedVisitId:   $MATCHED_ID"
echo "  appointment ID:   $APPT_ID"

if [ "$ACTION" = "appointment_completed" ] && [ "$VISIT_ID" = "$APPT_ID" ] && [ "$MATCHED_ID" = "$APPT_ID" ]; then
  echo "  ✓ PASS: appointment was auto-completed (visitId = original appointment ID)"
else
  echo "  ✗ FAIL: expected action=appointment_completed, visitId=matchedVisitId=$APPT_ID"
  echo "    got action=$ACTION visitId=$VISIT_ID matchedVisitId=$MATCHED_ID"
fi
