const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveHuntWithBoard } = require('../domain/hunt-persistence')

test('hunt persistence never falls back after uncertain commits or unrelated transaction errors', async () => {
  const standaloneMessage = 'Transaction numbers are only allowed on a replica set member or mongos'
  const failures = [
    Object.assign(new Error('Connection lost while committing'), { name: 'MongoNetworkError', errorLabels: ['UnknownTransactionCommitResult'] }),
    Object.assign(new Error('Duplicate hunt'), { name: 'MongoServerError', code: 11000 }),
    Object.assign(new Error('Another illegal operation'), { name: 'MongoServerError', code: 20 }),
    Object.assign(new Error(standaloneMessage), { code: 20 }),
    Object.assign(new Error(standaloneMessage), { name: 'MongoServerError', code: 13 }),
  ]
  for (const failure of failures) {
    let saves = 0, visibilityUpdates = 0
    const session = {}
    await assert.rejects(saveHuntWithBoard({
      connection: { transaction: async callback => { await callback(session); throw failure } },
      save: async actualSession => { assert.equal(actualSession, session); saves++; return { _id: 'saved-hunt' } },
      enableBoard: async actualSession => { assert.equal(actualSession, session); visibilityUpdates++ },
    }), error => error === failure)
    assert.equal(saves, 1)
    assert.equal(visibilityUpdates, 1)
  }
})
