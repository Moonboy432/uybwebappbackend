const mongoose = require("mongoose");

const teamNames = ["Green", "Blue", "Yellow", "Red"];

const gameDayPlayerSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    playerName: {
      type: String,
      required: true,
    },
    position: {
      type: String,
      default: "",
    },
    entryFee: {
      type: Number,
      default: 200,
      min: 0,
    },
    paymentConfirmed: {
      type: Boolean,
      default: false,
    },
    checkedIn: {
      type: Boolean,
      default: false,
    },
    arrivalTime: {
      type: Date,
      default: null,
    },
    team: {
      type: String,
      enum: [...teamNames, null],
      default: null,
    },
  },
  { _id: false },
);

const gameDaySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    entryFee: {
      type: Number,
      default: 200,
      min: 0,
    },
    maxPlayers: {
      type: Number,
      default: 28,
      min: 1,
      max: 28,
    },
    teamSize: {
      type: Number,
      default: 7,
      min: 1,
      max: 7,
    },
    status: {
      type: String,
      enum: ["upcoming", "active", "closed"],
      default: "upcoming",
    },
    players: {
      type: [gameDayPlayerSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

gameDaySchema.index({ status: 1, date: -1 });

module.exports = mongoose.model("GameDay", gameDaySchema);
