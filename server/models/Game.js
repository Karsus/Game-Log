const mongoose = require('mongoose')

const GameSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    game_catalogue_id: {
      type: String,
      required: true,
    },
    user_id: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    rating: {
      type: String,
      required: true,
    },
    hours_played: {
      type: String,
      required: true,
    },
    review: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Game', GameSchema)
