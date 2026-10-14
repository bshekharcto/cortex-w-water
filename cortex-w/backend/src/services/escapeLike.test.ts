import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeLike } from './telemetryDbService.js';

test('escapeLike: LIKE wildcards and the escape character match as themselves', () => {
  assert.equal(escapeLike('ab'), 'ab');
  assert.equal(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
});
