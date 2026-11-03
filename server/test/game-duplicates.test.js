const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const mongoose = require('mongoose')
const request = require('supertest')
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server')
const { createApp } = require('../app')
const { game } = require('../domain/validation')
const { gameIdentityKeys, resolveGameDuplicateKey } = require('../domain/game-identity')

let mongo, connection, app, models, store, accountNumber = 0
const send = (user, method, url, body) => user.agent[method](url).set('X-CSRF-Token', user.csrf).send(body)
async function account(targetApp = app) {
  const agent = request.agent(targetApp)
  const session = await agent.get('/api/auth/session').expect(200)
  const response = await agent.post('/api/auth/register').set('X-CSRF-Token', session.body.csrf).send({ name: 'Duplicate test', email: `duplicate-${++accountNumber}@example.com`, password: 'LongTestPassword123!' }).expect(201)
  return { agent, id: response.body.user._id, csrf: response.body.csrf }
}
async function add(user, value) { return (await send(user, 'post', '/api/games', value).expect(201)).body }
async function state(user) { return (await user.agent.get('/api/bootstrap').expect(200)).body }
function assertConflict(response, existing) {
  assert.equal(response.status, 409)
  assert.equal(response.body.code, 'DUPLICATE_GAME')
  assert.doesNotMatch(response.body.error, /hunt already exists/i)
  if (existing) {
    assert.equal(response.body.existingGameId, String(existing._id))
    assert.equal(response.body.existingGameTitle, existing.title)
  }
}
function barrier(count = 2) {
  let arrived = 0, release
  const gate = new Promise(resolve => { release = resolve })
  return async () => { if (++arrived >= count) release(); await gate }
}
function emptyBackup(games = []) {
  return { version: 1, platforms: [], games: games.map((value, i) => ({ _id: `source-${i}`, ...value })), copies: [], hardware: [], hunts: [], preferences: { theme: 'light' } }
}
async function insertLegacy(user, value, targetModels = models) {
  const entry = { ...game.parse(value), _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(user.id), __v: 0 }
  await targetModels.LibraryGame.collection.insertOne(entry)
  return entry
}

before(async () => {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '../../.runtime/mongodb')
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'gamelog-game-duplicates-tests' }).asPromise()
  const result = await createApp({ connection, secret: 'duplicate-tests-only-secret', env: { NODE_ENV: 'test' } })
  app = result.app; models = result.models; store = result.sessionStore
}, { timeout: 180000 })
after(async () => { if (store) await store.close(); if (connection) await connection.close(); if (mongo) await mongo.stop() })

test('creation blocks case/spacing and IGDB duplicates within one account and keeps keys private', async () => {
  const owner = await account(), other = await account()
  const first = await add(owner, { title: 'Pragmata', igdbId: 123 })
  for (const candidate of [{ title: '  PRAGMATA  ' }, { title: 'Different display name', igdbId: 123 }]) {
    assertConflict(await send(owner, 'post', '/api/games', candidate), first)
  }
  await add(owner, { title: 'Final  Fantasy VII' })
  assertConflict(await send(owner, 'post', '/api/games', { title: 'final\t fantasy   vii' }))
  await add(owner, { title: 'Pragmata: Deluxe' })
  await add(other, { title: 'Pragmata', igdbId: 123 })
  const patched = (await send(owner, 'patch', `/api/games/${first._id}`, { notes: 'Keep me' }).expect(200)).body
  const bootstrap = await state(owner), backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  for (const value of [first, patched, ...bootstrap.games, ...backup.games]) {
    assert.equal(value.normalizedTitleKey, undefined); assert.equal(value.igdbIdentity, undefined)
  }
  const stored = await models.LibraryGame.collection.findOne({ _id: new mongoose.Types.ObjectId(first._id) })
  assert.equal(stored.normalizedTitleKey, 'pragmata'); assert.equal(stored.igdbIdentity, 123)
})

test('identity edits block collisions, preserve self edits, and release removed IGDB identities', async () => {
  const owner = await account()
  const first = await add(owner, { title: 'Original', igdbId: 200 }), second = await add(owner, { title: 'Other', igdbId: 201 })
  assertConflict(await send(owner, 'patch', `/api/games/${second._id}`, { title: ' ORIGINAL ' }), first)
  assertConflict(await send(owner, 'patch', `/api/games/${second._id}`, { igdbId: 200 }), first)
  await send(owner, 'patch', `/api/games/${first._id}`, { title: 'ORIGINAL', notes: 'Still the same game' }).expect(200)
  await send(owner, 'patch', `/api/games/${first._id}`, { igdbId: null }).expect(200)
  const stored = await models.LibraryGame.collection.findOne({ _id: new mongoose.Types.ObjectId(first._id) })
  assert.equal(stored.igdbIdentity, undefined)
  await add(owner, { title: 'New identity owner', igdbId: 200 })
  assert.equal((await state(owner)).games.find(g => g._id === second._id).title, 'Other')
})

test('legacy duplicates remain unchanged and editable while new collisions and identity edits are blocked', async () => {
  const owner = await account()
  const first = await insertLegacy(owner, { title: 'Legacy duplicate', igdbId: 300 })
  const second = await insertLegacy(owner, { title: 'LEGACY  duplicate', igdbId: 300 })
  await send(owner, 'patch', `/api/games/${first._id}`, { notes: 'Saved notes', wishlist: true }).expect(200)
  await send(owner, 'patch', `/api/games/${second._id}`, { title: 'legacy duplicate', showOnBoard: true }).expect(200)
  assertConflict(await send(owner, 'post', '/api/games', { title: 'Legacy duplicate' }))
  assertConflict(await send(owner, 'post', '/api/games', { title: 'Renamed legacy game', igdbId: 300 }))
  assertConflict(await send(owner, 'patch', `/api/games/${first._id}`, { title: 'Rename only', igdbId: 300 }))
  for (const value of await models.LibraryGame.collection.find({ userId: first.userId }).toArray()) {
    assert.equal(value.normalizedTitleKey, undefined); assert.equal(value.igdbIdentity, undefined)
  }
  await send(owner, 'patch', `/api/games/${first._id}`, { title: 'Truly separate', igdbId: null }).expect(200)
  const changed = await models.LibraryGame.collection.findOne({ _id: first._id })
  assert.equal(changed.normalizedTitleKey, 'truly separate')
  assert.equal((await state(owner)).games.length, 2)
})

test('concurrent creates are protected by title and IGDB unique indexes', async t => {
  for (const candidates of [
    [{ title: 'Racing title' }, { title: 'RACING  title' }],
    [{ title: 'First name', igdbId: 400 }, { title: 'Second name', igdbId: 400 }],
  ]) {
    const owner = await account(), wait = barrier(), original = models.LibraryGame.create
    const mocked = t.mock.method(models.LibraryGame, 'create', async function (...args) { await wait(); return original.apply(this, args) })
    const results = await Promise.all(candidates.map(value => send(owner, 'post', '/api/games', value)))
    mocked.mock.restore()
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
    assertConflict(results.find(r => r.status === 409), results.find(r => r.status === 201).body)
    assert.equal((await state(owner)).games.length, 1)
  }
})

test('concurrent legacy identity edits acquire keys and cannot collide with each other', async t => {
  const owner = await account(), first = await insertLegacy(owner, { title: 'Old first' }), second = await insertLegacy(owner, { title: 'Old second' })
  const wait = barrier(), original = models.LibraryGame.prototype.save
  t.mock.method(models.LibraryGame.prototype, 'save', async function (...args) { await wait(); return original.apply(this, args) })
  const results = await Promise.all([first, second].map(value => send(owner, 'patch', `/api/games/${value._id}`, { title: 'One destination' })))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
  assertConflict(results.find(r => r.status === 409), results.find(r => r.status === 200).body)
  assert.equal((await state(owner)).games.filter(g => g.title === 'One destination').length, 1)
})

test('a legacy identity edit racing a new game cannot create duplicate identities', async t => {
  const owner = await account(), legacy = await insertLegacy(owner, { title: 'Legacy source' })
  const wait = barrier(), create = models.LibraryGame.create, save = models.LibraryGame.prototype.save
  t.mock.method(models.LibraryGame, 'create', async function (...args) { await wait(); return create.apply(this, args) })
  t.mock.method(models.LibraryGame.prototype, 'save', async function (...args) { if (!this.isNew) await wait(); return save.apply(this, args) })
  const results = await Promise.all([
    send(owner, 'post', '/api/games', { title: 'Shared destination' }),
    send(owner, 'patch', `/api/games/${legacy._id}`, { title: 'Shared destination' }),
  ])
  assert.equal(results.filter(r => r.status === 409).length, 1)
  assert.equal(results.filter(r => [200, 201].includes(r.status)).length, 1)
  assertConflict(results.find(r => r.status === 409), results.find(r => [200, 201].includes(r.status)).body)
  assert.equal((await state(owner)).games.filter(g => g.title === 'Shared destination').length, 1)
})

test('backup preview and import reject internal and existing-library duplicates before any changes', async () => {
  const owner = await account(), existing = await add(owner, { title: 'Already here', igdbId: 500 })
  const before = await state(owner)
  for (const backup of [
    emptyBackup([{ title: 'Duplicate within' }, { title: 'DUPLICATE  within' }]),
    emptyBackup([{ title: 'First backup name', igdbId: 501 }, { title: 'Second backup name', igdbId: 501 }]),
    emptyBackup([{ title: 'Already here' }]),
    emptyBackup([{ title: 'Another name', igdbId: 500 }]),
  ]) {
    for (const endpoint of ['preview', 'import']) assertConflict(await send(owner, 'post', `/api/backups/${endpoint}`, backup))
  }
  const after = await state(owner)
  assert.deepEqual(after.games, before.games); assert.deepEqual(after.user.preferences, before.user.preferences)
  const exported = (await owner.agent.get('/api/backups/export').expect(200)).body
  const destination = await account()
  await send(destination, 'post', '/api/backups/preview', exported).expect(200)
  await send(destination, 'post', '/api/backups/import', exported).expect(201)
  assertConflict(await send(destination, 'post', '/api/backups/import', exported))
  assertConflict(await send(owner, 'post', '/api/backups/preview', exported), existing)
})

test('import rechecks after preview and preserves collection, settings and preferences on conflict', async () => {
  const owner = await account(), backup = emptyBackup([{ title: 'Added after preview' }])
  backup.platforms = [{ _id: 'private-console', name: 'Imported console' }]
  backup.hardware = [{ _id: 'source-hardware', platformId: 'private-console', nickname: 'Imported hardware' }]
  backup.memberships = { timeZone: 'UTC', gamePass: { tier: 'game-pass-ultimate', activeUntil: null }, psPlus: { tier: 'none', activeUntil: null } }
  await send(owner, 'post', '/api/backups/preview', backup).expect(200)
  await add(owner, { title: 'Added after preview' })
  const before = await state(owner)
  assertConflict(await send(owner, 'post', '/api/backups/import', backup))
  assert.deepEqual(await state(owner), before)
})

test('a game inserted after import preflight aborts all import writes on the unique-index conflict', async t => {
  const owner = await account(), backup = emptyBackup([{ title: 'First imported game' }, { title: 'Concurrent import game' }])
  backup.platforms = [{ _id: 'private-console', name: 'Must roll back' }]
  const before = await state(owner), insertMany = models.LibraryGame.insertMany
  let inserted = false
  t.mock.method(models.LibraryGame, 'insertMany', async function (...args) {
    if (!inserted) {
      inserted = true
      const value = game.parse({ title: 'Concurrent import game' })
      await models.LibraryGame.collection.insertOne({ ...value, ...gameIdentityKeys(value), userId: new mongoose.Types.ObjectId(owner.id) })
    }
    return insertMany.apply(this, args)
  })
  const response = await send(owner, 'post', '/api/backups/import', backup)
  assertConflict(response)
  const after = await state(owner)
  assert.equal(after.games.length, 1); assert.equal(after.games[0].title, 'Concurrent import game')
  if (response.body.existingGameId) assertConflict(response, after.games[0])
  assert.deepEqual(after.platforms, before.platforms)
  assert.deepEqual(after.user.preferences, before.user.preferences)
})

test('duplicate-key recovery links only the current account and safely handles missing games or lookup errors', async t => {
  const owner = await account(), other = await account()
  const existing = await add(owner, { title: 'Account-scoped lookup' }), foreign = await add(other, { title: 'Account-scoped lookup' })
  const error = { code: 11000, keyValue: { userId: foreign.userId, normalizedTitleKey: 'account-scoped lookup' } }
  const resolved = await resolveGameDuplicateKey(models.LibraryGame, owner.id, error)
  assert.equal(resolved.existingGameId, existing._id)
  const missing = await resolveGameDuplicateKey(models.LibraryGame, owner.id, { code: 11000, keyValue: { normalizedTitleKey: 'absent game' } })
  assert.equal(missing.code, 'DUPLICATE_GAME'); assert.equal(missing.existingGameId, undefined)
  t.mock.method(models.LibraryGame, 'findOne', () => { throw new Error('Lookup unavailable') })
  const unavailable = await resolveGameDuplicateKey(models.LibraryGame, owner.id, error)
  assert.equal(unavailable.code, 'DUPLICATE_GAME'); assert.equal(unavailable.existingGameId, undefined)
})

test('standalone MongoDB starts with legacy duplicates and enforces new game identity indexes', async () => {
  let standalone, standaloneConnection, standaloneStore
  try {
    standalone = await MongoMemoryServer.create()
    standaloneConnection = await mongoose.createConnection(standalone.getUri(), { dbName: 'gamelog-duplicate-startup-tests' }).asPromise()
    const legacyOwnerId = new mongoose.Types.ObjectId()
    await standaloneConnection.collection('librarygames').insertMany([
      { userId: legacyOwnerId, title: 'Existing duplicate', igdbId: 600 },
      { userId: legacyOwnerId, title: 'Existing duplicate', igdbId: 600 },
    ])
    const result = await createApp({ connection: standaloneConnection, secret: 'standalone-duplicates-test-only', env: { NODE_ENV: 'test' } })
    standaloneStore = result.sessionStore
    assert.equal(await result.models.LibraryGame.countDocuments({ userId: legacyOwnerId }), 2)
    const owner = await account(result.app)
    await add(owner, { title: 'Standalone Pragmata', igdbId: 601 })
    assertConflict(await send(owner, 'post', '/api/games', { title: 'standalone  pragmata' }))
    const indexes = await result.models.LibraryGame.collection.indexes()
    assert.equal(indexes.filter(index => /^unique_game_/.test(index.name)).length, 2)
  } finally {
    if (standaloneStore) await standaloneStore.close()
    if (standaloneConnection) await standaloneConnection.close()
    if (standalone) await standalone.stop()
  }
})
