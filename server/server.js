require('dotenv').config({ path: require('node:path').join(__dirname, '..', 'enviroments', '.env') })
const mongoose = require('mongoose')
const { randomBytes } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createApp } = require('./app')
async function start() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in enviroments/.env before starting the server')
  let secret = process.env.SESSION_SECRET
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('Set SESSION_SECRET before production startup')
  if (!secret) {
    const dir = path.join(__dirname, '..', '.runtime'), file = path.join(dir, 'session-secret')
    fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(48).toString('hex'), { mode: 0o600 })
    secret = fs.readFileSync(file, 'utf8')
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
  const { app } = await createApp({ connection: mongoose.connection, secret })
  const port = Number(process.env.PORT || 4050)
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Game Log API: http://localhost:${port}`))
  const stop = () => server.close(async () => { await mongoose.disconnect(); process.exit(0) })
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
start().catch(error => { console.error(error.name === 'MongooseServerSelectionError' ? 'Cannot reach MongoDB. Check MONGO_URI, network access, and the database IP allowlist.' : error.message); process.exitCode = 1; mongoose.disconnect() })
