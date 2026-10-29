const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMetadataService } = require('../metadata')
const credentials = { IGDB_CLIENT_ID: 'test-client', IGDB_CLIENT_SECRET: 'test-secret' }
test('IGDB prefill uses server credentials, normalizes platform releases, and caches results', async t => {
  const calls = []
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => url.includes('oauth2') ? { access_token: 'test-token', expires_in: 3600 } : [{ id: 100, name: 'Gladius', platforms: [{ id: 11, name: 'Xbox' }, { id: 21, name: 'GameCube' }], release_dates: [{ platform: 11, date: 1067299200 }, { platform: 11, date: 1067644800 }], cover: { image_id: 'cover-test' } }] }
  })
  const service = createMetadataService(credentials), results = await service.search('Gladius')
  assert.deepEqual(results[0].releases, [{ platformId: 'xbox', date: '2003-10-28' }, { platformId: 'gamecube', date: '' }])
  assert.equal(results[0].igdbId, 100)
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-token')
  assert.ok(!JSON.stringify(results).includes('test-secret'))
  assert.deepEqual(await service.search('Gladius'), results); assert.equal(calls.length, 2)
})
test('provider network failures become recoverable errors and do not poison the queue', async t => {
  t.mock.method(global, 'fetch', async () => { throw new TypeError('fetch failed') })
  const service = createMetadataService(credentials)
  await assert.rejects(service.search('First'), error => error.status === 502 && error.message.includes('manually'))
  await assert.rejects(service.search('Second'), error => error.status === 502)
})
test('provider authorization failures do not expose credentials', async t => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 401 }))
  await assert.rejects(createMetadataService(credentials).search('Gladius'), error => error.status === 502 && !error.message.includes('test-secret'))
})
