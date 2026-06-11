// ============================================================
//  server/models/Evaluation.js
//  Mongoose Schema สำหรับผลการประเมิน Supplier
// ============================================================

const mongoose = require("mongoose");

const evaluationSchema = new mongoose.Schema(
  {
    // ── ข้อมูลจาก UserForm ──────────────────────────────────
    role:         { type: String },               // "user" | "gcp"
    empId:        { type: String, required: true },
    dept:         { type: String },
    job:          { type: String },
    evalType:     { type: String },               // "pre-Evaluation" | "post-Evaluation"
    vendorCode:   { type: String },
    supplierName: { type: String },
    productType:  { type: String },
    period:       { type: String },

    // ── ข้อมูลจาก EvalForm ──────────────────────────────────
    // plain object { "1.1": 4, "1.2": 3, ... }
    scores: { type: Object, default: {} },
    notes:  { type: Object, default: {} },

    // ── ผลลัพธ์จาก ResultPage ───────────────────────────────
    totalScore: { type: Number },
    grade:      { type: String },                 // "A" | "B" | "C" | "D"
  },
  {
    timestamps: true, // เพิ่ม createdAt, updatedAt อัตโนมัติ
  }
);

module.exports = mongoose.model("Evaluation", evaluationSchema);
