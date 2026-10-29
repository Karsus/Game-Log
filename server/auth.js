const express = require('express')
const { randomBytes } = require('node:crypto')
const nodemailer = require('nodemailer')
const { rateLimit } = require('express-rate-limit')
const { z } = require('./domain/validation')
const { asyncRoute: route, httpError, hashPassword, verifyPassword, safeUser, digest } = require('./domain/security')
const email = z.string().trim().toLowerCase().email().max(254)
const password = z.string().min(10, 'Use at least 10 characters').max(200)
function authRouter({ models, env, sessionCollection }) {
  const router = express.Router(), Account = models.Account
  const dummyHash = hashPassword(randomBytes(32).toString('hex'))
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.NODE_ENV === 'test' ? 1000 : 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please try again in 15 minutes.' } })
  const requireUser = (req, res, next) => req.session.userId ? next() : next(httpError(401, 'Please sign in'))
  async function establish(req, user) {
    await new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()))
    req.session.userId = String(user._id); req.session.csrf = randomBytes(24).toString('hex')
    await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()))
  }
  router.get('/session', route(async (req, res) => {
    if (!req.session.csrf) req.session.csrf = randomBytes(24).toString('hex')
    const user = req.session.userId ? await Account.findById(req.session.userId).lean() : null
    if (!user) delete req.session.userId
    res.json({ user: user ? safeUser(user) : null, csrf: req.session.csrf, recoveryAvailable: !!env.SMTP_HOST, demoMode: env.DEMO_MODE === 'true' })
  }))
  router.post('/register', limit, route(async (req, res) => {
    const value = z.object({ name: z.string().trim().min(1).max(100), email, password }).parse(req.body)
    if (env.ALLOW_REGISTRATION === 'false') throw httpError(403, 'Registration is disabled on this server')
    const user = await Account.create({ name: value.name, email: value.email, passwordHash: await hashPassword(value.password) })
    await establish(req, user); res.status(201).json({ user: safeUser(user), csrf: req.session.csrf })
  }))
  router.post('/login', limit, route(async (req, res) => {
    const value = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body)
    const user = await Account.findOne({ email: value.email }).select('+passwordHash')
    const valid = await verifyPassword(value.password, user?.passwordHash || await dummyHash)
    if (!user || !valid) throw httpError(401, 'Email or password is incorrect')
    await establish(req, user); res.json({ user: safeUser(user), csrf: req.session.csrf })
  }))
  router.post('/logout', route(async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(e => e ? reject(e) : resolve()))
    res.clearCookie('gamelog.sid', { path: '/' }); res.json({ ok: true })
  }))
  async function revokeSessions(userId) {
    // connect-mongo stores sessions as objects (stringify: false), so revocation is indexed by user identity.
    await sessionCollection.deleteMany({ 'session.userId': String(userId) })
  }
  router.post('/password', requireUser, limit, route(async (req, res) => {
    const value = z.object({ currentPassword: z.string().max(200), password }).parse(req.body)
    const user = await Account.findById(req.session.userId).select('+passwordHash')
    if (!user || !await verifyPassword(value.currentPassword, user.passwordHash)) throw httpError(400, 'Current password is incorrect')
    user.passwordHash = await hashPassword(value.password); user.resetHash = undefined; user.resetExpires = undefined; await user.save()
    await revokeSessions(user._id); await establish(req, user); res.json({ ok: true, csrf: req.session.csrf })
  }))
  router.post('/forgot-password', limit, route(async (req, res) => {
    const value = z.object({ email }).parse(req.body)
    if (!env.SMTP_HOST) throw httpError(503, 'Email recovery is not configured. Contact the server owner.')
    const user = await Account.findOne({ email: value.email })
    if (user) {
      const token = randomBytes(32).toString('hex')
      user.resetHash = digest(token); user.resetExpires = new Date(Date.now() + 30 * 60000); await user.save()
      const mail = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}) })
      try { await mail.sendMail({ from: env.SMTP_FROM, to: user.email, subject: 'Reset your Game Log password', text: `Use this link within 30 minutes to reset your password:\n${env.SITE_URL || 'http://localhost:5040'}/reset-password?token=${token}\nIf you did not request this, ignore this email.` }) }
      catch { console.error('Password recovery email could not be delivered') }
    }
    res.json({ message: 'If an account exists for that address, a reset link will be sent.' })
  }))
  router.post('/reset-password', limit, route(async (req, res) => {
    const value = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).parse(req.body)
    const passwordHash = await hashPassword(value.password)
    const user = await Account.findOneAndUpdate({ resetHash: digest(value.token), resetExpires: { $gt: new Date() } }, { $set: { passwordHash }, $unset: { resetHash: '', resetExpires: '' } })
    if (!user) throw httpError(400, 'This reset link has expired or was already used')
    await revokeSessions(user._id); res.json({ ok: true })
  }))
  return { router, requireUser }
}
module.exports = { authRouter }
