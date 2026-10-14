import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllowedSiteIds, resolveSiteScope, SessionExpiredError } from './dashboardService.js';

// The upstream site list decides what a caller may see; fetch is stubbed so no network or database is touched.
const realFetch = globalThis.fetch;
function stubSites(status: number, body: unknown = []) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

// each test uses its own token: the allowed ids are cached per token
test('"ALL" means the caller\'s own sites, never the whole fleet', async () => {
  stubSites(200, [{ id: 7 }, { id: 3 }, { id: 5 }]);
  assert.deepEqual(await resolveSiteScope('ALL', 'Bearer token-all-sites'), [3, 5, 7]);
  assert.deepEqual(await resolveSiteScope(undefined, 'Bearer token-all-sites'), [3, 5, 7]);
});

test('a caller with no sites gets an empty scope (routes answer 403), also for "ALL"', async () => {
  stubSites(200, []);
  assert.deepEqual(await resolveSiteScope('ALL', 'Bearer token-no-sites'), []);
});

test('no Authorization header means no sites', async () => {
  assert.deepEqual(await resolveSiteScope('ALL', undefined), []);
});

test('401 from the site list is a session expiry; 403 only means no sites', async () => {
  stubSites(401);
  await assert.rejects(getAllowedSiteIds('Bearer token-expired'), SessionExpiredError);
  stubSites(403);
  assert.deepEqual([...(await getAllowedSiteIds('Bearer token-forbidden'))], []);
});

test('a failing site list never widens the scope', async () => {
  stubSites(500);
  assert.deepEqual(await resolveSiteScope('ALL', 'Bearer token-upstream-down'), []);
});
