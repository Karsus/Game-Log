const { test } = require('node:test')
const assert = require('node:assert/strict')
const { deleteGameWithRelations } = require('../domain/game-deletion')

const standaloneMessage = 'Transaction numbers are only allowed on a replica set member or mongos'
const standaloneError = () => Object.assign(new Error(standaloneMessage), { name: 'MongoServerError', code: 20 })

function fakeModels({ standalone = false, failure, failAt } = {}) {
  const calls = [], session = { transaction: true }
  const operation = name => async (filter, options) => {
    calls.push({ name, filter, session: options.session })
    if (standalone && options.session) throw standaloneError()
    if (name === failAt) throw failure
  }
  const models = {
    LibraryGame: {
      db: { transaction: async callback => { await callback(session); if (failure && !failAt) throw failure } },
      deleteOne: operation('game'),
    },
    GameCopy: { deleteMany: operation('copies') },
    Hunt: { deleteMany: operation('hunts') },
  }
  return { models, calls, session }
}

test('game deletion removes only the requested owner and game in one transaction', async () => {
  const { models, calls, session } = fakeModels()
  await deleteGameWithRelations({ models, userId: 'owner', gameId: 'game-id' })
  assert.deepEqual(calls, [
    { name: 'copies', filter: { gameId: 'game-id', userId: 'owner' }, session },
    { name: 'hunts', filter: { gameId: 'game-id', userId: 'owner' }, session },
    { name: 'game', filter: { _id: 'game-id', userId: 'owner' }, session },
  ])
})

test('standalone deletion clears the rejected session and removes the parent last', async () => {
  const { models, calls, session } = fakeModels({ standalone: true })
  await deleteGameWithRelations({ models, userId: 'owner', gameId: 'game-id' })
  assert.deepEqual(calls.map(({ name, session }) => [name, session]), [
    ['copies', session], ['copies', null], ['hunts', null], ['game', null],
  ])
  assert.ok(calls.every(call => call.filter.userId === 'owner'))
})

test('game deletion never falls back after an uncertain commit or unrelated transaction error', async () => {
  const failures = [
    Object.assign(new Error('Connection lost while committing'), { name: 'MongoNetworkError', errorLabels: ['UnknownTransactionCommitResult'] }),
    Object.assign(new Error('Not authorized'), { name: 'MongoServerError', code: 13 }),
    Object.assign(new Error('Another illegal operation'), { name: 'MongoServerError', code: 20 }),
    Object.assign(new Error(standaloneMessage), { code: 20 }),
    Object.assign(new Error(standaloneMessage), { name: 'MongoServerError', code: 13 }),
  ]
  for (const failure of failures) {
    const { models, calls, session } = fakeModels({ failure })
    await assert.rejects(deleteGameWithRelations({ models, userId: 'owner', gameId: 'game-id' }), error => error === failure)
    assert.equal(calls.length, 3)
    assert.ok(calls.every(call => call.session === session))
  }
})

test('standalone failures stop cleanup and explain that related records may already be removed', async () => {
  for (const failAt of ['copies', 'hunts', 'game']) {
    const failure = new Error(`Injected ${failAt} failure`)
    const { models, calls } = fakeModels({ standalone: true, failure, failAt })
    await assert.rejects(deleteGameWithRelations({ models, userId: 'owner', gameId: 'game-id' }), error => {
      assert.equal(error.status, 503)
      assert.equal(error.cause, failure)
      assert.match(error.message, /could not be fully deleted/)
      assert.match(error.message, /may already have been removed/)
      assert.match(error.message, /Reload/)
      return true
    })
    assert.equal(calls.at(-1).name, failAt)
    if (failAt !== 'game') assert.ok(!calls.some(call => call.name === 'game'))
  }
})
