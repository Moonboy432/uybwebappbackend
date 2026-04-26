const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    played: { type: Number, default: 0 },
    debt: { type: Number, default: 0 },
    yellowCards: { type: Number, default: 0 }, // ✅ new
    redCards: { type: Number, default: 0 }, // ✅ new
    position: { type: String },
    avatar: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Player", playerSchema);
