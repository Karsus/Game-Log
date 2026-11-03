const { normalizeGameTitle, gameIgdbIdentity, findDuplicateGame, gameIdentityChanged } = require('../../shared/game-identity.mjs')
const { httpError } = require('./security')

function gameIdentityKeys(game) {
  return { normalizedTitleKey: normalizeGameTitle(game.title), igdbIdentity: gameIgdbIdentity(game) ?? undefined }
}

function gameResponse(record) {
  const { normalizedTitleKey, igdbIdentity, ...value } = record.toObject ? record.toObject() : record
  return value
}

function duplicateGameError(existing, inBackup = false) {
  const message = inBackup
    ? `This backup contains duplicate games (${existing.title}). No records were imported.`
    : existing
      ? `${existing.title} is already in your library. Open that game to add copies or hunts.`
      : 'This game is already in your library. Reload to open the existing game.'
  return Object.assign(httpError(409, message), {
    code: 'DUPLICATE_GAME',
    ...(!inBackup && existing ? { existingGameId: String(existing._id), existingGameTitle: existing.title } : {}),
  })
}

function isGameDuplicateKey(error) {
  return error.code === 11000 && (
    error.keyPattern?.normalizedTitleKey || error.keyPattern?.igdbIdentity ||
    /unique_game_(title|igdb)_per_owner/.test(error.message || '')
  )
}

function duplicateGameResponse(error) {
  return { error: error.message, code: 'DUPLICATE_GAME', ...(error.existingGameId ? { existingGameId: error.existingGameId, existingGameTitle: error.existingGameTitle } : {}) }
}

async function resolveGameDuplicateKey(Model, userId, error) {
  const keyValue = error.keyValue || error.errorResponse?.keyValue || error.writeErrors?.[0]?.err?.keyValue
  const keys = ['normalizedTitleKey', 'igdbIdentity'].filter(key => keyValue?.[key] !== undefined)
  if (userId && keys.length) {
    try {
      const existing = await Model.findOne({ userId, $or: keys.map(key => ({ [key]: keyValue[key] })) }).select('_id title').lean()
      if (existing) return duplicateGameError(existing)
    } catch { /* A lookup failure must not hide the original duplicate conflict. */ }
  }
  return duplicateGameError()
}

async function assertGameAvailable(Model, userId, candidate, excludeId) {
  const games = await Model.find({ userId }).select('_id title igdbId').lean()
  const existing = findDuplicateGame(games, candidate, excludeId)
  if (existing) throw duplicateGameError(existing)
}

function identityIndex(games) {
  const titles = new Map(), ids = new Map()
  for (const game of games) {
    titles.set(normalizeGameTitle(game.title), game)
    const id = gameIgdbIdentity(game)
    if (id !== null) ids.set(id, game)
  }
  return { titles, ids }
}

function assertBackupGameIdentities(games) {
  const { titles, ids } = identityIndex([])
  for (const game of games) {
    const title = normalizeGameTitle(game.title), id = gameIgdbIdentity(game)
    const existing = titles.get(title) || (id !== null && ids.get(id))
    if (existing) throw duplicateGameError(existing, true)
    titles.set(title, game)
    if (id !== null) ids.set(id, game)
  }
}

async function assertImportGamesAvailable(Model, userId, games, session = null) {
  const existing = await Model.find({ userId }).select('_id title igdbId').session(session).lean()
  const { titles, ids } = identityIndex(existing)
  for (const game of games) {
    const id = gameIgdbIdentity(game)
    const match = titles.get(normalizeGameTitle(game.title)) || (id !== null && ids.get(id))
    if (match) throw duplicateGameError(match)
  }
}

module.exports = { gameIdentityKeys, gameIdentityChanged, gameResponse, duplicateGameError, duplicateGameResponse, resolveGameDuplicateKey, isGameDuplicateKey, assertGameAvailable, assertBackupGameIdentities, assertImportGamesAvailable }
