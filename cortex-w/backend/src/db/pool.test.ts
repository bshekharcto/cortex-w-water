import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, retryTransient } from './pool.js';

const err = (code: string) => Object.assign(new Error(code), { code });

test('a transient network error is retried once and then succeeds', async () => {
  let calls = 0;
  const v = await retryTransient(async () => {
    calls++;
    if (calls === 1) throw err('ETIMEDOUT');
    return 'ok';
  });
  assert.equal(v, 'ok');
  assert.equal(calls, 2);
});

test('a real SQL error is never retried', async () => {
  let calls = 0;
  await assert.rejects(
    retryTransient(async () => {
      calls++;
      throw err('42601');
    }),
    /42601/
  );
  assert.equal(calls, 1);
});

test('a persistent outage is retried once, then reported', async () => {
  let calls = 0;
  await assert.rejects(
    retryTransient(async () => {
      calls++;
      throw err('ECONNRESET');
    }),
    /ECONNRESET/
  );
  assert.equal(calls, 2);
});

test('an idle-connection error on the pool is handled instead of crashing the process', () => {
  assert.ok(pool.listenerCount('error') >= 1);
  assert.doesNotThrow(() => pool.emit('error', new Error('server closed the connection')));
});
