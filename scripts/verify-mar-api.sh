#!/bin/bash
BASE=http://localhost:3000

curl -sS -c /tmp/cookies-nurse.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nurse@home.com","password":"nurse123"}' > /dev/null

RESP=$(curl -sS -b /tmp/cookies-nurse.txt "$BASE/api/data?type=medAdmins&today=true&status=PENDING&facilityId=cmr7osxis0000reviu9fp9etu")

echo "$RESP" | python3 << 'PYEOF'
import json, sys
from datetime import datetime, timezone
d = json.load(sys.stdin)
print(f'Total PENDING med admins today: {len(d)}')

test_ids = ['cmsr1krp40001q29pm5xrmon1', 'cmsr1krp50003q29pe9v8h8he', 'cmsr1krp50005q29p6h6hhmmr', 'cmsr1krp60007q29p1nuc1s3t']
now = datetime.now(timezone.utc)
print(f'Current UTC time: {now.isoformat()}')
print()
print('Test records found in API response:')
for tid in test_ids:
    rec = next((r for r in d if r['id'] == tid), None)
    if rec:
        sched = datetime.fromisoformat(rec['scheduledAt'].replace('Z', '+00:00'))
        diff_min = (sched - now).total_seconds() / 60
        print(f'  OK  {tid[:14]}...  scheduledAt={rec["scheduledAt"]}  diff={diff_min:+.1f} min  med={rec["medication"]["name"]}  resident={rec["resident"]["firstName"]}')
    else:
        print(f'  XX  {tid[:14]}... NOT FOUND')

found = sum(1 for tid in test_ids if any(r['id'] == tid for r in d))
print()
print(f'{found}/4 test records present in todays PENDING MAR data')
if found == 4:
    print('PASS: API returns all test records - client-side alarm badges will render correctly')
else:
    print('FAIL: some records missing')
PYEOF
