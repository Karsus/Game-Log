const { Schema } = require('mongoose')
function createModels(connection) {
  const opts = { timestamps: true, strict: 'throw', optimisticConcurrency: true }
  const owner = { type: Schema.Types.ObjectId, required: true, index: true }
  const acquisition = { acquiredOn: String, price: Number, currency: String, condition: String, state: String, location: String, lentTo: String, notes: String }
  const schemas = {
    Account: new Schema({ name: String, email: { type: String, unique: true }, passwordHash: { type: String, select: false }, preferences: { type: Schema.Types.Mixed, default: () => ({ theme: 'dark', catalog: null, hunts: null }) }, resetHash: { type: String, select: false }, resetExpires: { type: Date, select: false } }, opts),
    PlatformRecord: new Schema({ _id: String, userId: { type: Schema.Types.ObjectId, default: null }, name: String, manufacturer: String, service: String, igdbId: Number, variants: [String] }, opts),
    LibraryGame: new Schema({ userId: owner, title: String, description: String, cover: String, developer: String, publisher: String, genres: [String], releaseYear: Number, releases: [{ _id: false, platformId: String, date: String }], igdbId: Number, sourceUrl: String, wishlist: Boolean, wishlistPlatforms: [String], showOnBoard: Boolean, rating: Number, notes: String }, opts),
    GameCopy: new Schema({ userId: owner, gameId: { type: Schema.Types.ObjectId, required: true, index: true }, platformId: String, format: String, storefront: String, edition: String, region: String, packaging: String, ...acquisition }, opts),
    HardwareUnit: new Schema({ userId: owner, platformId: String, nickname: String, model: String, color: String, storage: String, region: String, serial: String, image: String, ...acquisition }, opts),
    Hunt: new Schema({ userId: owner, gameId: { type: Schema.Types.ObjectId, required: true, index: true }, platformId: String, service: String, variant: String, expectedDifficulty: { type: Number, min: 1, max: 10, validate: { validator: value => value == null || Number.isInteger(value), message: 'Difficulty must be a whole number' } }, expectedHours: Number, status: String, hasAchievements: Boolean, hasPlatinum: Boolean, goal: String, earned: Number, total: Number, completion: { platinum: Boolean, base: Boolean, all: Boolean, manual: Boolean, completedOn: String }, notes: String, notebook: { type: Schema.Types.Mixed, default: () => ({ revision: 0, sections: [{ id: 'general', title: 'General' }], items: [] }) } }, opts),
  }
  schemas.Hunt.index({ userId: 1, gameId: 1, platformId: 1, service: 1, variant: 1 }, { unique: true })
  schemas.LibraryGame.index({ userId: 1, title: 1 })
  return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, connection.models[name] || connection.model(name, schema)]))
}
module.exports = { createModels }
