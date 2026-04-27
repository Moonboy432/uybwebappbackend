require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const configRoutes = require("./routes/config");
const authRoutes = require("./routes/auth");
const playerRoutes = require("./routes/players");

const app = express();

app.use(
  cors({
    origin: "*", // you can tighten later
    credentials: true,
  }),
);

app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/config", configRoutes);

const PORT = process.env.PORT || 8000;

// ✅ 1. START SERVER FIRST (VERY IMPORTANT)
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ✅ 2. THEN CONNECT DATABASE
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));
