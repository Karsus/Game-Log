// Compatibility for estimates saved before difficulty became whole numbers only.
function wholeDifficulty(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10 ? Math.round(value) : value
}
function wholeDifficultyFilter(value) {
  return typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 10 ? String(Math.round(Number(value))) : value
}
async function migrateDifficulties(models) {
  const hunts = await models.Hunt.find({ expectedDifficulty: { $gte: 1, $lte: 10 }, $expr: { $ne: ['$expectedDifficulty', { $floor: '$expectedDifficulty' }] } }).select('_id expectedDifficulty').lean()
  if (hunts.length) await models.Hunt.bulkWrite(hunts.map(hunt => ({ updateOne: { filter: { _id: hunt._id, expectedDifficulty: hunt.expectedDifficulty }, update: { $set: { expectedDifficulty: wholeDifficulty(hunt.expectedDifficulty) }, $inc: { __v: 1 } } } })))
  const accounts = await models.Account.find({ $or: [{ 'preferences.hunts.difficulty': { $regex: '\\.' } }, { 'preferences.catalog.difficulty': { $regex: '\\.' } }] }).select('_id preferences').lean()
  for (const account of accounts) for (const scope of ['catalog', 'hunts']) {
    const previous = account.preferences?.[scope]?.difficulty, next = wholeDifficultyFilter(previous)
    if (next !== previous) await models.Account.updateOne({ _id: account._id, [`preferences.${scope}.difficulty`]: previous }, { $set: { [`preferences.${scope}.difficulty`]: next } })
  }
}
module.exports = { wholeDifficulty, wholeDifficultyFilter, migrateDifficulties }
