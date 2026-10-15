const mongoose = require("mongoose");

// Tracks the once-per-pair 10-min free quota.
// freeSecondsUsed accumulates across sessions until the astrologer's limit is exhausted.
const freeUsageSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    astrologer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    freeSecondsUsed: { type: Number, default: 0, min: 0 },
    freeExhausted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

freeUsageSchema.index({ client: 1, astrologer: 1 }, { unique: true });

module.exports = mongoose.model("FreeUsage", freeUsageSchema);
