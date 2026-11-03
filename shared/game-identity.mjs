// Keep browser hints and server enforcement consistent. Identity is deliberately
// exact: punctuation, accents, release years and platforms are not rewritten.
export function normalizeGameTitle(value) {
  return (value || '').trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function gameIgdbIdentity(game) {
  return Number.isInteger(game?.igdbId) && game.igdbId > 0 ? game.igdbId : null
}

export function gameIdentityChanged(before, after) {
  return normalizeGameTitle(before?.title) !== normalizeGameTitle(after?.title)
    || gameIgdbIdentity(before) !== gameIgdbIdentity(after)
}

export function findDuplicateGame(games, candidate, excludeId) {
  const title = normalizeGameTitle(candidate?.title), igdbId = gameIgdbIdentity(candidate)
  return games.find(game => (excludeId == null || String(game._id) !== String(excludeId))
    && ((title && normalizeGameTitle(game.title) === title)
      || (igdbId !== null && gameIgdbIdentity(game) === igdbId)))
}
