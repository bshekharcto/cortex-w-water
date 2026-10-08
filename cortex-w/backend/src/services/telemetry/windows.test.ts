import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWindow, windowRequestFromKey, referenceMs, dateKeyOf, localDayStartIso } from './windows.js';

const NOW = new Date('2026-10-06T10:30:00.000Z');

test('days: defaults to 7, ends now, starts at local (IST) midnight of the first day', () => {
  const w = resolveWindow({}, NOW);
  assert.equal(w.key, 'd7');
  assert.equal(w.fromDate, '2026-09-30');
  assert.equal(w.toDate, '2026-10-06');
  assert.equal(w.fromTs, '2026-09-29T18:30:00.000Z');
  assert.equal(w.toTs, NOW.toISOString());
  assert.equal(w.days, 7);
  assert.equal(w.subDay, false);
});

test('days: clamped to 1..90', () => {
  assert.equal(resolveWindow({ days: 0 }, NOW).key, 'd7'); // nothing asked for -> the 7-day default
  assert.equal(resolveWindow({ days: 0.4 }, NOW).key, 'd1'); // rounds down to 0, then raised to the 1-day minimum
  assert.equal(resolveWindow({ days: 500 }, NOW).key, 'd90');
  assert.equal(resolveWindow({ days: 1 }, NOW).days, 1);
});

test('hours: sub-day flag, exact start, capped at 168h', () => {
  const w = resolveWindow({ hours: 6 }, NOW);
  assert.equal(w.key, 'h6');
  assert.equal(w.fromTs, '2026-10-06T04:30:00.000Z');
  assert.equal(w.subDay, true);
  assert.equal(resolveWindow({ hours: 9999 }, NOW).key, 'h168');
});

test('hours crossing midnight touch two dates', () => {
  const w = resolveWindow({ hours: 24 }, NOW);
  assert.equal(w.fromDate, '2026-10-05');
  assert.equal(w.toDate, '2026-10-06');
  assert.equal(w.days, 2);
});

test('custom range: inclusive whole days', () => {
  const w = resolveWindow({ from: '2026-09-29', to: '2026-10-01' }, NOW);
  assert.equal(w.key, 'c_2026-09-29_2026-10-01');
  assert.equal(w.fromTs, '2026-09-28T18:30:00.000Z');
  assert.equal(w.toTs, '2026-10-01T18:29:59.999Z');
  assert.equal(w.days, 3);
});

test('custom range: rejects bad input with a clear message', () => {
  assert.throws(() => resolveWindow({ from: '2026-10-05', to: '2026-09-01' }, NOW), /Invalid custom date range/);
  assert.throws(() => resolveWindow({ from: 'nope', to: '2026-09-01' }, NOW), /Invalid custom date range/);
  assert.throws(() => resolveWindow({ from: '2026-01-01', to: '2026-10-05' }, NOW), /cannot exceed 90 days/);
  assert.doesNotThrow(() => resolveWindow({ from: '2026-07-09', to: '2026-10-05' }, NOW)); // exactly 89 days
});

test('cache keys never contain "now", so equal requests share a key', () => {
  const a = resolveWindow({ days: 7 }, new Date('2026-10-06T01:00:00Z'));
  const b = resolveWindow({ days: 7 }, new Date('2026-10-06T23:00:00Z'));
  assert.equal(a.key, b.key);
});

test('windowRequestFromKey is the inverse of the key', () => {
  for (const req of [{ hours: 1 }, { hours: 24 }, { days: 7 }, { days: 30 }, { from: '2026-09-29', to: '2026-10-01' }]) {
    const w = resolveWindow(req, NOW);
    assert.equal(resolveWindow(windowRequestFromKey(w), NOW).key, w.key);
  }
});

test('referenceMs: a past custom window is measured at its own end, a live one at now', () => {
  const past = resolveWindow({ from: '2026-09-01', to: '2026-09-02' }, NOW);
  assert.equal(referenceMs(past), Date.parse('2026-09-02T18:29:59.999Z'));
  const live = resolveWindow({ hours: 1 });
  assert.ok(Math.abs(referenceMs(live) - Date.now()) < 5000);
});

test('date bounds are local days: at 01:30 IST the window already reaches the new IST date', () => {
  const lateUtc = new Date('2026-10-06T20:00:00.000Z'); // 01:30 on 7 Oct in India
  const w = resolveWindow({ hours: 1 }, lateUtc);
  assert.equal(w.toDate, '2026-10-07'); // packets decoded now carry date_key 2026-10-07
  assert.equal(w.fromDate, '2026-10-07');
  assert.equal(resolveWindow({ days: 1 }, lateUtc).fromTs, '2026-10-06T18:30:00.000Z');
});

test('dateKeyOf and localDayStartIso agree', () => {
  assert.equal(dateKeyOf('2026-10-06T18:29:59.999Z'), '2026-10-06');
  assert.equal(dateKeyOf('2026-10-06T18:30:00.000Z'), '2026-10-07');
  assert.equal(localDayStartIso('2026-10-07'), '2026-10-06T18:30:00.000Z');
  assert.equal(localDayStartIso('2026-10-07', 'UTC'), '2026-10-07T00:00:00.000Z');
});

test('"Today" (days: 1) runs from local midnight to now, not the last 24 hours', () => {
  const w = resolveWindow({ days: 1 }, NOW); // 16:00 IST on 6 Oct
  assert.equal(w.fromTs, '2026-10-05T18:30:00.000Z'); // 00:00 IST on 6 Oct
  assert.equal(w.toTs, NOW.toISOString());
  assert.equal(w.fromDate, '2026-10-06');
  assert.equal(w.toDate, '2026-10-06');
  assert.equal(w.key, 'd1');
});
