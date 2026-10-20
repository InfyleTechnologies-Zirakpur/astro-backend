const mongoose = require("mongoose");

// Tracks the free numerology questions used per user.
// Once freeQuestionsUsed >= freeQuestionsLimit, the user must pay per question.
const numeroFreeUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    freeQuestionsUsed: { type: Number, default: 0, min: 0 },
    freeQuestionsLimit: { type: Number, default: 5, min: 0 },
    freeExhausted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NumeroFreeUsage", numeroFreeUsageSchema);
