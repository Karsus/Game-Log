const { scrypt, randomBytes, timingSafeEqual, createHash } = require('node:crypto')
const { promisify } = require('node:util')
const derive = promisify(scrypt)
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 })
  return `${salt}:${key.toString('hex')}`
}
async function verifyPassword(password, hash) {
  if (!hash) return false
  const [salt, expected] = hash.split(':')
  const key = await derive(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 })
  const actual = Buffer.from(expected || '', 'hex')
  return actual.length === key.length && timingSafeEqual(actual, key)
}
const digest = value => createHash('sha256').update(value).digest('hex')
const safeUser = user => ({ _id: String(user._id), name: user.name, email: user.email, preferences: user.preferences })
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
function httpError(status, message) { return Object.assign(new Error(message), { status }) }
function reconcileHunt(value, patch = {}) {
  if (value.total !== null && value.earned > value.total) throw httpError(400, 'Earned achievements cannot exceed the total')
  if (!value.hasAchievements) {
    value.hasPlatinum = false; value.goal = 'manual'; value.earned = 0; value.total = null
    value.completion.platinum = false; value.completion.base = false; value.completion.all = false
  }
  if (value.service !== 'playstation') value.hasPlatinum = false
  if (!value.hasPlatinum) {
    value.completion.platinum = false
    if (value.goal === 'platinum') value.goal = value.hasAchievements ? 'base' : 'manual'
  }
  if (patch.status !== undefined) {
    value.completion[value.goal] = value.status === 'completed'
  } else if (value.completion[value.goal]) value.status = 'completed'
  else if (value.status === 'completed') value.status = 'in-progress'
  if (value.status === 'completed' && !value.completion.completedOn) value.completion.completedOn = new Date().toISOString().slice(0, 10)
  if (value.status !== 'completed') value.completion.completedOn = ''
  return value
}
module.exports = { hashPassword, verifyPassword, digest, safeUser, asyncRoute, httpError, reconcileHunt }
