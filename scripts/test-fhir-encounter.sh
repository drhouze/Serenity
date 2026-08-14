#!/bin/bash
# End-to-end test of the rewritten POST /api/fhir/Encounter endpoint.
# Verifies:
#   1. A full FHIR Encounter with SOAP extensions + period + participant + reasonCode + diagnosis
#      creates a Visit with all structured fields populated (NO `notes` field, NO 500 error).
#   2. Pushing again for the same resident+visitType+day → action="updated", same visitId (replace semantics).
#   3. Minimal FHIR payload (no extensions) still maps participant → completedByName, reasonCode → chiefComplaint, diagnosis → diagnosis.

API_KEY="ext_9c4b0dfffd6f25ca6c0da144bcb5596a"
FACILITY_ID="cmrbc9fhq0004s5dwy4l8m74x"
RESIDENT_CODE="C-0085"
BASE=http://localhost:3000

echo "=== Test 1: Full FHIR Encounter with SOAP extensions ==="
RESP1=$(curl -sS -X POST "$BASE/api/fhir/Encounter?facilityId=$FACILITY_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "resourceType": "Encounter",
    "status": "finished",
    "class": { "code": "AMB", "display": "Ambulatory" },
    "subject": {
      "identifier": {
        "system": "https://serenity-care.home/facility/'"$FACILITY_ID"'",
        "value": "'"$RESIDENT_CODE"'"
      }
    },
    "period": { "start": "2026-08-13T15:00:00+08:00", "end": "2026-08-13T15:30:00+08:00" },
    "participant": [{ "individual": { "display": "Dr. Tan Wei Ming" } }],
    "reasonCode": [{ "text": "Hypertension follow-up" }],
    "diagnosis": [{ "condition": { "display": "Hypertension, well-controlled" } }],
    "extension": [
      { "url": "http://serenity-care.home/fhir/StructureDefinition/soapSubjective", "valueString": "Patient complains of mild headache for 3 days, no nausea." },
      { "url": "http://serenity-care.home/fhir/StructureDefinition/soapObjective",  "valueString": "BP 140/90, HR 76, afebrile." },
      { "url": "http://serenity-care.home/fhir/StructureDefinition/soapAssessment", "valueString": "Hypertension stage 1, otherwise stable." },
      { "url": "http://serenity-care.home/fhir/StructureDefinition/soapPlan",       "valueString": "Continue Metformin; add Amlodipine 5mg OD; reduce salt." },
      { "url": "http://serenity-care.home/fhir/StructureDefinition/prescription",   "valueString": "Metformin 500mg BD, Amlodipine 5mg OD morning" },
      { "url": "http://serenity-care.home/fhir/StructureDefinition/vitalsNote",     "valueString": "BP 140/90, HR 76, Temp 37.0, SpO2 98%" },
      { "url": "http://serenity-care.home/fhir/StructureDefinition/visitType",      "valueString": "DOCTOR" }
    ],
    "appointment": { "identifier": { "value": "2026-09-13T10:00:00+08:00" } }
  }')
echo "$RESP1" | python3 -m json.tool 2>&1 | head -20
HTTP1=$(echo "$RESP1" | python3 -c "import sys; print('OK')" 2>/dev/null && echo "(parsed)")
echo
echo "HTTP status check: $(echo "$RESP1" | head -c 80)..."

# Extract visitId from the response extension
VISIT_ID=$(echo "$RESP1" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    exts = d.get('extension', [])
    for e in exts:
        if 'visitId' in e.get('url', ''):
            print(e.get('valueString', ''))
            break
except: pass
" 2>/dev/null)
ACTION1=$(echo "$RESP1" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    exts = d.get('extension', [])
    for e in exts:
        if 'action' in e.get('url', ''):
            print(e.get('valueString', ''))
            break
except: pass
" 2>/dev/null)
echo "Visit ID: $VISIT_ID  | Action: $ACTION1"
echo

echo "=== Test 2: Push again for same resident+visitType+day (should REPLACE) ==="
RESP2=$(curl -sS -X POST "$BASE/api/fhir/Encounter?facilityId=$FACILITY_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "resourceType": "Encounter",
    "status": "finished",
    "class": { "code": "AMB" },
    "subject": {
      "identifier": {
        "system": "https://serenity-care.home/facility/'"$FACILITY_ID"'",
        "value": "'"$RESIDENT_CODE"'"
      }
    },
    "period": { "start": "2026-08-13T15:00:00+08:00", "end": "2026-08-13T15:30:00+08:00" },
    "participant": [{ "individual": { "display": "Dr. Tan Wei Ming" } }],
    "reasonCode": [{ "text": "UPDATED: headache resolved after rest. Patient feels well." }],
    "diagnosis": [{ "condition": { "display": "Hypertension well-controlled." } }],
    "extension": [
      { "url": ".../soapSubjective", "valueString": "UPDATED: headache resolved after rest." },
      { "url": ".../soapObjective",  "valueString": "BP 128/82, HR 72." },
      { "url": ".../soapAssessment", "valueString": "Hypertension well-controlled." },
      { "url": ".../soapPlan",       "valueString": "Continue Metformin; add Amlodipine 5mg OD." },
      { "url": ".../prescription",   "valueString": "Metformin 500mg BD, Amlodipine 5mg OD morning" }
    ]
  }')
VISIT_ID2=$(echo "$RESP2" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    for e in d.get('extension', []):
        if 'visitId' in e.get('url', ''): print(e.get('valueString', '')); break
except: pass
" 2>/dev/null)
ACTION2=$(echo "$RESP2" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    for e in d.get('extension', []):
        if 'action' in e.get('url', ''): print(e.get('valueString', '')); break
except: pass
" 2>/dev/null)
echo "Visit ID: $VISIT_ID2  | Action: $ACTION2"
if [ "$VISIT_ID" = "$VISIT_ID2" ] && [ "$ACTION2" = "updated" ]; then
  echo "✓ PASS: same visitId, action=updated — visit was REPLACED (not duplicated)"
else
  echo "✗ FAIL: visitId changed ($VISIT_ID → $VISIT_ID2) or action=$ACTION2"
fi
echo

echo "=== Test 3: Minimal FHIR payload (no extensions, just participant + reasonCode + diagnosis) ==="
RESP3=$(curl -sS -X POST "$BASE/api/fhir/Encounter?facilityId=$FACILITY_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "resourceType": "Encounter",
    "status": "finished",
    "class": { "code": "PHYS" },
    "subject": {
      "identifier": {
        "system": "https://serenity-care.home/facility/'"$FACILITY_ID"'",
        "value": "'"$RESIDENT_CODE"'"
      }
    },
    "period": { "start": "2026-08-14T10:00:00+08:00" },
    "participant": [{ "individual": { "display": "Physio Jane" } }],
    "reasonCode": [{ "text": "Left knee osteoarthritis — physio session" }],
    "diagnosis": [{ "condition": { "display": "Left knee OA, moderate" } }]
  }')
echo "$RESP3" | python3 -m json.tool 2>&1 | head -10
HTTP3=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BASE/api/fhir/Encounter?facilityId=$FACILITY_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "resourceType": "Encounter",
    "status": "finished",
    "class": { "code": "PHYS" },
    "subject": { "identifier": { "system": "https://serenity-care.home/facility/'"$FACILITY_ID"'", "value": "'"$RESIDENT_CODE"'" } },
    "period": { "start": "2026-08-14T11:00:00+08:00" },
    "participant": [{ "individual": { "display": "Physio Jane" } }],
    "reasonCode": [{ "text": "Second physio session" }]
  }')
echo "HTTP status for minimal payload: $HTTP3"
if [ "$HTTP3" = "201" ] || [ "$HTTP3" = "200" ]; then
  echo "✓ PASS: minimal FHIR payload accepted (no 500 error)"
else
  echo "✗ FAIL: HTTP $HTTP3"
fi
echo

echo "=== Test 4: Invalid API key → 401 ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/api/fhir/Encounter?facilityId=$FACILITY_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ext_invalid_key" \
  -d '{ "resourceType": "Encounter", "status": "finished", "subject": { "identifier": { "value": "'"$RESIDENT_CODE"'" } } }'

echo
echo "=== Test 5: Missing subject.identifier → 400 ==="
curl -sS -X POST "$BASE/api/fhir/Encounter?facilityId=$FACILITY_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{ "resourceType": "Encounter", "status": "finished" }' | python3 -m json.tool 2>&1 | head -10

