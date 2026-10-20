const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true },
    reason: {
      type: String,
      enum: [
        "recharge",
        "consultation_charge",
        "consultation_earning",
        "consultation_charge_refund",
        "refund",
        "numerology_charge",
      ],
      required: true,
    },
    consultationMatch: { type: mongoose.Schema.Types.ObjectId, ref: "Match", default: null },
    // Gateway payment id for idempotent recharge credits.
    //
    // No `default: null` here on purpose: the unique index below is *sparse*,
    // and a sparse index only skips documents where the field is ABSENT — an
    // explicit `null` is still a value, so every non-recharge transaction
    // (consultation charge, numerology charge, refund) would collide on
    // `providerPaymentId: null` and fail with E11000 after the first one.
    // Leaving it undefined keeps those documents out of the index entirely.
    providerPaymentId: { type: String, default: undefined },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
