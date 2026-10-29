const mongoose = require('mongoose')

const PlatformSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    logo: {
      type: String,
      required: true,
    },
    images: {
      type: Array,
      required: true,
      url: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        required: true,
      },
    },
    release_date: {
      type: String,
      required: true,
    },
    versions: {
      type: Array,
      required: true,
      name: {
        type: String,
        required: true,
      },
      release_date: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        required: true,
      },
    },
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Platform', PlatformSchema)
