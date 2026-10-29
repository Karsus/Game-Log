const express = require('express')
const { randomUUID } = require('node:crypto')
const v = require('./domain/validation')
const { asyncRoute: route, httpError, safeUser, reconcileHunt } = require('./domain/security')
function createApi({ models: m, metadata }) {
  const router = express.Router()
  const userFilter = req => ({ userId: req.session.userId })
  async function owned(Model, id, req) {
    v.objectId.parse(id)
    const value = await Model.findOne({ _id: id, ...userFilter(req) })
    if (!value) throw httpError(404, 'Record not found')
    return value
  }
  async function checkPlatform(id, req) {
    if (!await m.PlatformRecord.exists({ _id: id, $or: [{ userId: null }, userFilter(req)] })) throw httpError(400, 'Platform not found')
  }
  async function validateReferences(value, req) {
    if (value.platformId) await checkPlatform(value.platformId, req)
    if (value.gameId) await owned(m.LibraryGame, value.gameId, req)
    for (const id of new Set([...(value.wishlistPlatforms || []), ...(value.releases || []).map(r => r.platformId)])) await checkPlatform(id, req)
  }
  router.get('/bootstrap', route(async (req, res) => {
    const [user, platforms, games, copies, hardware, hunts] = await Promise.all([
      m.Account.findById(req.session.userId).lean(), m.PlatformRecord.find({ $or: [{ userId: null }, userFilter(req)] }).sort({ name: 1 }).lean(),
      m.LibraryGame.find(userFilter(req)).sort({ createdAt: -1 }).lean(), m.GameCopy.find(userFilter(req)).lean(),
      m.HardwareUnit.find(userFilter(req)).lean(), m.Hunt.find(userFilter(req)).lean(),
    ])
    if (!user) throw httpError(401, 'Please sign in again')
    res.json({ user: safeUser(user), platforms, games, copies, hardware, hunts, metadataAvailable: metadata.configured })
  }))
  router.get('/metadata/games', route(async (req, res) => {
    const query = v.z.string().trim().min(2).max(100).parse(req.query.q)
    res.json(await metadata.search(query))
  }))
  router.put('/preferences', route(async (req, res) => {
    const value = v.preferences.parse(req.body)
    const user = await m.Account.findByIdAndUpdate(req.session.userId, { $set: { preferences: value } }, { new: true })
    res.json(safeUser(user))
  }))
  router.post('/platforms', route(async (req, res) => {
    const value = v.platform.parse(req.body)
    res.status(201).json(await m.PlatformRecord.create({ ...value, _id: `custom-${randomUUID()}`, ...userFilter(req) }))
  }))
  for (const [path, Model, schema] of [['games', m.LibraryGame, v.game], ['copies', m.GameCopy, v.copy], ['hardware', m.HardwareUnit, v.hardware], ['hunts', m.Hunt, v.hunt]]) {
    router.post(`/${path}`, route(async (req, res) => {
      let value = schema.parse(req.body)
      await validateReferences(value, req)
      if (path === 'hunts') {
        value = reconcileHunt(value, req.body)
        const enableBoard = v.z.boolean().optional().parse(req.body.enableBoard)
        if (enableBoard) {
          let created
          await Model.db.transaction(async session => {
            ;[created] = await Model.create([{ ...value, ...userFilter(req) }], { session })
            await m.LibraryGame.updateOne({ _id: value.gameId, ...userFilter(req) }, { $set: { showOnBoard: true } }, { session })
          })
          return res.status(201).json(created)
        }
      }
      res.status(201).json(await Model.create({ ...value, ...userFilter(req) }))
    }))
    router.patch(`/${path}/:id`, route(async (req, res) => {
      const doc = await owned(Model, req.params.id, req)
      const patch = Object.fromEntries(Object.entries(req.body).filter(([key]) => key in schema.shape))
      const existing = JSON.parse(JSON.stringify(doc))
      let value = schema.parse({ ...existing, ...patch, ...(path === 'hunts' ? { completion: { ...existing.completion, ...patch.completion } } : {}) })
      if (path === 'hunts') value = reconcileHunt(value, patch)
      await validateReferences(value, req)
      doc.set(value)
      if (path === 'hunts' && v.z.boolean().optional().parse(req.body.enableBoard)) {
        await Model.db.transaction(async session => {
          await doc.save({ session })
          await m.LibraryGame.updateOne({ _id: value.gameId, ...userFilter(req) }, { $set: { showOnBoard: true } }, { session })
        })
      } else await doc.save()
      res.json(doc)
    }))
    router.delete(`/${path}/:id`, route(async (req, res) => {
      const doc = await owned(Model, req.params.id, req)
      if (path === 'games') {
        await Model.db.transaction(async session => {
          await m.GameCopy.deleteMany({ gameId: doc._id, ...userFilter(req) }, { session })
          await m.Hunt.deleteMany({ gameId: doc._id, ...userFilter(req) }, { session })
          await Model.deleteOne({ _id: doc._id, ...userFilter(req) }, { session })
        })
      } else await doc.deleteOne()
      res.json({ ok: true })
    }))
  }
  router.put('/hunts/:id/notebook', route(async (req, res) => {
    const value = v.notebook.parse(req.body)
    await owned(m.Hunt, req.params.id, req)
    const doc = await m.Hunt.findOneAndUpdate({ _id: req.params.id, ...userFilter(req), 'notebook.revision': value.revision }, { $set: { notebook: { ...value, revision: value.revision + 1 } }, $inc: { __v: 1 } }, { new: true })
    if (!doc) throw httpError(409, 'This notebook changed in another window. Reload the latest version before saving again.')
    res.json(doc)
  }))
  router.post('/hunts/:id/copy-notebook', route(async (req, res) => {
    const source = await owned(m.Hunt, req.params.id, req)
    const value = v.z.object({ targetId: v.objectId, revision: v.z.number().int().nonnegative() }).parse(req.body)
    if (value.targetId === req.params.id) throw httpError(400, 'Choose a different hunt')
    const target = await owned(m.Hunt, value.targetId, req)
    const notebook = structuredClone(source.notebook)
    notebook.items = notebook.items.map(i => ({ ...i, done: false, current: 0 }))
    notebook.revision = value.revision + 1
    const result = await m.Hunt.findOneAndUpdate({ _id: target._id, ...userFilter(req), 'notebook.revision': value.revision }, { $set: { notebook }, $inc: { __v: 1 } }, { new: true })
    if (!result) throw httpError(409, 'The destination notebook changed. Reload and try again.')
    res.json(result)
  }))
  return router
}
module.exports = { createApi }
