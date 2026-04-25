const mongoose = require("mongoose");

const clubConfigschema = new mongoose.Schema({
  totalMatches: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("ClubConfig", clubConfigschema);