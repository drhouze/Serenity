#!/bin/bash
API_KEY="ext_9c4b0dfffd6f25ca6c0da144bcb5596a"
FACILITY_ID="cmrbc9fhq0004s5dwy4l8m74x"
RESIDENT_CODE="C-0085"

echo "=== Test 1: SOAP-structured payload ==="
RESPONSE=$(curl -sS -X POST http://localhost:3000/api/external/visits \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "DOCTOR",
    "scheduledAt": "2026-08-13T10:30:00+08:00",
    "visitStart": "2026-08-13T10:30:00+08:00",
    "visitEnd":   "2026-08-13T11:00:00+08:00",
    "doctorName": "Dr. Tan Wei Ming",
    "soap": {
      "subjective": "Patient complains of mild headache for 3 days, no nausea, no vomiting. Sleeps well.",
      "objective":  "BP 140/90, HR 76, afebrile, no lower limb oedema, chest clear.",
      "assessment": "Hypertension stage 1, otherwise stable. No acute distress.",
      "plan":       "Continue Metformin 500mg BD; add Amlodipine 5mg OD morning; reduce dietary salt; home BP monitoring twice weekly."
    },
    "vitalsNote": "BP 140/90, HR 76, Temp 37.0, SpO2 98%",
    "prescription": "Metformin 500mg BD\nAmlodipine 5mg OD morning",
    "followUpDate": "2026-09-13T10:00:00+08:00"
  }')
echo "$RESPONSE" | head -200
echo

echo "=== Test 2: Simple flat payload ==="
RESPONSE2=$(curl -sS -X POST http://localhost:3000/api/external/visits \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "PHYSIO",
    "scheduledAt": "2026-08-12T14:00:00+08:00",
    "doctorName": "Physiotherapist Jane",
    "notes": "Patient attended physiotherapy session for left knee osteoarthritis. Tolerated exercises well.",
    "diagnosis": "Left knee osteoarthritis, moderate.",
    "prescription": "Continue NSAID gel PRN; quadriceps strengthening exercises 3x/week"
  }')
echo "$RESPONSE2" | head -200
echo

echo "=== Test 3: Invalid API key ==="
curl -sS -X POST http://localhost:3000/api/external/visits \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ext_invalid_key_here" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "DOCTOR",
    "scheduledAt": "2026-08-13T10:30:00+08:00"
  }'
echo

echo "=== Test 4: Missing required field ==="
curl -sS -X POST http://localhost:3000/api/external/visits \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "facilityId": "'"$FACILITY_ID"'",
    "externalResidentCode": "'"$RESIDENT_CODE"'",
    "visitType": "DOCTOR"
  }'
echo

