const mongoose = require('mongoose')

const Game_catalogueSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    cover: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    //release dates per platform, platform_id and release_date
    release_dates: {
      type: Array,
      required: true,
      platform_id: {
        type: String,
        required: true,
      },
      release_date: {
        type: String,
        required: true,
      },
    },
    developer: {
      type: String,
      required: true,
    },
    publisher: {
      type: String,
      required: true,
    },
    price: {
      type: String,
      required: true,
    },
    stock: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Game_catalogue', Game_catalogueSchema)
