const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const path = require('node:path')
const { createApp } = require('../app')
const { migrateDifficulties } = require('../domain/difficulty')
const { validateBackup } = require('../backup')
const { membershipDefaults, SUBSCRIPTION_SERVICES } = require('../domain/memberships')
const { emptyNotebook, normalizeNotebook } = require('../domain/notebook')
let mongo, connection, app, store, models, alice, bob, game, hunt
async function account(email) {
  const agent = request.agent(app)
  const session = await agent.get('/api/auth/session').expect(200)
  const result = await agent.post('/api/auth/register').set('X-CSRF-Token', session.body.csrf).send({ name: 'Test collector', email, password: 'LongTestPassword123!' }).expect(201)
  return { agent, csrf: result.body.csrf, id: result.body.user._id }
}
const send = (user, method, url, body) => user.agent[method](url).set('X-CSRF-Token', user.csrf).send(body)
before(async () => {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '../../.runtime/mongodb')
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'gamelog-tests' }).asPromise()
  const result = await createApp({ connection, secret: 'test-only-secret-not-for-deployment', env: { NODE_ENV: 'test' } })
  app = result.app; store = result.sessionStore; models = result.models
  alice = await account('alice@example.com'); bob = await account('bob@example.com')
}, { timeout: 180000 })
after(async () => { if (store) await store.close(); if (connection) await connection.close(); if (mongo) await mongo.stop() })
test('authentication and CSRF are required; passwords are never returned', async () => {
  await request(app).get('/api/bootstrap').expect(401)
  await alice.agent.post('/api/games').send({ title: 'No token' }).expect(403)
  const state = await alice.agent.get('/api/bootstrap').expect(200)
  assert.equal(state.body.user.passwordHash, undefined)
  assert.ok(state.body.platforms.some(p => p._id === 'ps5'))
})
test('duplicate hardware units share a platform without overwriting each other', async () => {
  await send(alice, 'post', '/api/hardware', { platformId: 'ps5', nickname: 'Living room PS5', color: 'White' }).expect(201)
  await send(alice, 'post', '/api/hardware', { platformId: 'ps5', nickname: 'Bedroom PS5', color: 'Black' }).expect(201)
  const state = await alice.agent.get('/api/bootstrap')
  assert.equal(state.body.hardware.length, 2)
  assert.notEqual(state.body.hardware[0]._id, state.body.hardware[1]._id)
})
test('games support physical and digital copies on different platforms', async () => {
  game = (await send(alice, 'post', '/api/games', { title: 'Gladius', wishlistPlatforms: ['ps5'], showOnBoard: true }).expect(201)).body
  await send(alice, 'post', '/api/copies', { gameId: game._id, platformId: 'gamecube', format: 'physical' }).expect(201)
  await send(alice, 'post', '/api/copies', { gameId: game._id, platformId: 'xbox', format: 'digital' }).expect(201)
  const state = await alice.agent.get('/api/bootstrap'); assert.equal(state.body.copies.length, 2)
})
test('other users cannot read, change, delete, or reference private records', async () => {
  assert.equal((await bob.agent.get('/api/bootstrap')).body.games.length, 0)
  await send(bob, 'patch', `/api/games/${game._id}`, { title: 'Stolen' }).expect(404)
  await send(bob, 'delete', `/api/games/${game._id}`).expect(404)
  await send(bob, 'post', '/api/hunts', { gameId: game._id, platformId: 'ps5' }).expect(404)
  const platform = (await send(alice, 'post', '/api/platforms', { name: 'Private hardware' }).expect(201)).body
  await send(bob, 'post', '/api/hardware', { platformId: platform._id, nickname: 'Stolen platform' }).expect(400)
})
test('hunt estimates validate and partial edits preserve previously stored fields', async () => {
  await send(alice, 'post', '/api/hunts', { gameId: game._id, platformId: 'ps5', expectedDifficulty: 2.5 }).expect(400)
  await send(alice, 'post', '/api/hunts', { gameId: game._id, platformId: 'ps5', expectedDifficulty: 11 }).expect(400)
  await send(alice, 'post', '/api/hunts', { gameId: game._id, platformId: 'ps5', expectedHours: 0 }).expect(400)
  hunt = (await send(alice, 'post', '/api/hunts', { gameId: game._id, platformId: 'ps5', service: 'playstation', hasPlatinum: true, goal: 'platinum', expectedDifficulty: 4, expectedHours: 25.5, status: 'priority' }).expect(201)).body
  const updated = (await send(alice, 'patch', `/api/hunts/${hunt._id}`, { expectedHours: 30 }).expect(200)).body
  await send(alice, 'patch', `/api/hunts/${hunt._id}`, { expectedDifficulty: 4.5 }).expect(400)
  assert.equal(updated.expectedDifficulty, 4); assert.equal(updated.status, 'priority'); assert.equal(updated.goal, 'platinum')
  await send(alice, 'post', '/api/hunts', { gameId: game._id, platformId: 'ps5', service: 'playstation' }).expect(409)
  const second = (await send(alice, 'post', '/api/hunts', { gameId: game._id, platformId: 'ps4' }).expect(201)).body
  assert.equal(second.expectedDifficulty, null); assert.equal(second.expectedHours, null)
})
test('legacy decimal difficulties migrate once without changing progress or hunt creation dates', async () => {
  const id = new mongoose.Types.ObjectId(), createdAt = new Date('2026-01-01')
  await models.Hunt.collection.insertOne({ ...hunt, _id: id, userId: new mongoose.Types.ObjectId(alice.id), gameId: new mongoose.Types.ObjectId(game._id), variant: 'Legacy', expectedDifficulty: 2.5, expectedHours: 12.5, earned: 7, createdAt, __v: 0 })
  await models.Account.updateOne({ _id: alice.id }, { $set: { 'preferences.hunts': { difficulty: '2.5' } } })
  await migrateDifficulties(models)
  const migrated = await models.Hunt.findById(id).lean()
  assert.equal(migrated.expectedDifficulty, 3); assert.equal(migrated.expectedHours, 12.5); assert.equal(migrated.earned, 7)
  assert.equal(migrated.createdAt.toISOString(), createdAt.toISOString())
  assert.equal((await models.Account.findById(alice.id).lean()).preferences.hunts.difficulty, '3')
  await migrateDifficulties(models)
  assert.equal((await models.Hunt.findById(id).lean()).__v, 1)
  await models.Hunt.deleteOne({ _id: id })
})
test('older backups normalize difficulty and keep fractional hours unchanged', async () => {
  const backup = (await alice.agent.get('/api/backups/export')).body
  backup.hunts[0].expectedDifficulty = 2.5; backup.hunts[0].expectedHours = 12.5
  backup.preferences.hunts = { difficulty: '2.5' }
  const parsed = validateBackup(backup)
  assert.equal(parsed.hunts[0].expectedDifficulty, 3); assert.equal(parsed.hunts[0].expectedHours, 12.5)
  assert.equal(parsed.preferences.hunts.difficulty, '3'); assert.equal(backup.hunts[0].expectedDifficulty, 2.5)
  backup.hunts[0].expectedDifficulty = 10.4
  assert.throws(() => validateBackup(backup))
})
test('completion and status stay consistent without awarding DLC completion', async () => {
  const completed = (await send(alice, 'patch', `/api/hunts/${hunt._id}`, { completion: { platinum: true } }).expect(200)).body
  assert.equal(completed.status, 'completed'); assert.equal(completed.completion.all, false)
  const resumed = (await send(alice, 'patch', `/api/hunts/${hunt._id}`, { status: 'in-progress' }).expect(200)).body
  assert.equal(resumed.completion.platinum, false); assert.equal(resumed.completion.completedOn, '')
  const changed = (await send(alice, 'patch', `/api/hunts/${hunt._id}`, { hasPlatinum: false }).expect(200)).body
  assert.equal(changed.goal, 'base'); assert.equal(changed.completion.platinum, false)
})
test('notebooks validate hierarchy, isolate owners, and reject stale writes', async () => {
  const notebook = { revision: 0, sections: [{ id: 'chapter1', title: 'Chapter 1' }], items: [{ id: 'treasure', sectionId: 'chapter1', title: 'First treasure', done: true }] }
  await send(bob, 'put', `/api/hunts/${hunt._id}/notebook`, notebook).expect(404)
  const result = (await send(alice, 'put', `/api/hunts/${hunt._id}/notebook`, notebook).expect(200)).body
  assert.equal(result.notebook.revision, 1); assert.equal(result.status, 'in-progress')
  await send(alice, 'put', `/api/hunts/${hunt._id}/notebook`, notebook).expect(409)
  await send(alice, 'put', `/api/hunts/${hunt._id}/notebook`, { ...notebook, revision: 1, items: [{ ...notebook.items[0], parentId: 'treasure' }] }).expect(400)
})
test('copying a notebook resets only destination completion', async () => {
  const dest = (await send(alice, 'post', '/api/hunts', { gameId: game._id, platformId: 'pc', service: 'steam' }).expect(201)).body
  const copied = (await send(alice, 'post', `/api/hunts/${hunt._id}/copy-notebook`, { targetId: dest._id, revision: 0 }).expect(200)).body
  assert.equal(copied.notebook.items[0].done, false)
  const state = (await alice.agent.get('/api/bootstrap')).body
  assert.equal(state.hunts.find(h => h._id === hunt._id).notebook.items[0].done, true)
})
test('catalog and hunt defaults persist independently for each account', async () => {
  await send(alice, 'put', '/api/preferences', { theme: 'light', catalog: { platforms: ['gamecube'], sort: 'title' }, hunts: { platforms: ['ps5', 'ps4'], sort: 'status', direction: 'desc' } }).expect(200)
  const state = (await alice.agent.get('/api/bootstrap')).body
  assert.deepEqual(state.user.preferences.catalog.platforms, ['gamecube']); assert.equal(state.user.preferences.hunts.sort, 'status')
  assert.equal((await bob.agent.get('/api/bootstrap')).body.user.preferences.hunts, null)
})
test('metadata absence does not prevent manual collection entry', async () => {
  await alice.agent.get('/api/metadata/games?q=Gladius').expect(503)
  await send(alice, 'post', '/api/games', { title: 'Manual entry' }).expect(201)
})
test('starting a hunt atomically enables the board without changing creation time', async () => {
  const entry = (await send(alice, 'post', '/api/games', { title: 'Visibility test' }).expect(201)).body
  const active = (await send(alice, 'post', '/api/hunts', { gameId: entry._id, platformId: 'ps5', enableBoard: true }).expect(201)).body
  assert.equal((await alice.agent.get('/api/bootstrap')).body.games.find(g => g._id === entry._id).showOnBoard, true)
  await send(alice, 'patch', `/api/games/${entry._id}`, { showOnBoard: false }).expect(200)
  await send(alice, 'post', '/api/hunts', { gameId: entry._id, platformId: 'ps5', enableBoard: true }).expect(409)
  assert.equal((await alice.agent.get('/api/bootstrap')).body.games.find(g => g._id === entry._id).showOnBoard, false)
  const updated = (await send(alice, 'patch', `/api/hunts/${active._id}`, { enableBoard: true }).expect(200)).body
  assert.equal(updated.createdAt, active.createdAt)
  await send(alice, 'delete', `/api/games/${entry._id}`).expect(200)
})
test('changing a password revokes other sessions and refreshes the current session', async () => {
  const owner = await account('security@example.com'), other = request.agent(app)
  const token = (await other.get('/api/auth/session')).body.csrf
  await other.post('/api/auth/login').set('X-CSRF-Token', token).send({ email: 'security@example.com', password: 'LongTestPassword123!' }).expect(200)
  const result = await send(owner, 'post', '/api/auth/password', { currentPassword: 'LongTestPassword123!', password: 'ReplacementPassword123!' }).expect(200)
  assert.notEqual(result.body.csrf, owner.csrf)
  await owner.agent.get('/api/bootstrap').expect(200)
  await other.get('/api/bootstrap').expect(401)
})
test('backup preview rejects broken references and import remaps ownership atomically', async () => {
  const backup = (await alice.agent.get('/api/backups/export').expect(200)).body
  assert.equal(backup.games[0].userId, undefined)
  await send(bob, 'post', '/api/backups/preview', { ...backup, copies: [{ ...backup.copies[0], gameId: '0'.repeat(24) }] }).expect(400)
  await send(bob, 'post', '/api/backups/preview', backup).expect(200)
  await send(bob, 'post', '/api/backups/import', backup).expect(201)
  const state = (await bob.agent.get('/api/bootstrap')).body
  assert.equal(state.games.length, backup.games.length); assert.equal(state.hunts.length, backup.hunts.length)
  assert.ok(state.games.every(g => g.userId === bob.id)); assert.ok(state.hunts.every(h => state.games.some(g => g._id === h.gameId)))
})
test('deleting a game cascades only its owned copies and hunts', async () => {
  await send(alice, 'delete', `/api/games/${game._id}`).expect(200)
  const state = (await alice.agent.get('/api/bootstrap')).body
  assert.equal(state.hunts.length, 0); assert.equal(state.copies.length, 0); assert.equal(state.hardware.length, 2)
  assert.ok((await bob.agent.get('/api/bootstrap')).body.hunts.length > 0)
})

test('subscription access persists independently of owned copies and trophy progress', async () => {
  const owner = await account('subscriptions@example.com')
  const subscriptions = SUBSCRIPTION_SERVICES.map(service => ({ service }))
  const entry = (await send(owner, 'post', '/api/games', { title: 'Subscription game', subscriptions }).expect(201)).body
  assert.deepEqual(entry.subscriptions, subscriptions)
  const progress = (await send(owner, 'post', '/api/hunts', { gameId: entry._id, platformId: 'ps5', service: 'playstation', earned: 5, total: 20 }).expect(201)).body
  let state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.games[0].subscriptions, subscriptions)
  assert.equal(state.copies.length, 0)
  const copy = (await send(owner, 'post', '/api/copies', { gameId: entry._id, platformId: 'ps5', format: 'physical' }).expect(201)).body
  const edited = (await send(owner, 'patch', `/api/games/${entry._id}`, { notes: 'Keep access' }).expect(200)).body
  assert.deepEqual(edited.subscriptions, subscriptions)
  await send(owner, 'patch', `/api/games/${entry._id}`, { subscriptions: [{ service: 'game-pass' }] }).expect(200)
  await send(owner, 'patch', `/api/games/${entry._id}`, { subscriptions: [] }).expect(200)
  state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.games[0].subscriptions, [])
  assert.equal(state.copies.length, 1); assert.equal(state.copies[0]._id, copy._id); assert.equal(state.copies[0].state, 'owned')
  assert.equal(state.hunts[0]._id, progress._id); assert.equal(state.hunts[0].earned, 5)
})

test('subscription validation rejects unsupported services, duplicates, and changes by other accounts', async () => {
  const owner = await account('subscription-validation@example.com')
  const entry = (await send(owner, 'post', '/api/games', { title: 'Legacy-compatible game' }).expect(201)).body
  assert.deepEqual(entry.subscriptions, [])
  const valid = { service: 'ps-plus-basic' }
  for (const subscriptions of [
    [{ service: 'unsupported' }],
    [{ service: 'ps-plus' }],
    [valid, valid],
    [{}],
  ]) {
    await send(owner, 'post', '/api/games', { title: 'Invalid subscription', subscriptions }).expect(400)
    await send(owner, 'patch', `/api/games/${entry._id}`, { subscriptions }).expect(400)
  }
  await send(bob, 'patch', `/api/games/${entry._id}`, { subscriptions: [valid] }).expect(404)
  const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.equal(state.games.length, 1); assert.deepEqual(state.games[0].subscriptions, [])
})

test('subscription backups preserve game-level services and accept older records', async () => {
  const owner = await account('subscription-backup@example.com'), destination = await account('subscription-import@example.com')
  const subscriptions = [{ service: 'game-pass' }, { service: 'ps-plus-premium' }]
  await send(owner, 'post', '/api/games', { title: 'Backup subscription', subscriptions }).expect(201)
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  assert.deepEqual(backup.games[0].subscriptions, subscriptions)
  const legacy = structuredClone(backup)
  delete legacy.games[0].subscriptions
  assert.deepEqual(validateBackup(legacy).games[0].subscriptions, [])
  await send(destination, 'post', '/api/backups/preview', legacy).expect(200)
  for (const invalid of [
    [{}],
    [subscriptions[0], subscriptions[0]],
    [{ service: 'invalid' }],
  ]) {
    const broken = structuredClone(backup)
    broken.games[0].subscriptions = invalid
    await send(destination, 'post', '/api/backups/preview', broken).expect(400)
    await send(destination, 'post', '/api/backups/import', broken).expect(400)
  }
  await send(destination, 'post', '/api/backups/import', backup).expect(201)
  const state = (await destination.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.games[0].subscriptions, subscriptions)
  assert.equal(state.copies.length, 0)
  await send(destination, 'post', '/api/backups/import', legacy).expect(409)
  assert.equal((await destination.agent.get('/api/bootstrap').expect(200)).body.games.length, 1)
  const legacyDestination = await account('legacy-subscription-import@example.com')
  await send(legacyDestination, 'post', '/api/backups/import', legacy).expect(201)
  const legacyState = (await legacyDestination.agent.get('/api/bootstrap').expect(200)).body
  assert.equal(legacyState.games.length, 1)
  assert.deepEqual(legacyState.games[0].subscriptions, [])
})

test('subscription filters save and restore for library and hunts', async () => {
  const owner = await account('subscription-filters@example.com')
  for (const ownership of ['subscription', 'ps-plus', ...SUBSCRIPTION_SERVICES]) {
    await send(owner, 'put', '/api/preferences', { catalog: { ownership }, hunts: { ownership } }).expect(200)
    const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
    assert.equal(state.user.preferences.catalog.ownership, ownership)
    assert.equal(state.user.preferences.hunts.ownership, ownership)
  }
})

test('legacy accounts expose inactive memberships without changing stored data', async () => {
  const owner = await account('legacy-memberships@example.com')
  await models.Account.collection.updateOne({ _id: new mongoose.Types.ObjectId(owner.id) }, { $unset: { memberships: '' } })
  const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.user.memberships, membershipDefaults())
  assert.deepEqual((await owner.agent.get('/api/auth/session').expect(200)).body.user.memberships, membershipDefaults())
  assert.deepEqual((await owner.agent.get('/api/backups/export').expect(200)).body.memberships, membershipDefaults())
  assert.equal((await models.Account.collection.findOne({ _id: new mongoose.Types.ObjectId(owner.id) })).memberships, undefined)
})

test('memberships require authentication and CSRF and update only the session account', async () => {
  const owner = await account('membership-owner@example.com'), other = await account('membership-other@example.com')
  const value = { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-ultimate', activeUntil: '2028-02-29' }, psPlus: { tier: 'ps-plus-premium', activeUntil: null } }
  const anonymous = request.agent(app), token = (await anonymous.get('/api/auth/session').expect(200)).body.csrf
  await anonymous.put('/api/memberships').set('X-CSRF-Token', token).send(value).expect(401)
  await owner.agent.put('/api/memberships').send(value).expect(403)
  await send(owner, 'put', '/api/memberships', { ...value, userId: other.id }).expect(400)
  const saved = (await send(owner, 'put', '/api/memberships', value).expect(200)).body
  assert.equal(saved._id, owner.id); assert.equal(saved.passwordHash, undefined)
  assert.deepEqual(saved.memberships, value)
  assert.deepEqual((await owner.agent.get('/api/bootstrap').expect(200)).body.user.memberships, value)
  assert.deepEqual((await other.agent.get('/api/bootstrap').expect(200)).body.user.memberships, membershipDefaults())
  await send(owner, 'put', '/api/preferences', { theme: 'light', catalog: { ownership: 'game-pass-pc' } }).expect(200)
  assert.deepEqual((await owner.agent.get('/api/bootstrap').expect(200)).body.user.memberships, value)
  const inactive = { ...membershipDefaults(), timeZone: 'UTC' }
  await send(owner, 'put', '/api/memberships', inactive).expect(200)
  const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.user.memberships, inactive)
  assert.equal(state.user.preferences.theme, 'light'); assert.equal(state.user.preferences.catalog.ownership, 'game-pass-pc')
})

test('membership changes preserve game tags, copies, hunt progress, and notebooks', async () => {
  const owner = await account('membership-history@example.com')
  const entry = (await send(owner, 'post', '/api/games', { title: 'Keep my history', subscriptions: SUBSCRIPTION_SERVICES.map(service => ({ service })) }).expect(201)).body
  await send(owner, 'post', '/api/copies', { gameId: entry._id, platformId: 'ps5', format: 'physical' }).expect(201)
  const progress = (await send(owner, 'post', '/api/hunts', { gameId: entry._id, platformId: 'ps5', service: 'playstation', earned: 7, total: 20, status: 'in-progress' }).expect(201)).body
  await send(owner, 'put', `/api/hunts/${progress._id}/notebook`, { revision: 0, sections: [{ id: 'general', title: 'General' }], items: [{ id: 'keep', sectionId: 'general', title: 'Keep my checked item', done: true }] }).expect(200)
  const before = (await owner.agent.get('/api/bootstrap').expect(200)).body
  for (const value of [
    { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-ultimate', activeUntil: null }, psPlus: { tier: 'ps-plus-premium', activeUntil: '2026-11-01' } },
    { ...membershipDefaults(), timeZone: 'America/Mexico_City' },
    { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-pc', activeUntil: '2026-12-01' }, psPlus: { tier: 'ps-plus-basic', activeUntil: null } },
  ]) await send(owner, 'put', '/api/memberships', value).expect(200)
  const after = (await owner.agent.get('/api/bootstrap').expect(200)).body
  for (const key of ['games', 'copies', 'hunts']) assert.deepEqual(after[key], before[key])
})

test('membership validation checks real calendar dates, provider tiers, and IANA time zones', async () => {
  const owner = await account('membership-validation@example.com')
  const value = { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-premium', activeUntil: null }, psPlus: { tier: 'ps-plus-extra', activeUntil: null } }
  for (const invalidDate of ['2026-02-29', '2100-02-29', '2028-02-30', '2026-04-31', '2026-00-10', '2026-13-10', '2026-01-00', '2026-1-01', '2026-11-01T00:00:00Z', '']) {
    await send(owner, 'put', '/api/memberships', { ...value, gamePass: { ...value.gamePass, activeUntil: invalidDate } }).expect(400)
  }
  for (const invalidZone of [null, '', 'Not/A_Zone', '+06:00', 123]) await send(owner, 'put', '/api/memberships', { ...value, timeZone: invalidZone }).expect(400)
  await send(owner, 'put', '/api/memberships', { ...value, gamePass: { tier: 'ps-plus-basic', activeUntil: null } }).expect(400)
  await send(owner, 'put', '/api/memberships', { ...value, psPlus: { tier: 'game-pass', activeUntil: null } }).expect(400)
  await send(owner, 'put', '/api/memberships', { timeZone: 'UTC' }).expect(400)
  assert.deepEqual((await owner.agent.get('/api/bootstrap').expect(200)).body.user.memberships, membershipDefaults())
  for (const activeUntil of ['2000-02-29', '2028-02-29', '2026-04-30', null]) {
    const valid = { ...value, gamePass: { ...value.gamePass, activeUntil }, psPlus: { ...value.psPlus, activeUntil } }
    assert.deepEqual((await send(owner, 'put', '/api/memberships', valid).expect(200)).body.memberships, valid)
  }
})

test('backup membership previews distinguish explicit restoration from older backups', async () => {
  const owner = await account('membership-backup@example.com'), destination = await account('membership-restore@example.com')
  const original = { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-essential', activeUntil: '2028-02-29' }, psPlus: { tier: 'ps-plus-basic', activeUntil: null } }
  const current = { timeZone: 'Europe/London', gamePass: { tier: 'game-pass-ultimate', activeUntil: null }, psPlus: { tier: 'ps-plus-extra', activeUntil: '2027-01-01' } }
  await send(owner, 'put', '/api/memberships', original).expect(200)
  await send(destination, 'put', '/api/memberships', current).expect(200)
  await send(owner, 'post', '/api/games', { title: 'Preserved backup tags', subscriptions: [{ service: 'game-pass-pc' }, { service: 'ps-plus-basic' }] }).expect(201)
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  assert.deepEqual(backup.memberships, original)
  const legacy = structuredClone(backup); delete legacy.memberships
  const legacyDestination = await account('membership-legacy-restore@example.com')
  await send(legacyDestination, 'put', '/api/memberships', current).expect(200)
  assert.equal(validateBackup(legacy).memberships, undefined)
  const oldPreview = (await send(legacyDestination, 'post', '/api/backups/preview', legacy).expect(200)).body
  assert.equal(oldPreview.restoresMemberships, false); assert.equal(oldPreview.memberships, undefined)
  await send(legacyDestination, 'post', '/api/backups/import', legacy).expect(201)
  assert.deepEqual((await legacyDestination.agent.get('/api/bootstrap').expect(200)).body.user.memberships, current)
  const preview = (await send(destination, 'post', '/api/backups/preview', backup).expect(200)).body
  assert.equal(preview.restoresMemberships, true); assert.deepEqual(preview.memberships, original)
  assert.deepEqual((await destination.agent.get('/api/bootstrap').expect(200)).body.user.memberships, current)
  await send(destination, 'post', '/api/backups/import', backup).expect(201)
  const restored = (await destination.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(restored.user.memberships, original)
  assert.ok(restored.games.every(g => JSON.stringify(g.subscriptions) === JSON.stringify(backup.games[0].subscriptions)))
  assert.deepEqual((await owner.agent.get('/api/bootstrap').expect(200)).body.user.memberships, original)
  const inactiveBackup = { ...backup, games: [], memberships: membershipDefaults() }
  await send(destination, 'post', '/api/backups/import', inactiveBackup).expect(201)
  assert.deepEqual((await destination.agent.get('/api/bootstrap').expect(200)).body.user.memberships, membershipDefaults())
  for (const invalid of [null, { ...original, timeZone: 'Invalid/Zone' }, { ...original, psPlus: { tier: 'ps-plus-extra', activeUntil: '2026-02-29' } }]) {
    await send(destination, 'post', '/api/backups/preview', { ...backup, memberships: invalid }).expect(400)
    await send(destination, 'post', '/api/backups/import', { ...backup, memberships: invalid }).expect(400)
  }
  assert.deepEqual((await destination.agent.get('/api/bootstrap').expect(200)).body.user.memberships, membershipDefaults())
})

test('backup memberships require a saved time zone when tiers or expiry dates are present', async () => {
  const owner = await account('membership-backup-timezone@example.com')
  const current = { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-ultimate', activeUntil: '2027-01-01' }, psPlus: { tier: 'none', activeUntil: null } }
  await send(owner, 'put', '/api/memberships', current).expect(200)
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  backup.games = [{ _id: new mongoose.Types.ObjectId().toString(), title: 'Do not import invalid membership snapshot' }]
  for (const provider of ['gamePass', 'psPlus']) {
    for (const membership of [{ tier: provider === 'gamePass' ? 'game-pass-ultimate' : 'ps-plus-premium', activeUntil: null }, { tier: 'none', activeUntil: '2027-01-01' }]) {
      for (const omitTimeZone of [false, true]) {
        const settings = { ...membershipDefaults(), [provider]: membership }
        if (omitTimeZone) delete settings.timeZone
        const invalid = { ...backup, memberships: settings }
        await send(owner, 'post', '/api/backups/preview', invalid).expect(400)
        await send(owner, 'post', '/api/backups/import', invalid).expect(400)
      }
    }
  }
  const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.user.memberships, current)
  assert.equal(state.games.length, 0)
  assert.deepEqual(validateBackup({ ...backup, memberships: membershipDefaults() }).memberships, membershipDefaults())
  const legacy = { ...backup }; delete legacy.memberships
  assert.equal(validateBackup(legacy).memberships, undefined)
})

test('failed backup membership restoration rolls back imported collection records', async () => {
  const owner = await account('membership-atomic@example.com')
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  backup.games = [{ _id: new mongoose.Types.ObjectId().toString(), title: 'Should roll back', subscriptions: [{ service: 'game-pass-ultimate' }] }]
  backup.memberships = { timeZone: 'UTC', gamePass: { tier: 'game-pass-ultimate', activeUntil: null }, psPlus: { tier: 'none', activeUntil: null } }
  const updateOne = models.Account.updateOne
  models.Account.updateOne = function (filter, update, options) {
    if (String(filter._id) === owner.id && update.$set.memberships) throw new Error('Simulated membership write failure')
    return updateOne.call(this, filter, update, options)
  }
  try { await send(owner, 'post', '/api/backups/import', backup).expect(500) }
  finally { models.Account.updateOne = updateOne }
  const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.equal(state.games.length, 0)
  assert.deepEqual(state.user.memberships, membershipDefaults())
})

const linkedNotebook = () => ({
  formatVersion: 2, revision: 0,
  trophies: [{ id: 'flowers', title: 'Find the flowers', description: 'Collect every flower.\nFinish before leaving the garden.', done: true }, { id: 'gifts', title: 'Find the gifts', done: false }],
  sections: [{ id: 'chapter1', title: 'Chapter 1' }, { id: 'route', title: 'Collectibles route' }],
  items: [
    { id: 'parent', trophyId: 'flowers', title: 'Search the garden', sectionIds: ['chapter1'], mainSectionId: 'chapter1' },
    { id: 'flower', trophyId: 'flowers', parentId: 'parent', title: 'Blue flower', sectionIds: ['route'], mainSectionId: 'chapter1', done: false, notes: 'Behind the fountain', url: 'https://example.com/guide', missable: true },
    { id: 'counter', trophyId: 'flowers', parentId: 'parent', title: 'Garden seeds', mainSectionId: 'chapter1', type: 'counter', target: 3, current: 2 },
    { id: 'gift', trophyId: 'gifts', title: 'Wrapped gift', done: true },
  ],
})
const trackableTrophyNotebook = () => {
  const value = linkedNotebook()
  Object.assign(value.trophies[0], { type: 'counter', current: 2, target: 5, sectionIds: ['route'], mainSectionId: 'route', missable: true, url: 'https://example.com/flower-trophy' })
  value.items.push(
    { id: 'inherited', trophyId: 'flowers', title: 'Inherited trophy section', mainSectionId: 'route' },
    { id: 'inherited-child', trophyId: 'flowers', title: 'Inherited through parent', parentId: 'inherited', mainSectionId: 'route', inheritTrophySections: false },
    { id: 'independent', trophyId: 'flowers', title: 'Independent section copy', inheritTrophySections: false, sectionIds: ['chapter1'], mainSectionId: 'chapter1', done: true },
    { id: 'independent-child', trophyId: 'flowers', title: 'Independent counter', parentId: 'independent', mainSectionId: 'chapter1', type: 'counter', target: 4, current: 3 },
  )
  return value
}
async function notebookHunt(owner, title) {
  const entry = (await send(owner, 'post', '/api/games', { title }).expect(201)).body
  return (await send(owner, 'post', '/api/hunts', { gameId: entry._id, platformId: 'ps5', service: 'playstation' }).expect(201)).body
}

test('v2 notebooks persist manual trophies and inherited links independently with revision and ownership checks', async () => {
  const owner = await account('notebook-v2@example.com'), record = await notebookHunt(owner, 'Linked notebook')
  assert.deepEqual(record.notebook, emptyNotebook())
  const input = linkedNotebook()
  await send(bob, 'put', `/api/hunts/${record._id}/notebook`, input).expect(404)
  const saved = (await send(owner, 'put', `/api/hunts/${record._id}/notebook`, input).expect(200)).body.notebook
  assert.deepEqual(saved, { ...normalizeNotebook(input), revision: 1 })
  assert.equal(saved.trophies[0].done, true)
  assert.equal(saved.trophies[0].description, input.trophies[0].description)
  assert.equal(saved.items[1].done, false)
  assert.equal(saved.trophies[1].done, false)
  assert.equal(saved.items[3].done, true)
  await send(owner, 'put', `/api/hunts/${record._id}/notebook`, input).expect(409)
  const trophyOnly = { ...saved, trophies: saved.trophies.map(trophy => ({ ...trophy, done: !trophy.done })) }
  const changed = (await send(owner, 'put', `/api/hunts/${record._id}/notebook`, trophyOnly).expect(200)).body.notebook
  assert.deepEqual(changed.items, saved.items)
  assert.equal(changed.revision, 2)
  const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.hunts[0].notebook, changed)
})

test('malformed v2 notebook writes are rejected without changing the saved notebook', async () => {
  const owner = await account('notebook-invalid@example.com'), record = await notebookHunt(owner, 'Notebook validation')
  for (const change of [
    value => { value.formatVersion = 3 },
    value => { value.items[0].sectionIds = ['missing'] },
    value => { value.items[0].sectionIds = ['chapter1', 'chapter1'] },
    value => { value.items[0].mainSectionId = 'route' },
    value => { value.items[1].mainSectionId = null },
    value => { value.items[1].parentId = 'gift' },
    value => { value.items[0].parentId = 'flower' },
  ]) {
    const invalid = linkedNotebook(); change(invalid)
    await send(owner, 'put', `/api/hunts/${record._id}/notebook`, invalid).expect(400)
  }
  assert.deepEqual((await models.Hunt.findById(record._id).lean()).notebook, emptyNotebook())
})

test('legacy notebooks normalize in reads, hunt edits, copies, exports, and saves without losing progress', async () => {
  const owner = await account('notebook-legacy@example.com'), record = await notebookHunt(owner, 'Legacy notebook'), destination = await notebookHunt(owner, 'Legacy copy')
  const legacy = { revision: 6, sections: [{ id: 'old', title: 'Keep this trophy title' }], items: [
    { id: 'goal', sectionId: 'old', title: 'Collect them all', category: 'Delete this category', done: true, notes: 'Keep these notes' },
    { id: 'leaf', sectionId: 'old', parentId: 'goal', title: 'Counter collectible', category: 'Also removed', type: 'counter', target: 4, current: 3, done: false, missable: true },
  ] }
  await models.Hunt.updateOne({ _id: record._id }, { $set: { notebook: legacy } })
  const expected = normalizeNotebook(legacy)
  const state = (await owner.agent.get('/api/bootstrap').expect(200)).body
  assert.deepEqual(state.hunts.find(entry => entry._id === record._id).notebook, expected)
  const edited = (await send(owner, 'patch', `/api/hunts/${record._id}`, { notes: 'Edit unrelated hunt details' }).expect(200)).body
  assert.deepEqual(edited.notebook, expected)
  assert.deepEqual((await models.Hunt.findById(record._id).lean()).notebook, legacy)
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  assert.deepEqual(backup.hunts.find(entry => entry._id === record._id).notebook, expected)
  const copied = (await send(owner, 'post', `/api/hunts/${record._id}/copy-notebook`, { targetId: destination._id, revision: 0 }).expect(200)).body.notebook
  assert.equal(copied.formatVersion, 2)
  assert.equal(copied.trophies[0].done, false)
  assert.equal(copied.items[1].current, 0)
  assert.equal(copied.items[1].parentId, 'goal')
  assert.equal(copied.items[1].trophyId, 'old')
  assert.equal('category' in copied.items[1], false)
  const saved = (await send(owner, 'put', `/api/hunts/${record._id}/notebook`, legacy).expect(200)).body.notebook
  assert.deepEqual(saved, { ...expected, revision: 7 })
  assert.deepEqual((await models.Hunt.findById(record._id).lean()).notebook, saved)
})

test('copying v2 notebooks resets destination trophy and task progress while preserving links and source state', async () => {
  const owner = await account('notebook-copy-v2@example.com'), source = await notebookHunt(owner, 'Copy source'), target = await notebookHunt(owner, 'Copy destination')
  const saved = (await send(owner, 'put', `/api/hunts/${source._id}/notebook`, linkedNotebook()).expect(200)).body.notebook
  const copied = (await send(owner, 'post', `/api/hunts/${source._id}/copy-notebook`, { targetId: target._id, revision: 0 }).expect(200)).body.notebook
  assert.deepEqual(copied, { ...saved, trophies: saved.trophies.map(trophy => ({ ...trophy, done: false, current: 0 })), items: saved.items.map(item => ({ ...item, done: false, current: 0 })) })
  assert.deepEqual((await models.Hunt.findById(source._id).lean()).notebook, saved)
  await send(owner, 'post', `/api/hunts/${source._id}/copy-notebook`, { targetId: target._id, revision: 0 }).expect(409)
})

test('trackable trophies persist counters, links, and independent branches and copy with reset progress', async () => {
  const owner = await account('notebook-trophy-tracking@example.com'), source = await notebookHunt(owner, 'Trackable trophies'), target = await notebookHunt(owner, 'Trackable trophy copies')
  const input = trackableTrophyNotebook(), before = structuredClone(input)
  const saved = (await send(owner, 'put', `/api/hunts/${source._id}/notebook`, input).expect(200)).body.notebook
  assert.deepEqual(saved, { ...normalizeNotebook(input), revision: 1 })
  assert.deepEqual(input, before)
  assert.deepEqual((await models.Hunt.findById(source._id).lean()).notebook, saved)
  assert.deepEqual((await owner.agent.get('/api/bootstrap').expect(200)).body.hunts.find(entry => entry._id === source._id).notebook, saved)

  for (const invalidate of [
    value => { value.trophies[0].current = 6 },
    value => { value.trophies[0].mainSectionId = 'chapter1' },
    value => { value.trophies[0].sectionIds = ['missing']; value.trophies[0].mainSectionId = 'missing' },
    value => { value.items.find(entry => entry.id === 'independent').mainSectionId = 'route' },
    value => { value.items.find(entry => entry.id === 'independent-child').mainSectionId = 'route' },
  ]) {
    const invalid = structuredClone(saved)
    invalidate(invalid)
    await send(owner, 'put', `/api/hunts/${source._id}/notebook`, invalid).expect(400)
  }
  assert.deepEqual((await models.Hunt.findById(source._id).lean()).notebook, saved)

  const copied = (await send(owner, 'post', `/api/hunts/${source._id}/copy-notebook`, { targetId: target._id, revision: 0 }).expect(200)).body.notebook
  assert.deepEqual(copied, {
    ...saved,
    trophies: saved.trophies.map(trophy => ({ ...trophy, done: false, current: 0 })),
    items: saved.items.map(entry => ({ ...entry, done: false, current: 0 })),
  })
  assert.deepEqual((await models.Hunt.findById(source._id).lean()).notebook, saved)
})

test('trackable trophy backups preserve progress and notebook-local references across ownership remapping', async () => {
  const owner = await account('trophy-tracking-export@example.com'), destination = await account('trophy-tracking-import@example.com'), record = await notebookHunt(owner, 'Trophy backup')
  const saved = (await send(owner, 'put', `/api/hunts/${record._id}/notebook`, trackableTrophyNotebook()).expect(200)).body.notebook
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  assert.deepEqual(backup.hunts[0].notebook, saved)
  await send(destination, 'post', '/api/backups/preview', backup).expect(200)
  await send(destination, 'post', '/api/backups/import', backup).expect(201)
  const imported = (await destination.agent.get('/api/bootstrap').expect(200)).body.hunts[0]
  assert.notEqual(imported._id, record._id)
  assert.notEqual(imported.gameId, record.gameId)
  assert.equal(imported.userId, destination.id)
  assert.deepEqual(imported.notebook, { ...saved, revision: 0 })
  const reexport = (await destination.agent.get('/api/backups/export').expect(200)).body
  assert.deepEqual(reexport.hunts[0].notebook, imported.notebook)

  const invalid = structuredClone(backup)
  invalid.hunts[0].notebook.trophies[0].sectionIds = ['missing']
  invalid.hunts[0].notebook.trophies[0].mainSectionId = 'missing'
  await send(destination, 'post', '/api/backups/preview', invalid).expect(400)
  await send(destination, 'post', '/api/backups/import', invalid).expect(400)
  assert.equal((await destination.agent.get('/api/bootstrap').expect(200)).body.hunts.length, 1)
})

test('v2 and legacy notebook backups round trip with canonical fields, ownership remapping, and reference validation', async () => {
  const owner = await account('notebook-backup-v2@example.com'), destination = await account('notebook-import-v2@example.com'), record = await notebookHunt(owner, 'Notebook backup')
  const saved = (await send(owner, 'put', `/api/hunts/${record._id}/notebook`, linkedNotebook()).expect(200)).body.notebook
  const backup = (await owner.agent.get('/api/backups/export').expect(200)).body
  assert.equal(backup.version, 1)
  assert.deepEqual(backup.hunts[0].notebook, saved)
  await send(destination, 'post', '/api/backups/preview', backup).expect(200)
  await send(destination, 'post', '/api/backups/import', backup).expect(201)
  const imported = (await destination.agent.get('/api/bootstrap').expect(200)).body.hunts[0]
  assert.notEqual(imported._id, record._id)
  assert.equal(imported.userId, destination.id)
  assert.deepEqual(imported.notebook, { ...saved, revision: 0 })

  const invalid = structuredClone(backup)
  invalid.hunts[0].notebook.items[0].mainSectionId = 'missing'
  await send(destination, 'post', '/api/backups/preview', invalid).expect(400)
  await send(destination, 'post', '/api/backups/import', invalid).expect(400)
  assert.equal((await destination.agent.get('/api/bootstrap')).body.hunts.length, 1)

  const legacy = structuredClone(backup)
  legacy.hunts[0].notebook = { revision: 8, sections: [{ id: 'legacy-trophy', title: 'Legacy trophy' }], items: [{ id: 'legacy-item', sectionId: 'legacy-trophy', title: 'Keep this collectible', category: 'Discard only this field', done: true }] }
  const original = structuredClone(legacy)
  const legacyDestination = await account('notebook-import-legacy@example.com')
  await send(legacyDestination, 'post', '/api/backups/preview', legacy).expect(200)
  await send(legacyDestination, 'post', '/api/backups/import', legacy).expect(201)
  const legacyImport = (await legacyDestination.agent.get('/api/bootstrap')).body.hunts.find(entry => entry.notebook.trophies[0]?.id === 'legacy-trophy')
  assert.deepEqual(legacyImport.notebook, { ...normalizeNotebook(legacy.hunts[0].notebook), revision: 0 })
  assert.deepEqual(legacy, original)
})
