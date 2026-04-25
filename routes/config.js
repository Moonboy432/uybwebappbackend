const express = require("express");
const router = express.Router();
const ClubConfig = require("../models/ClubConfig");
const protect  = require("../middleware/auth");

router.get("/", protect, async (req, res) => {
  try {
    let config = await ClubConfig.findOne();

    if (!config) {
      config = await ClubConfig.create({ totalMatches: 0 });
    }
    
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch config" });
  }
});

router.put("/", protect, async (req, res) => {
  try {
    let config = await ClubConfig.findOne();

    if (!config) {
      config = await ClubConfig.create({
        totalMatches: req.body.totalMatches,
      });
    } else {
      config.totalMatches = req.body.totalMatches;
      await config.save();
    }

    res.json(config);
  } catch (err) {
    res.status(500).json({ message: "Failed to update config" });
  }
});


module.exports = router;