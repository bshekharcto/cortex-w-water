import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validId, validSite, pageParams } from './validation.js';

test('ids: plausible gateway/meter ids pass, junk and oversized values do not', () => {
  assert.equal(validId('506f9800000002a5'), '506f9800000002a5');
  assert.equal(validId('0025016559'), '0025016559');
  assert.equal(validId('a'.repeat(64)), 'a'.repeat(64));
  assert.equal(validId('a'.repeat(65)), null);
  assert.equal(validId("x'; DROP TABLE y;--"), null);
  assert.equal(validId('../etc/passwd'), null);
  assert.equal(validId(''), null);
  assert.equal(validId(undefined), null);
  assert.equal(validId(['a']), null);
});

test('site: ALL (also when omitted) or digits only', () => {
  assert.equal(validSite(undefined), 'ALL');
  assert.equal(validSite(''), 'ALL');
  assert.equal(validSite('ALL'), 'ALL');
  assert.equal(validSite('6394'), '6394');
  assert.equal(validSite('6394;drop'), null);
  assert.equal(validSite('abc'), null);
  assert.equal(validSite('1234567890123'), null);
});

test('paging: bounded and defaulted', () => {
  assert.deepEqual(pageParams({}, 100), { limit: 100, offset: 0 });
  assert.deepEqual(pageParams({ limit: '9999', offset: '-5' }, 100), { limit: 200, offset: 0 });
  assert.deepEqual(pageParams({ limit: '0', offset: '40' }, 20), { limit: 20, offset: 40 });
  assert.deepEqual(pageParams({ limit: 'abc', offset: 'x' }, 20), { limit: 20, offset: 0 });
});
