const mongoose = require("mongoose");

// Tracks the once-per-user 10-min free trial ("pehli baar free, phir paid").
//
// The trial belongs to the CLIENT, not to a (client, astrologer) pair: the
// user gets one 10-minute free window that burns down across whichever
// astrologers they talk to first. Once it is gone, every consultation — with
// any astrologer, including the ones never talked to before — needs a paid
// wallet balance before it can start.
const freeUsageSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    freeSecondsUsed: { type: Number, default: 0, min: 0 },
    freeExhausted: { type: Boolean, default: false },
    // Kept for backwards compatibility with the old per-pair documents; not
    // read by the billing service anymore.
    astrologer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

freeUsageSchema.index({ client: 1 }, { unique: true });

module.exports = mongoose.model("FreeUsage", freeUsageSchema);
