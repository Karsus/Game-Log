const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const mongoose = require('mongoose')
const request = require('supertest')
const { MongoMemoryServer } = require('mongodb-memory-server')
const { createApp } = require('../app')

let mongo, connection, app, store, models, alice, bob
const send = (user, method, url, body) => user.agent[method](url).set('X-CSRF-Token', user.csrf).send(body)
async function account(email) {
  const agent = request.agent(app)
  const session = await agent.get('/api/auth/session').expect(200)
  const result = await agent.post('/api/auth/register').set('X-CSRF-Token', session.body.csrf).send({ name: 'Standalone collector', email, password: 'LongTestPassword123!' }).expect(201)
  return { agent, csrf: result.body.csrf, id: result.body.user._id }
}
async function game(title) {
  return (await send(alice, 'post', '/api/games', { title, releases: [{ platformId: 'ps5' }] }).expect(201)).body
}
function huntInput(gameId) {
  return {
    gameId, platformId: 'ps5', service: 'playstation', variant: '',
    expectedDifficulty: 5, expectedHours: 60, status: 'planned',
    hasAchievements: true, hasPlatinum: true, goal: 'platinum', earned: 12, total: 52,
    completion: { platinum: false, base: false, all: false, manual: false, completedOn: '' },
    notes: '', enableBoard: true,
  }
}
async function assertBoard(gameId, visible) {
  const state = (await alice.agent.get('/api/bootstrap').expect(200)).body
  assert.equal(state.games.find(entry => entry._id === gameId).showOnBoard, visible)
  return state
}
function failBoardUpdate(t) {
  t.mock.method(models.LibraryGame, 'updateOne', async function (filter, update, options) {
    assert.equal(update.$set.showOnBoard, true)
    assert.equal(options.session, null)
    throw new Error('Injected board write failure')
  })
}
function assertSavedWarning(response) {
  assert.match(response.body.error, /hunt was saved/i)
  assert.match(response.body.error, /Reload/)
}

before(async () => {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '../../.runtime/mongodb')
  mongo = await MongoMemoryServer.create()
  connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'gamelog-hunts-standalone-tests' }).asPromise()
  const result = await createApp({ connection, secret: 'standalone-test-only-secret', env: { NODE_ENV: 'test' } })
  app = result.app; store = result.sessionStore; models = result.models
  alice = await account('standalone-alice@example.com'); bob = await account('standalone-bob@example.com')
}, { timeout: 180000 })
after(async () => { if (store) await store.close(); if (connection) await connection.close(); if (mongo) await mongo.stop() })

test('standalone MongoDB creates the reported PlayStation hunt and shows it on the board', async () => {
  const entry = await game('Echoes of Aincrad')
  const input = huntInput(entry._id)
  const created = (await send(alice, 'post', '/api/hunts', input).expect(201)).body
  for (const [key, value] of Object.entries(input)) {
    if (key !== 'enableBoard') assert.deepEqual(created[key], value)
  }
  const state = await assertBoard(entry._id, true)
  const saved = state.hunts.filter(hunt => hunt.gameId === entry._id)
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0], created)
})

test('standalone hunt edits clear the transaction session and preserve progress, notebook, and creation date', async t => {
  const entry = await game('Standalone edit')
  const created = (await send(alice, 'post', '/api/hunts', huntInput(entry._id)).expect(201)).body
  const notebook = { revision: 0, sections: [{ id: 'general', title: 'General' }], items: [{ id: 'reminder', sectionId: 'general', title: 'Keep this progress', done: true }] }
  const beforeEdit = (await send(alice, 'put', `/api/hunts/${created._id}/notebook`, notebook).expect(200)).body
  await send(alice, 'patch', `/api/games/${entry._id}`, { showOnBoard: false }).expect(200)
  const sessions = [], originalSave = models.Hunt.prototype.save
  t.mock.method(models.Hunt.prototype, 'save', function (options) {
    sessions.push(options?.session)
    return originalSave.call(this, options)
  })

  const updated = (await send(alice, 'patch', `/api/hunts/${created._id}`, { expectedHours: 72.5, enableBoard: true }).expect(200)).body
  assert.ok(sessions.some(session => session != null), 'tries a transaction first')
  assert.equal(sessions.at(-1), null, 'the fallback explicitly clears the session')
  assert.equal(updated.expectedHours, 72.5)
  for (const key of ['createdAt', 'expectedDifficulty', 'earned', 'total', 'status', 'goal', 'completion', 'notebook']) assert.deepEqual(updated[key], beforeEdit[key])
  const state = await assertBoard(entry._id, true)
  assert.deepEqual(state.hunts.find(hunt => hunt._id === created._id), updated)
})

test('a duplicate standalone hunt does not enable a hidden game or create another hunt', async () => {
  const entry = await game('Standalone duplicate')
  const input = huntInput(entry._id)
  const created = (await send(alice, 'post', '/api/hunts', input).expect(201)).body
  await send(alice, 'patch', `/api/games/${entry._id}`, { showOnBoard: false }).expect(200)
  await send(alice, 'post', '/api/hunts', input).expect(409)
  const state = await assertBoard(entry._id, false)
  assert.deepEqual(state.hunts.filter(hunt => hunt.gameId === entry._id), [created])
})

test('standalone fallback still rejects invalid input and cross-account access', async () => {
  const entry = await game('Standalone validation')
  const input = huntInput(entry._id)
  await send(alice, 'post', '/api/hunts', { ...input, expectedDifficulty: 5.5 }).expect(400)
  await send(alice, 'post', '/api/hunts', { ...input, earned: 53 }).expect(400)
  await send(bob, 'post', '/api/hunts', input).expect(404)
  const state = await assertBoard(entry._id, false)
  assert.equal(state.hunts.filter(hunt => hunt.gameId === entry._id).length, 0)

  const created = (await send(alice, 'post', '/api/hunts', { ...input, enableBoard: false }).expect(201)).body
  await send(bob, 'patch', `/api/hunts/${created._id}`, { expectedHours: 100, enableBoard: true }).expect(404)
  const afterRejectedEdit = await assertBoard(entry._id, false)
  assert.deepEqual(afterRejectedEdit.hunts.find(hunt => hunt._id === created._id), created)
})

test('a standalone board failure after creation reports that the hunt was saved and retains it', async t => {
  const entry = await game('Standalone create board failure')
  failBoardUpdate(t)
  const response = await send(alice, 'post', '/api/hunts', huntInput(entry._id)).expect(503)
  assertSavedWarning(response)
  const state = await assertBoard(entry._id, false)
  const saved = state.hunts.filter(hunt => hunt.gameId === entry._id)
  assert.equal(saved.length, 1)
  for (const [key, value] of Object.entries(huntInput(entry._id))) {
    if (key !== 'enableBoard') assert.deepEqual(saved[0][key], value)
  }
})

test('a standalone board failure after editing reports that the hunt was saved and retains the edits', async t => {
  const entry = await game('Standalone edit board failure')
  const created = (await send(alice, 'post', '/api/hunts', { ...huntInput(entry._id), enableBoard: false }).expect(201)).body
  failBoardUpdate(t)
  const response = await send(alice, 'patch', `/api/hunts/${created._id}`, { earned: 18, expectedHours: 80, notes: 'Keep the new progress', enableBoard: true }).expect(503)
  assertSavedWarning(response)
  const state = await assertBoard(entry._id, false)
  const saved = state.hunts.find(hunt => hunt._id === created._id)
  assert.equal(saved.earned, 18)
  assert.equal(saved.expectedHours, 80)
  assert.equal(saved.notes, 'Keep the new progress')
  assert.equal(saved.createdAt, created.createdAt)
  assert.equal(saved.total, created.total)
  assert.deepEqual(saved.notebook, created.notebook)
})
