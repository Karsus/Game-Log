// An isolated, disposable workspace for local review. Never reads MONGO_URI.
const path = require('node:path')
const mongoose = require('mongoose')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const { createApp } = require('../app')
const { hashPassword } = require('../domain/security')
const v = require('../domain/validation')
async function start() {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '../../.runtime/mongodb')
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  const connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'gamelog-demo' }).asPromise()
  const { app, models: m, sessionStore } = await createApp({ connection, secret: 'local-disposable-demo-only-do-not-deploy', env: { NODE_ENV: 'development', DEMO_MODE: 'true', SITE_URL: 'http://localhost:5041', SERVER_URL: 'http://localhost:4051', PORT: '4051' } })
  const user = await m.Account.create({ name: 'Player One', email: 'demo@gamelog.local', passwordHash: await hashPassword('GameLog-demo-2026!') })
  const rows = [
    ['Gladius', 'gamecube', null, null, 'planned', false],
    ['Uncharted: The Lost Legacy', 'ps4', 4, 20, 'in-progress', true],
    ['A Plague Tale: Innocence', 'ps4', 3, 15, 'priority', true],
    ['Stellar Blade', 'ps5', 4, 50, 'completed', true],
    ['Ghost of Tsushima', 'ps5', 3, 45, 'in-progress', true],
    ['Celeste', 'ps4', 8, 30, 'dropped', true],
    ['Hollow Knight', 'pc', 9, 70, 'planned', false],
    ['The Artful Escape', 'ps5', 1, 5, 'completed', true],
    ['Journey', 'ps4', 2, 6, 'priority', false],
  ]
  for (let index = 0; index < rows.length; index++) {
    const [title, platformId, expectedDifficulty, expectedHours, status, hasPlatinum] = rows[index]
    const game = await m.LibraryGame.create({ ...v.game.parse({ title, releases: [{ platformId }], showOnBoard: title !== 'Gladius', wishlist: title === 'Hollow Knight', notes: 'Sample record in the disposable demo workspace. Estimates are illustrative.' }), userId: user._id })
    if (title !== 'Hollow Knight') await m.GameCopy.create({ ...v.copy.parse({ gameId: String(game._id), platformId, format: index % 2 ? 'digital' : 'physical', storefront: platformId === 'pc' ? 'steam' : '', condition: 'good' }), userId: user._id })
    if (title === 'Gladius') await m.GameCopy.create({ ...v.copy.parse({ gameId: String(game._id), platformId: 'xbox', format: 'digital' }), userId: user._id })
    const service = platformId.startsWith('ps') ? 'playstation' : platformId === 'pc' ? 'steam' : 'none', goal = hasPlatinum ? 'platinum' : service === 'none' ? 'manual' : 'base'
    const hunt = await m.Hunt.create({ ...v.hunt.parse({ gameId: String(game._id), platformId, service, expectedDifficulty, expectedHours, status, hasPlatinum, hasAchievements: service !== 'none', goal, earned: status === 'completed' ? 40 : index * 3, total: 40, completion: { [goal]: status === 'completed', completedOn: status === 'completed' ? '2026-10-20' : '' } }), userId: user._id, createdAt: new Date(2026, 8, index + 1) })
    if (title === 'Uncharted: The Lost Legacy') {
      hunt.notebook = v.notebook.parse({ formatVersion: 2, revision: 0,
        trophies: [{ id: 'story', title: 'Finish the adventure', done: false }, { id: 'treasures', title: 'Find every treasure', done: false }, { id: 'photos', title: 'Take every photo', done: false }, { id: 'conversations', title: 'Hear every conversation', done: false }],
        sections: [{ id: 'ch1', title: 'Chapter 1' }, { id: 'ch2', title: 'Chapter 2' }, { id: 'ch3', title: 'Chapter 3' }, { id: 'collectibles', title: 'Collectibles route' }], items: [
        { id: 'finish', trophyId: 'story', title: 'Complete the game', done: false },
        { id: 'crush', trophyId: 'story', title: 'Finish on Crushing difficulty', missable: false },
        { id: 'chapter1treasures', trophyId: 'treasures', title: 'Search the opening streets', sectionIds: ['ch1', 'collectibles'], mainSectionId: 'ch1' },
        { id: 'treasure1', trophyId: 'treasures', parentId: 'chapter1treasures', title: 'First treasure', mainSectionId: 'ch1', done: true },
        { id: 'photo1', trophyId: 'photos', title: 'Photo opportunity #1', sectionIds: ['ch1'], mainSectionId: 'ch1', done: true },
        { id: 'treasure2', trophyId: 'treasures', title: 'Silver cigarette case', sectionIds: ['ch2', 'collectibles'], mainSectionId: 'ch2', done: false, notes: 'Check the rooftop before moving on.' },
        { id: 'photo2', trophyId: 'photos', title: 'Photo opportunity #2', sectionIds: ['ch2'], mainSectionId: 'ch2', done: false },
        { id: 'conv', trophyId: 'conversations', title: 'Optional conversations', sectionIds: ['ch3'], mainSectionId: 'ch3', type: 'counter', target: 4, current: 2, missable: true },
      ] }); await hunt.save()
    }
  }
  for (const [nickname, color, model] of [['Living room PS5', 'White', 'Standard'], ['Bedroom PS5', 'Black', 'Slim']]) await m.HardwareUnit.create({ ...v.hardware.parse({ platformId: 'ps5', nickname, color, model, storage: '1 TB', condition: 'excellent' }), userId: user._id })
  await m.HardwareUnit.create({ ...v.hardware.parse({ platformId: 'gamecube', nickname: 'Original GameCube', color: 'Indigo', condition: 'good' }), userId: user._id })
  const server = app.listen(4051, '127.0.0.1', () => console.log('Disposable demo API: http://localhost:4051'))
  const { pathToFileURL } = require('node:url')
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [path.join(__dirname, '../../client')] })).href)
  const vite = await createServer({ root: path.join(__dirname, '../../client'), configFile: path.join(__dirname, '../../client/vite.config.js'), server: { host: '127.0.0.1', port: 5041, open: false, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:4051', changeOrigin: true } } } })
  await vite.listen(); console.log('Game Log demo: http://localhost:5041/ (sample data resets on restart)')
  let stopping = false
  async function stop() { if (stopping) return; stopping = true; await vite.close(); await new Promise(resolve => server.close(resolve)); await sessionStore.close(); await connection.close(); await mongo.stop(); process.exit(0) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
start().catch(error => { console.error(error); process.exitCode = 1 })
