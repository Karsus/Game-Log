const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const mongoose = require('mongoose')
const request = require('supertest')
const { MongoMemoryServer, MongoMemoryReplSet } = require('mongodb-memory-server')
const { createApp } = require('../app')

async function account(app, email) {
  const agent = request.agent(app)
  const session = await agent.get('/api/auth/session').expect(200)
  const result = await agent.post('/api/auth/register').set('X-CSRF-Token', session.body.csrf).send({ name: 'Deletion test collector', email, password: 'LongTestPassword123!' }).expect(201)
  return { agent, csrf: result.body.csrf, id: result.body.user._id }
}
const remove = (user, gameId) => user.agent.delete(`/api/games/${gameId}`).set('X-CSRF-Token', user.csrf)

async function fixture(models, userId = new mongoose.Types.ObjectId()) {
  const game = await models.LibraryGame.create({ userId, title: `Deletion fixture ${new mongoose.Types.ObjectId()}` })
  const copy = await models.GameCopy.create({ userId, gameId: game._id, platformId: 'ps5', format: 'physical' })
  const hunt = await models.Hunt.create({ userId, gameId: game._id, platformId: 'ps5', service: 'playstation', variant: '', notebook: { revision: 1, trophies: [{ id: 'trophy', title: 'Saved progress', done: true }] } })
  return { userId, game, copy, hunt }
}

async function assertRemaining(models, records, expected) {
  assert.equal(Boolean(await models.LibraryGame.exists({ _id: records.game._id })), expected.game)
  assert.equal(Boolean(await models.GameCopy.exists({ _id: records.copy._id })), expected.copy)
  assert.equal(Boolean(await models.Hunt.exists({ _id: records.hunt._id })), expected.hunt)
}

for (const standalone of [true, false]) {
  test(`game deletion on ${standalone ? 'standalone MongoDB' : 'a replica set'}`, { timeout: 180000 }, async t => {
    let mongo, connection, store
    try {
      process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '../../.runtime/mongodb')
      mongo = standalone ? await MongoMemoryServer.create() : await MongoMemoryReplSet.create({ replSet: { count: 1 } })
      connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'gamelog-game-deletion-tests' }).asPromise()
      const created = await createApp({ connection, secret: 'deletion-tests-only-secret', env: { NODE_ENV: 'test' } })
      const { app, models } = created
      store = created.sessionStore
      const alice = await account(app, 'deletion-alice@example.com'), bob = await account(app, 'deletion-bob@example.com')

      await t.test('deletes the game, copies, hunts, and embedded notebooks while preserving unrelated records', async () => {
        const target = await fixture(models, alice.id), sameOwner = await fixture(models, alice.id), otherOwner = await fixture(models, bob.id)
        await remove(alice, target.game._id).expect(200, { ok: true })
        await assertRemaining(models, target, { game: false, copy: false, hunt: false })
        await assertRemaining(models, sameOwner, { game: true, copy: true, hunt: true })
        await assertRemaining(models, otherOwner, { game: true, copy: true, hunt: true })
        assert.equal((await models.Hunt.findById(sameOwner.hunt._id)).notebook.trophies[0].done, true)
      })

      await t.test('owner filters prevent deleting another account\'s game or related records', async () => {
        const target = await fixture(models, alice.id)
        await remove(bob, target.game._id).expect(404)
        await assertRemaining(models, target, { game: true, copy: true, hunt: true })
      })

      await t.test('deletes a library entry that has no copies or hunts', async () => {
        const game = await models.LibraryGame.create({ userId: alice.id, title: 'Empty deletion fixture' })
        await remove(alice, game._id).expect(200, { ok: true })
        assert.equal(await models.LibraryGame.exists({ _id: game._id }), null)
        await remove(alice, game._id).expect(404)
      })

      await t.test(standalone ? 'an interrupted cleanup keeps the parent and can be retried' : 'a failed cascade rolls back every deletion', async () => {
        const target = await fixture(models, alice.id), original = models.Hunt.deleteMany
        models.Hunt.deleteMany = async () => { throw new Error('Injected hunt deletion failure') }
        try {
          const response = await remove(alice, target.game._id).expect(standalone ? 503 : 500)
          if (standalone) {
            assert.match(response.body.error, /could not be fully deleted/)
            assert.match(response.body.error, /may already have been removed/)
            assert.match(response.body.error, /Reload/)
          }
        } finally { models.Hunt.deleteMany = original }
        await assertRemaining(models, target, { game: true, copy: !standalone, hunt: true })
        await remove(alice, target.game._id).expect(200, { ok: true })
        await assertRemaining(models, target, { game: false, copy: false, hunt: false })
      })
    } finally {
      if (store) await store.close()
      if (connection) await connection.close()
      if (mongo) await mongo.stop()
    }
  })
}
