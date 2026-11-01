const express = require('express')
const { Types } = require('mongoose')
const { randomUUID } = require('node:crypto')
const v = require('./domain/validation')
const { asyncRoute: route, httpError, reconcileHunt, safeUser } = require('./domain/security')
const { PLATFORM_CATALOG } = require('./domain/constants')
const { wholeDifficulty, wholeDifficultyFilter } = require('./domain/difficulty')
const record = (schema, extra = {}) => schema.extend({ _id: v.z.string().min(1).max(100), createdAt: v.z.string().datetime().optional(), ...extra })
const backupSchema = v.z.object({ version: v.z.literal(1), exportedAt: v.z.string().optional(), platforms: v.z.array(record(v.platform)).max(200), games: v.z.array(record(v.game)).max(5000), copies: v.z.array(record(v.copy)).max(10000), hardware: v.z.array(record(v.hardware)).max(5000), hunts: v.z.array(record(v.hunt, { notebook: v.notebook })).max(5000), preferences: v.preferences, memberships: v.memberships.optional() })
function validateBackup(body) {
  // Older version-1 backups remain importable; only legacy difficulty is normalized.
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    body = structuredClone(body)
    if (Array.isArray(body.hunts)) for (const hunt of body.hunts) if (hunt && typeof hunt === 'object') hunt.expectedDifficulty = wholeDifficulty(hunt.expectedDifficulty)
    for (const scope of ['catalog', 'hunts']) if (body.preferences?.[scope] && typeof body.preferences[scope] === 'object') body.preferences[scope].difficulty = wholeDifficultyFilter(body.preferences[scope].difficulty)
  }
  const data = backupSchema.parse(body), platformIds = new Set(PLATFORM_CATALOG.map(p => p._id)), gameIds = new Set()
  for (const key of ['platforms', 'games', 'copies', 'hardware', 'hunts']) if (new Set(data[key].map(x => x._id)).size !== data[key].length) throw httpError(400, `Duplicate IDs in ${key}`)
  data.platforms.forEach(p => platformIds.add(p._id)); data.games.forEach(g => gameIds.add(g._id))
  for (const entry of [...data.copies, ...data.hardware, ...data.hunts]) {
    if (!platformIds.has(entry.platformId)) throw httpError(400, 'Backup contains an unknown platform')
    if (entry.gameId && !gameIds.has(entry.gameId)) throw httpError(400, 'Backup contains an unknown game')
  }
  for (const g of data.games) for (const id of [...g.wishlistPlatforms, ...g.releases.map(r => r.platformId)]) if (!platformIds.has(id)) throw httpError(400, 'Backup game contains an unknown platform')
  const keys = new Set()
  for (const h of data.hunts) { reconcileHunt(h); const key = JSON.stringify([h.gameId, h.platformId, h.service, h.variant]); if (keys.has(key)) throw httpError(400, 'Backup contains duplicate hunts'); keys.add(key) }
  return data
}
function backupRouter(m) {
  const router = express.Router(), counts = data => Object.fromEntries(['platforms', 'games', 'copies', 'hardware', 'hunts'].map(k => [k, data[k].length]))
  router.get('/export', route(async (req, res) => {
    const filter = { userId: req.session.userId }
    const [platforms, games, copies, hardware, hunts, account] = await Promise.all([m.PlatformRecord.find(filter).lean(), m.LibraryGame.find(filter).lean(), m.GameCopy.find(filter).lean(), m.HardwareUnit.find(filter).lean(), m.Hunt.find(filter).lean(), m.Account.findById(req.session.userId).lean()])
    const clean = entries => entries.map(({ userId, __v, updatedAt, ...value }) => value)
    res.json({ version: 1, exportedAt: new Date().toISOString(), platforms: clean(platforms), games: clean(games), copies: clean(copies), hardware: clean(hardware), hunts: clean(hunts), preferences: account.preferences, memberships: safeUser(account).memberships })
  }))
  router.post('/preview', route(async (req, res) => {
    const data = validateBackup(req.body), restoresMemberships = data.memberships !== undefined
    res.json({ counts: counts(data), mode: 'add', restoresMemberships, ...(restoresMemberships ? { memberships: data.memberships } : {}), message: `Import creates new collection records and restores saved preferences. ${restoresMemberships ? 'Membership settings will also be restored from this backup.' : 'Your current membership settings will be preserved.'}` })
  }))
  router.post('/import', route(async (req, res) => {
    const data = validateBackup(req.body), userId = req.session.userId
    const platforms = new Map(data.platforms.map(p => [p._id, `custom-${randomUUID()}`])), games = new Map(data.games.map(g => [g._id, new Types.ObjectId()]))
    const platformId = id => platforms.get(id) || id
    const strip = value => { const { _id, ...rest } = value; return rest }
    await m.Account.db.transaction(async session => {
      if (data.platforms.length) await m.PlatformRecord.insertMany(data.platforms.map(p => ({ ...strip(p), _id: platforms.get(p._id), userId })), { session })
      if (data.games.length) await m.LibraryGame.insertMany(data.games.map(g => ({ ...strip(g), _id: games.get(g._id), userId, wishlistPlatforms: g.wishlistPlatforms.map(platformId), releases: g.releases.map(r => ({ ...r, platformId: platformId(r.platformId) })) })), { session })
      for (const [key, Model] of [['copies', m.GameCopy], ['hardware', m.HardwareUnit], ['hunts', m.Hunt]]) if (data[key].length) await Model.insertMany(data[key].map(r => ({ ...strip(r), userId, platformId: platformId(r.platformId), ...(r.gameId ? { gameId: games.get(r.gameId) } : {}), ...(key === 'hunts' ? { notebook: { ...r.notebook, revision: 0 } } : {}) })), { session })
      const preferences = { ...data.preferences }
      for (const key of ['catalog', 'hunts']) if (preferences[key]) preferences[key] = { ...preferences[key], platforms: preferences[key].platforms.map(platformId) }
      await m.Account.updateOne({ _id: userId }, { $set: { preferences, ...(data.memberships !== undefined ? { memberships: data.memberships } : {}) } }, { session })
    })
    res.status(201).json({ counts: counts(data) })
  }))
  return router
}
module.exports = { backupRouter, validateBackup }
