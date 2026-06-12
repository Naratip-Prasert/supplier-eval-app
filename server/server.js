// ============================================================
//  server/server.js
//  Express + Mongoose — Supplier Evaluation API
//  รัน: node server/server.js
// ============================================================

const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const Evaluation = require("./models/Evaluation");
const evaluationRoutes = require("./routes/evaluations");
require("dotenv").config();

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Supplier Eval API is running" });
});

app.use("/api/evaluations", evaluationRoutes);

// ── Connect MongoDB & Start Server ───────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });
