#!/bin/bash
# Login as owner and update Nurse Linda Park's salary preset

BASE=http://localhost:3000

echo "=== Step 1: Login as owner@home.com ==="
curl -sS -c /tmp/cookies-owner.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@home.com","password":"owner123"}' > /dev/null
echo "logged in"

echo "=== Step 2: PATCH salary preset for STF-0001 (Linda Park) ==="
RESP=$(curl -sS -b /tmp/cookies-owner.txt -X PATCH "$BASE/api/data?type=staff&id=cmr79t8i40008re5tryjy5w1a" \
  -H "Content-Type: application/json" \
  -d '{
    "basicSalary": 2800.00,
    "defaultAllowances": 300.00,
    "defaultLoanDeduction": 100.00,
    "defaultZakat": 0,
    "employmentType": "REGULAR",
    "bankName": "Maybank",
    "bankAccount": "1234567890123",
    "epfNumber": "KWSP-12345678",
    "socsoNumber": "PERKESO-12345",
    "taxNumber": "SG12345678"
  }')
echo "$RESP" | head -3
echo

echo "=== Step 3: Re-login as nurse and verify salary shows up in profile ==="
curl -sS -c /tmp/cookies-nurse.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nurse@home.com","password":"nurse123"}' > /dev/null

PROFILE=$(curl -sS -b /tmp/cookies-nurse.txt "$BASE/api/profile/me/full")
echo "$PROFILE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
s = d.get('staff', {})
print('Staff salary preset:')
print('  basicSalary           :', s.get('basicSalary'))
print('  defaultAllowances     :', s.get('defaultAllowances'))
print('  defaultLoanDeduction  :', s.get('defaultLoanDeduction'))
print('  defaultZakat          :', s.get('defaultZakat'))
print('  employmentType        :', s.get('employmentType'))
print('  bankName              :', s.get('bankName'))
print('  bankAccount           :', s.get('bankAccount'))
print('  epfNumber             :', s.get('epfNumber'))
print('  socsoNumber           :', s.get('socsoNumber'))
print('  taxNumber             :', s.get('taxNumber'))
ok = (s.get('basicSalary') == 2800.0 and s.get('defaultAllowances') == 300.0 and s.get('bankName') == 'Maybank')
print()
print('✓ PASS: salary preset saved and reflected in profile' if ok else '✗ FAIL: salary preset not saved')
"
