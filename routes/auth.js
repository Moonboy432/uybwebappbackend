const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Player = require("../models/Player");

router.post("/signup", async (req, res) => {
  const { name, email, password, phone, position } = req.body;

  try {
    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      position,
    });

    // Check if a player with this name already exists (e.g. admin pre-added them)
    const existingPlayer = await Player.findOne({ name });
    if (existingPlayer) {
      // ✅ Just link the existing player to this new user account
      existingPlayer.userId = user._id;
      await existingPlayer.save();
    } else {
      // ✅ Create a fresh player document linked to the user
      await Player.create({
        name,
        position,
        goals: 0,
        assists: 0,
        played: 0,
        debt: 0,
        userId: user._id, // ✅ link
      });
    }

    res.status(201).json({
      message: "Account created successfully",
      user,
    });
  } catch (err) {
    res.status(500).json({
      message: "Signup failed",
      error: err.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET not set on server" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.json({
      token,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
});

module.exports = router;
