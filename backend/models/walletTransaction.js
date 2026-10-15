const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true },
    reason: {
      type: String,
      enum: ["recharge", "consultation_charge", "consultation_earning", "refund"],
      required: true,
    },
    consultationMatch: { type: mongoose.Schema.Types.ObjectId, ref: "Match", default: null },
    // Gateway payment id for idempotent recharge credits (sparse: only set on recharges)
    providerPaymentId: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
