const express = require("express");
const router = express.Router();
const Player = require("../models/Player");
const multer = require("multer");
const protect = require("../middleware/auth");
const User = require("../models/User");

const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");

// Cloudinary storage config
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uybfc_players",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
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

// POST add player (with avatar)
router.post("/", protect, upload.single("avatar"), async (req, res) => {
  try {
    const { name } = req.body;

    const player = await Player.create({
      name,
      avatar: req.file ? req.file.path : "",
    });

    res.status(201).json(player);
  } catch (err) {
    res.status(500).json({ message: "Failed to add player" });
  }
});

// PUT update player (with avatar)
router.put("/:id", protect, upload.single("avatar"), async (req, res) => {
  try {
    const update = {
      name: req.body.name,
      goals: Number(req.body.goals) || 0,
      assists: Number(req.body.assists) || 0,
      played: Number(req.body.played) || 0,
      yellowCards: Number(req.body.yellowCards) || 0,
      redCards: Number(req.body.redCards) || 0,
      paid: Number(req.body.paid) || 0,
    };

    if (req.file) {
      update.avatar = req.file.path;
    }

    const updated = await Player.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update player" });
  }
});

// DELETE player (and linked user)
router.delete("/:id", protect, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }

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
