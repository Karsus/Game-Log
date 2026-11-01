const express = require('express')
const multer = require('multer')
const sharp = require('sharp')
const { v2: cloudinary } = require('cloudinary')
const { randomUUID } = require('node:crypto')
const { rateLimit } = require('express-rate-limit')
const { asyncRoute: route, httpError } = require('./domain/security')

const IMAGE_LIMITS = Object.freeze({ maxBytes: 10 * 1024 * 1024, formats: ['image/jpeg', 'image/png', 'image/webp'], maxPixels: 40000000 })
const unavailable = () => httpError(503, 'Image uploads are not configured yet. You can still use an image URL.')

// libvips can expose only the first frame of APNG. Inspect animation chunks as
// well as decoded metadata so an animated upload is never silently flattened.
function hasAnimationChunks(buffer, format) {
  let offset = format === 'png' ? 8 : 12
  while (offset + 8 <= buffer.length) {
    const length = format === 'png' ? buffer.readUInt32BE(offset) : buffer.readUInt32LE(offset + 4)
    const type = buffer.toString('ascii', offset + (format === 'png' ? 4 : 0), offset + (format === 'png' ? 8 : 4))
    if (format === 'png' ? type === 'acTL' : ['ANIM', 'ANMF'].includes(type)) return true
    offset += format === 'png' ? length + 12 : length + 8 + (length % 2)
  }
  return false
}

async function normalizeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw httpError(400, 'Choose a JPEG, PNG, or WebP image.')
  if (buffer.length > IMAGE_LIMITS.maxBytes) throw httpError(413, 'This image is too large (maximum 10 MiB).')
  try {
    const image = sharp(buffer, { limitInputPixels: IMAGE_LIMITS.maxPixels, failOn: 'warning' })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw httpError(400, 'Use a JPEG, PNG, or WebP image.')
    if (metadata.pages > 1 || ['png', 'webp'].includes(metadata.format) && hasAnimationChunks(buffer, metadata.format)) throw httpError(400, 'Animated images are not supported. Choose a still image.')
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > IMAGE_LIMITS.maxPixels) throw httpError(400, 'Images must be no larger than 40 megapixels.')
    // Sharp strips metadata by default; apply orientation before removing EXIF.
    return await image.autoOrient().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
  } catch (error) {
    if (error.status) throw error
    if (/pixel limit/i.test(error.message)) throw httpError(400, 'Images must be no larger than 40 megapixels.')
    throw httpError(400, 'This image could not be read. Choose a valid JPEG, PNG, or WebP image.')
  }
}

function createImageService(env = process.env, { uploader = cloudinary.uploader } = {}) {
  const credentials = { cloud_name: env.CLOUDINARY_CLOUD_NAME?.trim(), api_key: env.CLOUDINARY_API_KEY?.trim(), api_secret: env.CLOUDINARY_API_SECRET?.trim() }
  const configured = Boolean(credentials.cloud_name && credentials.api_key && credentials.api_secret)
  async function upload(buffer, userId) {
    if (!configured) throw unavailable()
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = uploader.upload_stream({ ...credentials, resource_type: 'image', type: 'upload', public_id: `game-log/${userId}/${randomUUID()}`, overwrite: false, format: 'webp', allowed_formats: ['webp'], timeout: 30000 }, (error, value) => error ? reject(error) : resolve(value))
        stream.on('error', reject)
        stream.end(buffer)
      })
      if (typeof result?.secure_url !== 'string' || result.secure_url.length > 2000 || new URL(result.secure_url).protocol !== 'https:') throw new Error('Invalid image response')
      return { url: result.secure_url }
    } catch {
      // Provider messages can contain request details or credentials.
      throw httpError(502, 'The image could not be uploaded. Please try again or use an image URL. Check the image host configuration and usage limits if this continues.')
    }
  }
  return { configured, upload }
}

function imageRouter(images) {
  const router = express.Router()
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, keyGenerator: req => String(req.session.userId), standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many image uploads. Wait 15 minutes before trying again.' } })
  const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMAGE_LIMITS.maxBytes, files: 1, fields: 0, parts: 1 }, fileFilter: (req, file, done) => done(IMAGE_LIMITS.formats.includes(file.mimetype) ? null : httpError(400, 'Use a JPEG, PNG, or WebP image.'), true) }).single('file')
  router.post('/', (req, res, next) => images.configured ? next() : next(unavailable()), limit, (req, res, next) => {
    receive(req, res, error => {
      if (error instanceof multer.MulterError) return next(httpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'This image is too large (maximum 10 MiB).' : 'Send exactly one image in the file field.'))
      if (error && !error.status) return next(httpError(400, 'Invalid image upload. Send one JPEG, PNG, or WebP file.'))
      next(error)
    })
  }, route(async (req, res) => {
    const buffer = await normalizeImage(req.file?.buffer)
    res.status(201).json(await images.upload(buffer, req.session.userId))
  }))
  return router
}

module.exports = { IMAGE_LIMITS, normalizeImage, createImageService, imageRouter }
