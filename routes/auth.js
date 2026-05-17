const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Player = require("../models/Player");

// ─────────────────────────────────────────────
// NODEMAILER SETUP
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─────────────────────────────────────────────
// RESET CODE STORE
// ─────────────────────────────────────────────
const resetCodes = {};

// ─────────────────────────────────────────────
// SIGNUP — saves as pending, no player created yet
// ─────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  const { name, email, password, phone, position } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      position,
      status: "pending",
    });

    return res.status(201).json({
      message: "Signup request submitted. Please wait for admin approval.",
    });
  } catch (err) {
    res.status(500).json({ message: "Signup failed", error: err.message });
  }
});

// ─────────────────────────────────────────────
// LOGIN — blocks pending and rejected users
// ─────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.role !== "admin" && user.status === "pending") {
      return res.status(403).json({
        message: "Your account needs to be activated by admin.",
      });
    }

    if (user.role !== "admin" && user.status === "rejected") {
      return res.status(403).json({
        message: "Your signup request was rejected. Please contact the admin.",
      });
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

    return res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res
      .status(500)
      .json({ message: "Login failed", error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET PENDING SIGNUPS — admin only
// ─────────────────────────────────────────────
router.get("/pending", async (req, res) => {
  try {
    const pending = await User.find({ status: "pending" }).select("-password");
    return res.status(200).json(pending);
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to fetch pending users", error: err.message });
  }
});

// ─────────────────────────────────────────────
// APPROVE SIGNUP — creates player, marks approved
// ─────────────────────────────────────────────
router.post("/approve/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.status = "approved";
    await user.save();

    const existingPlayer = await Player.findOne({ name: user.name });
    if (existingPlayer) {
      existingPlayer.userId = user._id;
      await existingPlayer.save();
    } else {
      await Player.create({
        name: user.name,
        position: user.position,
        goals: 0,
        assists: 0,
        played: 0,
        paid: 0,
        yellowCards: 0,
        redCards: 0,
        userId: user._id,
      });
    }

    await transporter.sendMail({
      from: `"UYBFC App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "You're in the squad! ✅",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
          <h2 style="color: #3b82f6;">Welcome to UYBFC, ${user.name}!</h2>
          <p>Your signup has been <strong>approved</strong> by the admin.</p>
          <p>You can now log in to the app and access your player dashboard.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: "User approved successfully." });
  } catch (err) {
    console.error("APPROVE ERROR:", err);
    return res
      .status(500)
      .json({ message: "Approval failed", error: err.message });
  }
});

// ─────────────────────────────────────────────
// REJECT SIGNUP — marks rejected, notifies user
// ─────────────────────────────────────────────
router.post("/reject/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.status = "rejected";
    await user.save();

    await transporter.sendMail({
      from: `"UYBFC App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "UYBFC Signup Update",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
          <h2 style="color: #3b82f6;">Hi ${user.name},</h2>
          <p>Unfortunately your signup request has been <strong>rejected</strong>.</p>
          <p>If you think this is a mistake, please contact the admin directly.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: "User rejected." });
  } catch (err) {
    console.error("REJECT ERROR:", err);
    return res
      .status(500)
      .json({ message: "Rejection failed", error: err.message });
  }
});

// ─────────────────────────────────────────────
// FORGOT PASSWORD — Step 1: Send reset code
// ─────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(200)
        .json({ message: "If that email exists, a code has been sent." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes[email] = {
      code,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };

    await transporter.sendMail({
      from: `"UYBFC App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Password Reset Code",
      text: `Your UYBFC password reset code is: ${code}. It expires in 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
          <h2 style="color: #3b82f6;">Password Reset</h2>
          <p>Use the code below to reset your password. It expires in <strong>15 minutes</strong>.</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111; margin: 24px 0;">
            ${code}
          </div>
          <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: "Reset code sent." });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res
      .status(500)
      .json({ message: "Failed to send reset code.", error: err.message });
  }
});

// ─────────────────────────────────────────────
// VERIFY RESET CODE — Step 2
// ─────────────────────────────────────────────
router.post("/verify-reset-code", async (req, res) => {
  const { email, code } = req.body;

  try {
    const entry = resetCodes[email];

    if (!entry) {
      return res
        .status(400)
        .json({ message: "No reset code found for this email." });
    }

    if (Date.now() > entry.expiresAt) {
      delete resetCodes[email];
      return res
        .status(400)
        .json({ message: "Reset code has expired. Please request a new one." });
    }

    if (entry.code !== code) {
      return res.status(400).json({ message: "Invalid reset code." });
    }

    return res.status(200).json({ message: "Code verified." });
  } catch (err) {
    console.error("VERIFY CODE ERROR:", err);
    return res
      .status(500)
      .json({ message: "Verification failed.", error: err.message });
  }
});

// ─────────────────────────────────────────────
// RESET PASSWORD — Step 3
// ─────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  try {
    const entry = resetCodes[email];

    if (!entry || entry.code !== code || Date.now() > entry.expiresAt) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset code." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    delete resetCodes[email];

    return res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res
      .status(500)
      .json({ message: "Password reset failed.", error: err.message });
  }
});

module.exports = router;
