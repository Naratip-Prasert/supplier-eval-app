// ============================================================
//  server/routes/evaluations.js
//  Express Router — /api/evaluations
// ============================================================

const router     = require("express").Router();
const Evaluation = require("../models/Evaluation");

// POST /api/evaluations — บันทึกผลประเมินใหม่
router.post("/", async (req, res) => {
  try {
    const evaluation = new Evaluation(req.body);
    const saved = await evaluation.save();
    res.status(201).json({ message: "บันทึกสำเร็จ", data: saved });
  } catch (error) {
    console.error("POST /api/evaluations error:", error);
    res.status(400).json({ message: "บันทึกไม่สำเร็จ", error: error.message });
  }
});

// GET /api/evaluations — ดึงประวัติทั้งหมด (เรียงล่าสุดก่อน)
router.get("/", async (req, res) => {
  try {
    const evaluations = await Evaluation.find().sort({ createdAt: -1 });
    res.json(evaluations);
  } catch (error) {
    console.error("GET /api/evaluations error:", error);
    res.status(500).json({ message: "ดึงข้อมูลไม่สำเร็จ", error: error.message });
  }
});

// GET /api/evaluations/:id — ดึงผลประเมินตาม ID
router.get("/:id", async (req, res) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id);
    if (!evaluation) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json(evaluation);
  } catch (error) {
    console.error("GET /api/evaluations/:id error:", error);
    res.status(500).json({ message: "ดึงข้อมูลไม่สำเร็จ", error: error.message });
  }
});

module.exports = router;
