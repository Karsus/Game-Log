const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')
const path = require('node:path')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const { createApp } = require('../app')
const { createModels } = require('../domain/models')
const { STOREFRONTS, storefrontId, migrateStorefronts } = require('../domain/storefronts')
const { validateBackup } = require('../backup')

let mongo, connection, app, store, models, owner, game, legacyCopies
const createdAt = new Date('2026-01-02T03:04:05Z')
const send = (user, method, url, body) => user.agent[method](url).set('X-CSRF-Token', user.csrf).send(body)
async function account(email) {
  const agent = request.agent(app), session = await agent.get('/api/auth/session').expect(200)
  const result = await agent.post('/api/auth/register').set('X-CSRF-Token', session.body.csrf).send({ name: 'Store collector', email, password: 'LongTestPassword123!' }).expect(201)
  return { agent, csrf: result.body.csrf, id: result.body.user._id }
}

before(async () => {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '../../.runtime/mongodb')
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'storefront-tests' }).asPromise()
  models = createModels(connection)
  const legacyOwner = new mongoose.Types.ObjectId(), legacyGame = new mongoose.Types.ObjectId()
  legacyCopies = [
    { storefront: '  STEAM  ' }, { storefront: 'Xbox Marketplace' }, { storefront: 'GOG.com' },
    { storefront: 'Epic Games Store' }, { storefront: 'My local game shop' }, { storefront: 'Other' },
    {}, { storefront: 'gog', storefrontOther: '' },
  ].map(value => ({ _id: new mongoose.Types.ObjectId(), userId: legacyOwner, gameId: legacyGame, platformId: 'pc', format: 'digital', edition: 'Deluxe', acquiredOn: '2025-12-31', notes: 'Keep me', createdAt, updatedAt: createdAt, __v: 7, ...value }))
  await models.GameCopy.collection.insertMany(legacyCopies)
  const result = await createApp({ connection, secret: 'storefront-test-only-secret', env: { NODE_ENV: 'test' } })
  app = result.app; store = result.sessionStore
  owner = await account('storefronts@example.com')
  game = (await send(owner, 'post', '/api/games', { title: 'Storefront game' }).expect(201)).body
}, { timeout: 180000 })
after(async () => { if (store) await store.close(); if (connection) await connection.close(); if (mongo) await mongo.stop() })

test('catalog IDs and aliases resolve consistently without accepting arbitrary names', () => {
  for (const storefront of STOREFRONTS) for (const name of [storefront.id, storefront.label, ...storefront.aliases]) {
    assert.equal(storefrontId(`  ${name.toUpperCase()}  `), storefront.id)
  }
  assert.equal(storefrontId('Epic   Games Store'), 'epic-store')
  assert.equal(storefrontId(''), '')
  assert.equal(storefrontId('   '), '')
  assert.equal(storefrontId('Unlisted shop'), undefined)
  assert.equal(storefrontId(null), undefined)
})

test('startup migration normalizes legacy copies without losing custom names or copy details', async () => {
  const expected = [
    ['steam', ''], ['xbox-store', ''], ['gog', ''], ['epic-store', ''],
    ['other', 'My local game shop'], ['other', 'Other'], ['', ''], ['gog', ''],
  ]
  for (let index = 0; index < legacyCopies.length; index++) {
    const migrated = await models.GameCopy.findById(legacyCopies[index]._id).lean()
    assert.deepEqual([migrated.storefront, migrated.storefrontOther], expected[index])
    assert.equal(migrated.edition, 'Deluxe'); assert.equal(migrated.acquiredOn, '2025-12-31'); assert.equal(migrated.notes, 'Keep me')
    assert.equal(migrated.createdAt.toISOString(), createdAt.toISOString())
    assert.equal(migrated.updatedAt.toISOString(), createdAt.toISOString())
    assert.equal(migrated.__v, index === legacyCopies.length - 1 ? 7 : 8)
  }
  await migrateStorefronts(models)
  assert.deepEqual((await models.GameCopy.find({ _id: { $in: legacyCopies.map(copy => copy._id) } }).sort({ _id: 1 }).lean()).map(copy => copy.__v), [8, 8, 8, 8, 8, 8, 8, 7])
})

test('copy creation and edits persist stable IDs, validate Other, and clear stale custom names', async () => {
  const payload = { gameId: game._id, platformId: 'pc', format: 'digital' }
  const copy = (await send(owner, 'post', '/api/copies', { ...payload, storefront: '  Steam STORE ', storefrontOther: 'Stale shop' }).expect(201)).body
  assert.equal(copy.storefront, 'steam'); assert.equal(copy.storefrontOther, '')
  const epic = (await send(owner, 'patch', `/api/copies/${copy._id}`, { storefront: 'Epic Games Store' }).expect(200)).body
  assert.equal(epic.storefront, 'epic-store'); assert.equal(epic.gameId, game._id)
  for (const fields of [{ storefront: 'Unlisted store' }, { storefront: 'other' }, { storefront: 'other', storefrontOther: '   ' }, { storefront: 42 }]) {
    await send(owner, 'post', '/api/copies', { ...payload, ...fields }).expect(400)
    await send(owner, 'patch', `/api/copies/${copy._id}`, fields).expect(400)
  }
  const custom = (await send(owner, 'patch', `/api/copies/${copy._id}`, { storefront: 'other', storefrontOther: '  Local Games  ' }).expect(200)).body
  assert.equal(custom.storefrontOther, 'Local Games')
  const partial = (await send(owner, 'patch', `/api/copies/${copy._id}`, { notes: 'Preserve store' }).expect(200)).body
  assert.equal(partial.storefront, 'other'); assert.equal(partial.storefrontOther, 'Local Games')
  const changed = (await send(owner, 'patch', `/api/copies/${copy._id}`, { storefront: 'Xbox Store' }).expect(200)).body
  assert.equal(changed.storefront, 'xbox-store'); assert.equal(changed.storefrontOther, '')
  const blank = (await send(owner, 'patch', `/api/copies/${copy._id}`, { storefront: '' }).expect(200)).body
  assert.equal(blank.storefront, ''); assert.equal(blank.storefrontOther, '')
  const persisted = await models.GameCopy.findById(copy._id).lean()
  assert.equal(persisted.storefront, ''); assert.equal(persisted.notes, 'Preserve store')
})

test('Mongoose constrains stored storefront IDs and requires custom store names', async () => {
  const payload = { userId: owner.id, gameId: game._id, platformId: 'pc', format: 'digital' }
  await assert.rejects(models.GameCopy.create({ ...payload, storefront: 'Steam' }), /storefront/)
  await assert.rejects(models.GameCopy.create({ ...payload, storefront: 'other' }), /storefrontOther/)
})

test('older backups normalize aliases and preserve custom storefronts through import and export', async () => {
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  const template = backup.copies[0]
  backup.copies = ['STEAM', 'Xbox Store', 'GOG.com', 'Epic Games Store', 'Neighborhood shop', 'Other', ''].map(storefront => {
    const { storefrontOther, ...copy } = template
    return { ...copy, _id: String(new mongoose.Types.ObjectId()), storefront }
  })
  const parsed = validateBackup(backup)
  assert.deepEqual(parsed.copies.map(copy => copy.storefront), ['steam', 'xbox-store', 'gog', 'epic-store', 'other', 'other', ''])
  assert.equal(parsed.copies[4].storefrontOther, 'Neighborhood shop')
  assert.equal(parsed.copies[5].storefrontOther, 'Other')
  assert.equal(backup.copies[0].storefront, 'STEAM')
  assert.equal(backup.copies[0].storefrontOther, undefined)
  const destination = await account('storefront-import@example.com')
  await send(destination, 'post', '/api/backups/preview', backup).expect(200)
  await send(destination, 'post', '/api/backups/import', backup).expect(201)
  const exported = (await destination.agent.get('/api/backups/export').expect(200)).body
  assert.deepEqual(exported.copies.map(copy => [copy.storefront, copy.storefrontOther]), parsed.copies.map(copy => [copy.storefront, copy.storefrontOther]))
  assert.ok(exported.copies.every(copy => copy.gameId !== game._id))
  assert.deepEqual(validateBackup(exported).copies.map(copy => [copy.storefront, copy.storefrontOther]), parsed.copies.map(copy => [copy.storefront, copy.storefrontOther]))
  const invalid = structuredClone(backup)
  invalid.copies[0].storefront = 'other'; invalid.copies[0].storefrontOther = ''
  await send(destination, 'post', '/api/backups/preview', invalid).expect(400)
  await send(destination, 'post', '/api/backups/import', invalid).expect(400)
})
