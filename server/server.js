require('dotenv').config({ path: require('path').join(__dirname, '..', 'enviroments', '.env') })

const mongoose = require('mongoose')
const cors = require('cors')
const express = require('express')
const path = require('node:path')

const router = require('./routes')

const PORT = process.env.PORT || 80
const MONGO_URI = process.env.MONGO_URI
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const app = express()

// BODY PARSERS
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS
app.use(
  cors({
    origin: [process.env.SITE_URL, process.env.SERVER_URL],
    credentials: true,
  })
)

// REQUEST LOGGER
app.use(function (req, res, next) {
  console.log(req.method, req.path)
  next()
})

// API ROUTES
app.use(router)

// SERVE CLIENT IN PRODUCTION
const clientDist = path.join(__dirname, '..', 'client', 'dist')

if (IS_PRODUCTION) {
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// 404 HANDLER
app.use(function (req, res) {
  res.status(404).json({ error: 'Route not found' })
})

// ERROR HANDLER
app.use(function (err, req, res, next) {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// MONGOOSE EVENTS
mongoose.set('strictQuery', true)

mongoose.connection.on('connected', function () {
  console.log('Mongoose connected')
})

mongoose.connection.on('error', function (error) {
  console.log('Mongoose error:', error)
})

// CONNECT TO DB AND START SERVER
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('DB Connected')
  })
  .catch(error => {
    console.log('DB Connection Error:', error)
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log('Server connected on port:', PORT)
    })
  })
