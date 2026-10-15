const mongoose = require("mongoose");

// Backend-owned record of a Razorpay wallet top-up attempt.
// Amount is stored here at creation; verify/webhook never trust client amounts.
const rechargeOrderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 1, max: 100000 }, // INR rupees
    amountPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: "INR" },
    razorpayOrderId: { type: String, required: true, unique: true },
    receipt: { type: String, default: null },
    status: {
      type: String,
      enum: ["created", "paid", "failed", "expired"],
      default: "created",
    },
    razorpayPaymentId: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

rechargeOrderSchema.index({ user: 1, createdAt: -1 });
rechargeOrderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("RechargeOrder", rechargeOrderSchema);
