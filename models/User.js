const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  position: { type: String },
  role: { type: String, enum: ["admin", "player"], default: "player" },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);