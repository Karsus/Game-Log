const mongoose = require('mongoose')

const ExampleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Example', ExampleSchema)
