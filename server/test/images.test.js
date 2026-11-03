const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { Writable } = require('node:stream')
const { deflateSync } = require('node:zlib')
const path = require('node:path')
const mongoose = require('mongoose')
const request = require('supertest')
const sharp = require('sharp')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const { createApp } = require('../app')
const { IMAGE_LIMITS, normalizeImage, createImageService } = require('../images')

const credentials = { CLOUDINARY_CLOUD_NAME: 'image-tests', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'private-test-secret' }
let mongo, connection, app, alice, bob, smallPng, providerFailure = false
const stores = [], uploads = []
const uploader = {
  upload_stream(options, callback) {
    const chunks = []
    return new Writable({
      write(chunk, encoding, done) { chunks.push(chunk); done() },
      final(done) {
        uploads.push({ options, buffer: Buffer.concat(chunks) })
        if (providerFailure) callback(new Error(`Provider unavailable: ${credentials.CLOUDINARY_API_SECRET}`))
        else callback(null, { secure_url: `https://res.cloudinary.com/image-tests/image/upload/v1/test-${uploads.length}.webp` })
        done()
      },
    })
  },
}
const service = createImageService(credentials, { uploader })
const post = (user, route, body) => user.agent.post(`/api${route}`).set('X-CSRF-Token', user.csrf).send(body)
const upload = (user, bytes = smallPng, filename = 'photo.png', contentType = 'image/png') => user.agent.post('/api/images').set('X-CSRF-Token', user.csrf).attach('file', bytes, { filename, contentType })
async function account(email, target = app) {
  const agent = request.agent(target)
  const session = await agent.get('/api/auth/session').expect(200)
  const result = await agent.post('/api/auth/register').set('X-CSRF-Token', session.body.csrf).send({ name: 'Image tester', email, password: 'Images-Test-Password-2026!' }).expect(201)
  return { agent, csrf: result.body.csrf, id: result.body.user._id }
}
async function image(width, height, format = 'png') {
  return sharp({ create: { width, height, channels: 4, background: { r: 20, g: 100, b: 180, alpha: 0.5 } } }).toFormat(format).toBuffer()
}
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}
function animatedPng() {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2, 0)
  const frame = sequence => {
    const data = Buffer.alloc(26)
    data.writeUInt32BE(sequence, 0); data.writeUInt32BE(1, 4); data.writeUInt32BE(1, 8)
    data.writeUInt16BE(1, 20); data.writeUInt16BE(10, 22)
    return chunk('fcTL', data)
  }
  const secondSequence = Buffer.alloc(4); secondSequence.writeUInt32BE(2)
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('acTL', animation), frame(0),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), frame(1),
    chunk('fdAT', Buffer.concat([secondSequence, deflateSync(Buffer.from([0, 0, 0, 255, 255]))])), chunk('IEND', Buffer.alloc(0)),
  ])
}

before(async () => {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '../../.runtime/mongodb')
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'gamelog-image-tests' }).asPromise()
  const result = await createApp({ connection, secret: 'image-tests-session-secret', env: { NODE_ENV: 'test' }, images: service })
  app = result.app; stores.push(result.sessionStore)
  alice = await account('image-alice@example.com'); bob = await account('image-bob@example.com')
  smallPng = await image(24, 12)
}, { timeout: 180000 })
after(async () => {
  for (const store of stores) await store.close()
  if (connection) await connection.close()
  if (mongo) await mongo.stop()
})

test('normalization accepts JPEG, PNG and WebP contents, preserves small dimensions and transparency', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const output = await normalizeImage(await image(24, 12, format))
    const metadata = await sharp(output).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 24); assert.equal(metadata.height, 12)
    if (format !== 'jpeg') assert.equal(metadata.hasAlpha, true)
  }
})

test('normalization limits dimensions, applies orientation and removes embedded metadata', async () => {
  const large = await normalizeImage(await image(3200, 800))
  const resized = await sharp(large).metadata()
  assert.equal(resized.width, 1600); assert.equal(resized.height, 400)
  const oriented = await sharp(await image(80, 40, 'jpeg')).withMetadata({ orientation: 6 }).toBuffer()
  assert.ok((await sharp(oriented).metadata()).exif)
  const result = await sharp(await normalizeImage(oriented)).metadata()
  assert.equal(result.width, 40); assert.equal(result.height, 80)
  assert.equal(result.orientation, undefined); assert.equal(result.exif, undefined); assert.equal(result.icc, undefined)
})

test('normalization rejects invalid bytes, unsupported image contents and excessive declared dimensions', async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('not an image'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'), await image(1, 1, 'tiff')]) {
    await assert.rejects(normalizeImage(bytes), error => error.status === 400)
  }
  // A hostile PNG declares 48 MP before decompression; no large test allocation is needed.
  const oversized = Buffer.from(smallPng)
  oversized.writeUInt32BE(8000, 16); oversized.writeUInt32BE(6000, 20)
  oversized.writeUInt32BE(crc32(oversized.subarray(12, 29)), 29)
  await assert.rejects(normalizeImage(oversized), error => error.status === 400 && /40|pixel/i.test(error.message))
})

test('normalization rejects APNG and animated WebP instead of silently taking the first frame', async () => {
  await assert.rejects(normalizeImage(animatedPng()), error => error.status === 400)
  const gif = Buffer.from('47494638396101000100800000ff00000000ff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b', 'hex')
  assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 2)
  const webp = await sharp(gif, { animated: true }).webp({ lossless: true }).toBuffer()
  assert.equal((await sharp(webp, { animated: true }).metadata()).pages, 2)
  await assert.rejects(normalizeImage(webp), error => error.status === 400)
})

test('bootstrap exposes image capabilities but no Cloudinary credentials; CSP permits local previews', async () => {
  const result = await alice.agent.get('/api/bootstrap').expect(200)
  assert.deepEqual(result.body.imageUploads, { available: true, ...IMAGE_LIMITS })
  assert.match(result.headers['content-security-policy'], /img-src[^;]*blob:/)
  assert.ok(!JSON.stringify(result.body).includes(credentials.CLOUDINARY_API_SECRET))
  assert.ok(!JSON.stringify(result.body).includes(credentials.CLOUDINARY_API_KEY))
})

test('uploads require authentication, CSRF and a permitted origin before reaching the provider', async () => {
  const beforeUploads = uploads.length
  const anonymous = request.agent(app)
  const session = await anonymous.get('/api/auth/session').expect(200)
  await anonymous.post('/api/images').set('X-CSRF-Token', session.body.csrf).attach('file', smallPng, 'photo.png').expect(401)
  await alice.agent.post('/api/images').attach('file', smallPng, 'photo.png').expect(403)
  await alice.agent.post('/api/images').set('X-CSRF-Token', alice.csrf).set('Origin', 'https://untrusted.example').attach('file', smallPng, 'photo.png').expect(403)
  assert.equal(uploads.length, beforeUploads)
})

test('multipart upload sends normalized pixels with unique server-generated asset names and returns only a URL', async () => {
  const first = await upload(alice, await image(1800, 900), 'personal-original-name.png').expect(201)
  const firstUpload = uploads.at(-1)
  const second = await upload(alice).expect(201)
  assert.deepEqual(Object.keys(first.body), ['url'])
  assert.match(first.body.url, /^https:\/\/res\.cloudinary\.com\//)
  assert.notEqual(first.body.url, second.body.url)
  assert.ok(firstUpload.options.public_id)
  assert.notEqual(firstUpload.options.public_id, uploads.at(-1).options.public_id)
  assert.ok(!firstUpload.options.public_id.includes('personal-original-name'))
  assert.equal(firstUpload.options.resource_type, 'image')
  assert.equal(firstUpload.options.overwrite, false)
  const metadata = await sharp(firstUpload.buffer).metadata()
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 1600); assert.equal(metadata.height, 800)
})

test('malformed multipart, extra files, spoofed image contents and oversized uploads never reach Cloudinary', async () => {
  const beforeUploads = uploads.length
  await post(alice, '/images', {}).expect(400)
  await alice.agent.post('/api/images').set('X-CSRF-Token', alice.csrf).set('Content-Type', 'multipart/form-data').send('missing boundary').expect(400)
  const truncated = '--qa-boundary\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\ntruncated'
  await alice.agent.post('/api/images').set('X-CSRF-Token', alice.csrf).set('Content-Type', 'multipart/form-data; boundary=qa-boundary').send(truncated).expect(400)
  await alice.agent.post('/api/images').set('X-CSRF-Token', alice.csrf).attach('wrong', smallPng, 'photo.png').expect(400)
  await upload(alice).attach('file', smallPng, 'second.png').expect(400)
  await upload(alice, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'spoof.png', 'image/png').expect(400)
  await upload(alice, Buffer.from('https://example.com/photo.png'), 'photo.png', 'image/png').expect(400)
  await upload(alice, animatedPng()).expect(400)
  await upload(alice, Buffer.alloc(IMAGE_LIMITS.maxBytes + 1)).expect(413)
  assert.equal(uploads.length, beforeUploads)
})

test('provider failures are sanitized and a subsequent request can succeed', async () => {
  providerFailure = true
  try {
    const response = await upload(alice).expect(502)
    assert.ok(response.body.error)
    assert.ok(!JSON.stringify(response.body).includes(credentials.CLOUDINARY_API_SECRET))
  } finally { providerFailure = false }
  await upload(alice).expect(201)
})

test('upload rate limit applies to an account independently of another account on the same IP', async () => {
  const limited = await account('image-limited@example.com'), other = await account('image-other@example.com')
  for (let attempt = 0; attempt < 30; attempt++) await upload(limited).expect(201)
  const beforeUploads = uploads.length
  const response = await upload(limited).expect(429)
  assert.ok(response.headers['retry-after'])
  assert.equal(uploads.length, beforeUploads)
  await upload(other).expect(201)
})

test('uploaded URLs persist in games and hardware and survive backup export/import without binary data', async () => {
  const uploaded = await upload(bob).expect(201), url = uploaded.body.url
  const game = (await post(bob, '/games', { title: 'Uploaded cover', cover: url }).expect(201)).body
  const hardware = (await post(bob, '/hardware', { platformId: 'ps5', nickname: 'Uploaded photo', image: url }).expect(201)).body
  const state = (await bob.agent.get('/api/bootstrap').expect(200)).body
  assert.equal(state.games.find(entry => entry._id === game._id).cover, url)
  assert.equal(state.hardware.find(entry => entry._id === hardware._id).image, url)
  const backup = (await bob.agent.get('/api/backups/export').expect(200)).body
  assert.equal(backup.version, 1)
  assert.equal(backup.games[0].cover, url); assert.equal(backup.hardware[0].image, url)
  const recipient = await account('image-import@example.com')
  await post(recipient, '/backups/preview', backup).expect(200)
  await post(recipient, '/backups/import', backup).expect(201)
  const restored = (await recipient.agent.get('/api/bootstrap').expect(200)).body
  assert.equal(restored.games[0].cover, url); assert.equal(restored.hardware[0].image, url)
  const beforeUploads = uploads.length
  await bob.agent.patch(`/api/games/${game._id}`).set('X-CSRF-Token', bob.csrf).send({ cover: '' }).expect(200)
  await bob.agent.delete(`/api/hardware/${hardware._id}`).set('X-CSRF-Token', bob.csrf).expect(200)
  assert.equal(uploads.length, beforeUploads)
  assert.equal(backup.games[0].cover, url)
})

test('missing Cloudinary configuration disables uploads while direct image URLs and existing backups still work', async () => {
  const unavailable = createImageService({})
  assert.equal(unavailable.configured, false)
  const result = await createApp({ connection, secret: 'image-tests-session-secret', env: { NODE_ENV: 'test' }, images: unavailable })
  stores.push(result.sessionStore)
  const user = await account('image-disabled@example.com', result.app)
  const state = await user.agent.get('/api/bootstrap').expect(200)
  assert.equal(state.body.imageUploads.available, false)
  await upload(user).expect(503)
  const cover = 'https://images.igdb.com/igdb/image/upload/t_cover_big/example.jpg'
  const saved = await post(user, '/games', { title: 'Existing URL', cover }).expect(201)
  assert.equal(saved.body.cover, cover)
  const backup = (await user.agent.get('/api/backups/export').expect(200)).body
  const recipient = await account('image-disabled-import@example.com', result.app)
  await post(recipient, '/backups/preview', backup).expect(200)
})

test('Cloudinary service rejects non-HTTPS or malformed provider responses', async () => {
  for (const secure_url of [undefined, 'http://res.cloudinary.com/image-tests/photo.webp', 'not-a-url']) {
    const invalid = createImageService(credentials, { uploader: {
      upload_stream(options, callback) { return new Writable({ write(chunk, encoding, done) { done() }, final(done) { callback(null, { secure_url }); done() } }) },
    } })
    await assert.rejects(invalid.upload(Buffer.from('already-normalized'), alice.id), error => error.status === 502)
  }
})
