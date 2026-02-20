const express = require('express')
const { healthCheck } = require('../controllers/main')

const router = express.Router()

// GET /api/health
router.get('/health', healthCheck)

module.exports = router
