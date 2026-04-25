const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    played: { type: Number, default: 0 },
    debt: { type: Number, default: 0 },
    position: { type: String },
    avatar: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // ✅ link to auth account
  },
  { timestamps: true },
);

module.exports = mongoose.model("Player", playerSchema);
