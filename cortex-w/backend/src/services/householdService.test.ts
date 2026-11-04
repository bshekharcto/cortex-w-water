import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSortBy, sanitizeSearch, buildHouseholdQuery, lookupQuery, buildMeterPhotos, pickReplacement } from './householdService.js';

test('search text cannot add clauses to the beta filter language', () => {
  assert.equal(sanitizeSearch('a`b::c<d>'), 'a b c d');
  assert.equal(buildHouseholdQuery('x`::id<EQ:NU>1'), '`customId<CT:AN>x id EQ NU 1`');
  assert.ok(!buildHouseholdQuery('x`::y')!.slice(1, -1).includes('`'));
});

test('search kind: mobile, consumer id, name, nothing', () => {
  assert.equal(buildHouseholdQuery('9876543210'), '`mobile<CT:AN>9876543210`');
  assert.equal(buildHouseholdQuery('WS/BMC/2260881'), '`customId<CT:AN>WS/BMC/2260881`');
  assert.equal(buildHouseholdQuery('ram das'), '`name<CT:AN>RAM DAS`');
  assert.equal(buildHouseholdQuery('   '), undefined);
  assert.equal(buildHouseholdQuery(undefined), undefined);
});

test('sort: only known columns, direction defaults to ascending', () => {
  assert.equal(buildSortBy('name', 'desc'), 'name:DESC');
  assert.equal(buildSortBy('customId', undefined), 'customId:ASC');
  assert.equal(buildSortBy('name:ASC::id', 'asc'), undefined);
  assert.equal(buildSortBy(undefined, 'asc'), undefined);
});

test('lookup by numeric id or consumer id', () => {
  assert.equal(lookupQuery('42'), '`id<EQ:NU>42`');
  assert.equal(lookupQuery('WS/PRI/9'), '`customId<CT:AN>WS/PRI/9`');
});

test('photos: each url once, images before swap attachments, bad input ignored', () => {
  const p = buildMeterPhotos(
    [{ name: 'a', s3BucketURL: 'u1' }, { name: 'no url' }],
    [{ attachments: [{ name: 'b', s3BucketURL: 'u1' }, { name: 'c', s3BucketURL: 'u2', category: 'X' }] }]
  );
  assert.deepEqual(p.map((x) => [x.url, x.category]), [['u1', 'NEW_METER_DOCUMENT'], ['u2', 'X']]);
  assert.deepEqual(buildMeterPhotos(null, 'nope'), []);
});

test('replacement: only a real swap counts', () => {
  assert.equal(pickReplacement([{ oldImeiNumber: 'A', newImeiNumber: 'A' }]), null);
  assert.equal(pickReplacement(undefined), null);
  assert.equal(pickReplacement([{ oldImeiNumber: 'A', newImeiNumber: 'B', oldMeterReading: 5 }])?.oldMeterNumber, 'A');
});
