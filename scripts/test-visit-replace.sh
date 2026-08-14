#!/bin/bash
API_KEY="ext_9c4b0dfffd6f25ca6c0da144bcb5596a"
FACILITY_ID="cmrbc9fhq0004s5dwy4l8m74x"
RESIDENT_CODE="C-0085"

echo "=== Step 1: Push INITIAL visit note ==="
RESPONSE1=$(curl -sS -X POST http://localhost:3000/api/external/visits \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "DOCTOR",
    "scheduledAt": "2026-08-13T15:00:00+08:00",
    "doctorName": "Dr. Tan Wei Ming",
    "soap": {
      "subjective": "Initial note: mild headache.",
      "objective":  "BP 140/90.",
      "assessment": "Hypertension stage 1.",
      "plan":       "Continue current meds."
    },
    "prescription": "Metformin 500mg BD"
  }')
echo "$RESPONSE1"
VISIT_ID=$(echo "$RESPONSE1" | python3 -c "import json,sys; print(json.load(sys.stdin).get('visitId',''))")
echo "Visit ID: $VISIT_ID"
echo

echo "=== Step 2: Push UPDATED visit note for same resident+type+day ==="
RESPONSE2=$(curl -sS -X POST http://localhost:3000/api/external/visits \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "DOCTOR",
    "scheduledAt": "2026-08-13T15:00:00+08:00",
    "doctorName": "Dr. Tan Wei Ming",
    "soap": {
      "subjective": "UPDATED: headache resolved after rest. Patient feels well today.",
      "objective":  "BP 128/82, HR 72, afebrile.",
      "assessment": "Hypertension well-controlled.",
      "plan":       "Continue Metformin; add Amlodipine 5mg OD; reduce salt."
    },
    "prescription": "Metformin 500mg BD, Amlodipine 5mg OD morning"
  }')
echo "$RESPONSE2"
VISIT_ID2=$(echo "$RESPONSE2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('visitId',''))")
echo "Updated Visit ID: $VISIT_ID2"
echo

echo "=== Step 3: Verify same visitId, action=updated ==="
if [ "$VISIT_ID" = "$VISIT_ID2" ]; then
  echo "✓ PASS: same visitId ($VISIT_ID) — visit was UPDATED, not duplicated"
else
  echo "✗ FAIL: visitId changed ($VISIT_ID → $VISIT_ID2) — new visit was created"
fi
echo

echo "=== Step 4: Push a visit for DIFFERENT day — should CREATE a new one ==="
RESPONSE3=$(curl -sS -X POST http://localhost:3000/api/external/visits \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "DOCTOR",
    "scheduledAt": "2026-08-14T10:00:00+08:00",
    "doctorName": "Dr. Tan Wei Ming",
    "soap": { "subjective": "Next-day follow-up.", "objective": "Stable.", "assessment": "Stable.", "plan": "Continue." }
  }')
echo "$RESPONSE3"
VISIT_ID3=$(echo "$RESPONSE3" | python3 -c "import json,sys; print(json.load(sys.stdin).get('visitId',''))")
ACTION3=$(echo "$RESPONSE3" | python3 -c "import json,sys; print(json.load(sys.stdin).get('action',''))")
if [ "$ACTION3" = "created" ] && [ "$VISIT_ID3" != "$VISIT_ID" ]; then
  echo "✓ PASS: different day → action=created, new visitId ($VISIT_ID3)"
else
  echo "✗ FAIL: action=$ACTION3 visitId=$VISIT_ID3"
fi

