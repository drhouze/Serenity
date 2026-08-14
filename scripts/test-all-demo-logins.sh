#!/bin/bash
BASE=http://localhost:3000
declare -a EMAILS=("owner@home.com" "manager@home.com" "nurse@home.com" "care@home.com" "reception@home.com" "doctor@home.com" "physio@home.com" "dietitian@home.com" "family@home.com")
declare -a PWS=("owner123" "manager123" "nurse123" "care123" "reception123" "doctor123" "physio123" "dietitian123" "family123")

echo "=== Demo login end-to-end test ==="
for i in "${!EMAILS[@]}"; do
  EMAIL="${EMAILS[$i]}"
  PW="${PWS[$i]}"
  RESP=$(curl -sS -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" -w "\n%{http_code}")
  CODE=$(echo "$RESP" | tail -1)
  if [ "$CODE" = "200" ]; then
    echo "  ✓ $EMAIL → HTTP 200 (login OK)"
  else
    ERR=$(echo "$RESP" | head -n -1 | python3 -c "import json,sys; print(json.load(sys.stdin).get('error','?'))" 2>/dev/null)
    echo "  ✗ $EMAIL → HTTP $CODE ($ERR)"
  fi
done
