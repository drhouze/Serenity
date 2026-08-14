#!/bin/bash
# Test the new /api/profile/me/full endpoint by:
# 1. Login as a demo user (nurse@home.com)
# 2. Hit /api/profile/me/full with the session cookie
# 3. Verify the response shape

BASE=http://localhost:3000

echo "=== Step 1: Login as nurse@home.com ==="
LOGIN_RESPONSE=$(curl -sS -c /tmp/cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nurse@home.com","password":"nurse123"}')
echo "$LOGIN_RESPONSE" | head -3
echo

echo "=== Step 2: GET /api/profile/me/full ==="
PROFILE_RESPONSE=$(curl -sS -b /tmp/cookies.txt "$BASE/api/profile/me/full")
echo "$PROFILE_RESPONSE" | python3 -m json.tool 2>&1 | head -60

echo
echo "=== Step 3: Verify response shape ==="
echo "$PROFILE_RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
required = ['user', 'staff', 'leaveBalance', 'leaves', 'shifts', 'payrolls', 'attendances']
missing = [k for k in required if k not in d]
if missing:
    print(f'✗ FAIL: missing keys: {missing}')
    sys.exit(1)
print(f'✓ PASS: all 7 keys present')
print(f'  user.name        : {d[\"user\"][\"name\"]}')
print(f'  user.email       : {d[\"user\"][\"email\"]}')
print(f'  user.role        : {d[\"user\"][\"role\"]}')
print(f'  user.level       : {d[\"user\"][\"level\"]}')
print(f'  staff            : {\"linked\" if d[\"staff\"] else \"null (no linked staff)\"}')
if d['staff']:
    print(f'  staff.basicSalary      : {d[\"staff\"].get(\"basicSalary\")}')
    print(f'  staff.role             : {d[\"staff\"].get(\"role\")}')
    print(f'  staff.facility.name    : {d[\"staff\"].get(\"facility\",{}).get(\"name\")}')
print(f'  leaveBalance    : {d[\"leaveBalance\"]}')
print(f'  leaves count    : {len(d[\"leaves\"])}')
print(f'  shifts.upcoming : {len(d[\"shifts\"][\"upcoming\"])}')
print(f'  shifts.past     : {len(d[\"shifts\"][\"past\"])}')
print(f'  payrolls.pending: {len(d[\"payrolls\"][\"pending\"])}')
print(f'  payrolls.paid   : {len(d[\"payrolls\"][\"paid\"])}')
print(f'  attendances     : {len(d[\"attendances\"])}')
"
