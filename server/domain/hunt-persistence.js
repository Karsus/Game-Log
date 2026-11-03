const { httpError } = require('./security')
const { isStandaloneTransactionError } = require('./mongo-transactions')

async function saveHuntWithBoard({ connection, save, enableBoard }) {
  try {
    return await connection.transaction(async session => {
      const hunt = await save(session)
      await enableBoard(session)
      return hunt
    })
  } catch (error) {
    // Only this rejection guarantees the transaction never wrote anything.
    // Retrying after a timeout or uncertain commit could create a second hunt.
    if (!isStandaloneTransactionError(error)) throw error
  }

  // Standalone MongoDB cannot commit both records together. Keep saved progress
  // if the visibility update fails, and explicitly clear the aborted session.
  const hunt = await save(null)
  try {
    await enableBoard(null)
  } catch {
    throw httpError(503, 'Your hunt was saved, but it could not be shown on Trophy Hunts. Reload the page before trying to show it again.')
  }
  return hunt
}

module.exports = { saveHuntWithBoard }
