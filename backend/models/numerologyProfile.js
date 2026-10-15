const mongoose = require("mongoose");
const {
  normalizeFullName,
  parseDateInput,
  calculateMulank,
  calculateBhagyank,
  calculateNameNumber,
  buildNumeroContext,
} = require("../services/numerology/numerologyService");

const numerologyProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    // Deterministic Chaldean numbers — computed automatically, not user-editable.
    mulank: { type: mongoose.Schema.Types.Mixed },
    bhagyank: { type: mongoose.Schema.Types.Mixed },
    nameNumber: { type: mongoose.Schema.Types.Mixed },

    // Full grounding object passed to the numerology LLM (see numerologyService).
    numeroContext: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

numerologyProfileSchema.pre("validate", function computeNumero() {
  if (this.fullName) {
    const clean = normalizeFullName(this.fullName);
    if (!clean || clean.length < 2) {
      this.invalidate("fullName", "fullName must be at least 2 characters");
      return;
    }
    this.fullName = clean;
  }

  const dt = parseDateInput(this.dateOfBirth);
  if (!dt && this.dateOfBirth) {
    this.invalidate("dateOfBirth", "dateOfBirth must be a valid past date (YYYY-MM-DD or DD/MM/YYYY)");
    return;
  }
  if (dt) {
    // Store as UTC midnight for date-only consistency (same as horoscope DOB).
    this.dateOfBirth = dt;
    this.mulank = calculateMulank(dt);
    this.bhagyank = calculateBhagyank(dt);
    this.nameNumber = this.fullName ? calculateNameNumber(this.fullName) : null;
    if (this.fullName && !this.nameNumber) {
      this.invalidate("fullName", "fullName must contain at least one A-Z letter");
      return;
    }
    this.numeroContext = buildNumeroContext({ fullName: this.fullName, dateOfBirth: dt });
  }
});

module.exports = mongoose.model("NumerologyProfile", numerologyProfileSchema);
