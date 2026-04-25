require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const configRoutes = require("./routes/config");
const authRoutes = require("./routes/auth");
const playerRoutes = require("./routes/players");
const path = require("path");

const app = express();

// ✅ CORS first
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());

// ✅ Static uploads after CORS
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/config", configRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server running on port ${process.env.PORT || 8000}`);
    });
  })
  .catch((err) => console.error("MongoDB connection error:", err));
