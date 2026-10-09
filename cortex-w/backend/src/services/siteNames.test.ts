import test from 'node:test';
import assert from 'node:assert/strict';
import { tidySiteName } from './siteNames.js';

test('a name in capital letters is shown in title case', () => {
  assert.equal(tidySiteName('BHUBANESWAR'), 'Bhubaneswar');
  assert.equal(tidySiteName('SCS COLLEGE'), 'SCS College');
  assert.equal(tidySiteName('MAIN DMA ZONE'), 'Main DMA Zone');
  assert.equal(tidySiteName('OLD TOWN'), 'OLD Town'); // a word of up to 3 letters is taken for an acronym
  assert.equal(tidySiteName('PURI-NORTH'), 'Puri-North');
});

test('names that are already written normally, short names and names with digits are left as they are', () => {
  assert.equal(tidySiteName('Cuttack'), 'Cuttack');
  assert.equal(tidySiteName('Puri'), 'Puri');
  assert.equal(tidySiteName('DMA 1'), 'DMA 1');
  assert.equal(tidySiteName('DMA'), 'DMA');
  assert.equal(tidySiteName('ZONE 2'), 'ZONE 2');
  assert.equal(tidySiteName('Satyanagar (East)'), 'Satyanagar (East)');
  assert.equal(tidySiteName('  '), '');
});
