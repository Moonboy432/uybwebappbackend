const express = require("express");
const router = express.Router();
const Player = require("../models/Player");
const protect = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const User = require("../models/User");

// Multer config — saves to /uploads folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// GET all players
router.get("/", protect, async (req, res) => {
  try {
    const players = await Player.find();
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch players" });
  }
});

// POST add player (with optional avatar)
router.post("/", protect, upload.single("avatar"), async (req, res) => {
  const { name } = req.body;
  const avatar = req.file
    ? `${process.env.BASE_URL || "http://localhost:8000"}/uploads/${req.file.filename}`
    : "";
  try {
    const player = await Player.create({ name, avatar });
    res.status(201).json(player);
  } catch (err) {
    res.status(500).json({ message: "Failed to add player" });
  }
});

// PUT update player (with optional avatar)
router.put("/:id", protect, upload.single("avatar"), async (req, res) => {
  try {
    const update = {
      name: req.body.name,
      goals: Number(req.body.goals) || 0,
      assists: Number(req.body.assists) || 0,
      played: Number(req.body.played) || 0,
      yellowCards: Number(req.body.yellowCards) || 0,
      redCards: Number(req.body.redCards) || 0,
      paid: Number(req.body.paid) || 0, // ✅ replaces debt
    };
    if (req.file)
      update.avatar = `${process.env.BASE_URL || "http://localhost:8000"}/uploads/${req.file.filename}`;

    const updated = await Player.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update player" });
  }
});

// DELETE player
router.delete("/:id", protect, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: "Player not found" });

    // delete auth account too if linked
    if (player.userId) {
      await User.findByIdAndDelete(player.userId);
    }

    await Player.findByIdAndDelete(req.params.id);
    res.json({ message: "Player and user account deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete player" });
  }
});

module.exports = router;
