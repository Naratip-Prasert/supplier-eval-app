const mongoose = require("mongoose");

const evaluationSchema = new mongoose.Schema(
  {
    // ── User Info (from UserForm) ─────────────────────────────
    role: {
      type: String,
      enum: ["user", "gcp"],
    },
    empId: {
      type: String,
      required: [true, "Employee ID is required"],
      trim: true,
    },
    dept:  { type: String, trim: true },
    job:   { type: String, trim: true },
    evalType: {
      type: String,
      enum: ["pre-Evaluation", "post-Evaluation"],
    },

    // ── Supplier Info (from UserForm) ─────────────────────────
    vendorCode:   { type: String, trim: true },
    supplierName: { type: String, trim: true },
    productType: {
      type: String,
      enum: ["สินค้า", "บริการ", "สินค้าและบริการ"],
    },
    period: { type: String, trim: true },

    // ── Scores & Notes (from EvalForm) ───────────────────────
    // Keys are criterion IDs e.g. "1.1", "1.2", "2.1" — dots in keys require Mixed
    scores: { type: mongoose.Schema.Types.Mixed, default: {} },
    notes:  { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Result (from ResultPage) ──────────────────────────────
    totalScore: {
      type: Number,
      min: [0, "Score cannot be negative"],
      max: [100, "Score cannot exceed 100"],
    },
    grade: {
      type: String,
      enum: ["A", "B", "C", "D"],
    },
  },
  {
    timestamps: true,
  }
);

// Index for common query patterns
evaluationSchema.index({ supplierName: 1, createdAt: -1 });
evaluationSchema.index({ empId: 1 });
evaluationSchema.index({ vendorCode: 1 });
evaluationSchema.index({ grade: 1 });

module.exports = mongoose.model("Evaluation", evaluationSchema);
