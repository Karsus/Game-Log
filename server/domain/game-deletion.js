const { httpError } = require('./security')
const { isStandaloneTransactionError } = require('./mongo-transactions')

async function deleteGameWithRelations({ models, userId, gameId }) {
  async function remove(session) {
    const related = { gameId, userId }
    await models.GameCopy.deleteMany(related, { session })
    await models.Hunt.deleteMany(related, { session })
    await models.LibraryGame.deleteOne({ _id: gameId, userId }, { session })
  }

  try {
    return await models.LibraryGame.db.transaction(remove)
  } catch (error) {
    // This rejection occurs before any transaction writes. Other errors may
    // represent an uncertain commit, so they must never trigger another delete.
    if (!isStandaloneTransactionError(error)) throw error
  }

  try {
    // Keep the parent until its related records are gone, so an interrupted
    // standalone cleanup can be retried. Do not reuse the aborted session.
    await remove(null)
  } catch (error) {
    throw Object.assign(httpError(503, 'The game could not be fully deleted. Some copies or hunts may already have been removed. Reload the page before trying to delete the game again.'), { cause: error })
  }
}

module.exports = { deleteGameWithRelations }
