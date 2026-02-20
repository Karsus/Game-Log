const healthCheck = async (req, res) => {
  try {
    res.status(200).json({ status: 'ok', message: 'Game Log API is running' })
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
}

module.exports = { healthCheck }
