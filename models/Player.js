const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    played: { type: Number, default: 0 },
    paid: { type: Number, default: 0 }, // ✅ replaces debt — debt is derived: (played × 200) - paid
    yellowCards: { type: Number, default: 0 },
    redCards: { type: Number, default: 0 },
    position: { type: String },
    cleanSheets : {type: Number, default: 0 },
    avatar: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Player", playerSchema);
