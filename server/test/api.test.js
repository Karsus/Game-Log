const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const request = require('supertest')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const path = require('node:path')
const { createApp } = require('../app')
const { migrateDifficulties } = require('../domain/difficulty')
const { validateBackup } = require('../backup')
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
