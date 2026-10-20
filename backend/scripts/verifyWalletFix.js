// End-to-end check of the wallet fixes against the real database.
//
// Run: node scripts/verifyWalletFix.js
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const loadEnv = () => {
  const file = path.join(__dirname, "..", ".env");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trim().startsWith("#")) continue;
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
};

loadEnv();

const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");
const NumeroFreeUsage = require("../models/numeroFreeUsage");
const billing = require("../services/numeroBillingService");

const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log("  ✓", msg);
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const userId = new mongoose.Types.ObjectId();
  console.log("test user:", String(userId));

  try {
    // --- A. many non-recharge transactions must all succeed ----------------
    console.log("\n[A] multiple wallet transactions without a providerPaymentId");
    await Wallet.create({ user: userId, balance: 0 });
    for (let i = 0; i < 5; i += 1) {
      await WalletTransaction.create({
        user: userId,
        type: "debit",
        amount: 1,
        balanceAfter: 0,
        reason: "numerology_charge",
      });
    }
    const count = await WalletTransaction.countDocuments({ user: userId, reason: "numerology_charge" });
    assert(count === 5, `5 numerology_charge rows written (got ${count})`);

    // --- B. free questions burn down, then the wallet takes over -----------
    console.log("\n[B] free questions then paid questions");
    await billing.setFreeQuestionsLimit(userId, 3);
    await billing.resetFreeUsage(userId);

    for (let i = 1; i <= 3; i += 1) {
      const gate = await billing.ensureBillable(userId);
      assert(gate.ok && gate.isFree, `question ${i} is free`);
      const used = await billing.consumeQuestion(userId);
      assert(used.isFree && used.charged === 0, `question ${i} charged nothing`);
    }

    const gate = await billing.ensureBillable(userId);
    assert(!gate.ok && gate.reason === "insufficient_balance", "4th question is blocked (no balance)");

    await Wallet.updateOne({ user: userId }, { $set: { balance: 100 } });
    const paidGate = await billing.ensureBillable(userId);
    assert(paidGate.ok && !paidGate.isFree, "with ₹100 the 4th question is allowed");
    const paid = await billing.consumeQuestion(userId);
    assert(paid.charged === 10 && paid.walletBalance === 90, `₹10 charged, balance now ${paid.walletBalance}`);

    // --- C. concurrent consumption must never overdraw the wallet ----------
    console.log("\n[C] 10 concurrent paid questions against a ₹25 balance");
    await Wallet.updateOne({ user: userId }, { $set: { balance: 25 } });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => billing.consumeQuestion(userId)),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const wallet = await Wallet.findOne({ user: userId });
    assert(wallet.balance >= 0, `balance never goes negative (${wallet.balance})`);
    assert(wallet.balance === 25 - ok * 10, `balance matches the number of successful charges (${wallet.balance})`);
    console.log(`  → ${ok} of 10 concurrent questions were charged, ${10 - ok} were rejected`);

    // --- D. a failed answer refunds the charge ----------------------------
    console.log("\n[D] refund on a failed answer");
    await Wallet.updateOne({ user: userId }, { $set: { balance: 50 } });
    const charged = await billing.consumeQuestion(userId);
    const before = (await Wallet.findOne({ user: userId })).balance;
    await billing.refundQuestion(userId, charged);
    const after = (await Wallet.findOne({ user: userId })).balance;
    assert(after === before + 10, `balance refunded: ${before} → ${after}`);

    // --- E. the free pool is restored by a refund -------------------------
    const usageBefore = await NumeroFreeUsage.findOne({ user: userId });
    const freeCharge = { isFree: true, charged: 0 };
    await billing.refundQuestion(userId, freeCharge);
    const usageAfter = await NumeroFreeUsage.findOne({ user: userId });
    assert(
      usageAfter.freeQuestionsUsed === usageBefore.freeQuestionsUsed - 1,
      `free question returned to the pool (${usageBefore.freeQuestionsUsed} → ${usageAfter.freeQuestionsUsed})`,
    );

    console.log("\nALL WALLET CHECKS PASSED");
  } catch (error) {
    console.error("\nFAILED:", error.message);
    process.exitCode = 1;
  } finally {
    await WalletTransaction.deleteMany({ user: userId });
    await Wallet.deleteMany({ user: userId });
    await NumeroFreeUsage.deleteMany({ user: userId });
    await mongoose.disconnect();
  }
})();
