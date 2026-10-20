// Numerology billing service — mirrors the astrologer prepaid wallet model.
//
// Flow:
// 1. User gets N free questions (default 5, configurable).
// 2. Once free questions are exhausted, each question costs a fixed price
//    (default ₹10) debited from the user's wallet BEFORE the answer is given.
// 3. If the wallet can't cover the question, the request is rejected with
//    INSUFFICIENT_BALANCE and the client is told to recharge.

const NumeroFreeUsage = require("../models/numeroFreeUsage");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");

const FREE_QUESTIONS_DEFAULT = 5;
const PRICE_PER_QUESTION_DEFAULT = 10; // ₹10 per question

const getOrCreateWallet = async (userId) => {
  // Atomic upsert: `user` is uniquely indexed, so a find-then-create races
  // into a duplicate-key error when two requests arrive together.
  return Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { balance: 0 } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
};

const getOrCreateFreeUsage = async (userId) => {
  // Atomic upsert: two concurrent requests must not both create a document
  // (the `user` field is uniquely indexed, so a plain find-then-create races
  // into a duplicate-key error).
  return NumeroFreeUsage.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        freeQuestionsUsed: 0,
        freeQuestionsLimit: FREE_QUESTIONS_DEFAULT,
        freeExhausted: false,
      },
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
};

const freeQuestionsRemaining = async (userId) => {
  const usage = await getOrCreateFreeUsage(userId);
  return Math.max(0, usage.freeQuestionsLimit - usage.freeQuestionsUsed);
};

const isFreeExhausted = async (userId) => {
  const usage = await getOrCreateFreeUsage(userId);
  return usage.freeQuestionsUsed >= usage.freeQuestionsLimit;
};

/// Check if the user can ask a question right now.
/// Returns { ok, reason, freeRemaining, walletBalance, pricePerQuestion, ... }
const ensureBillable = async (userId, { pricePerQuestion = PRICE_PER_QUESTION_DEFAULT } = {}) => {
  const usage = await getOrCreateFreeUsage(userId);
  const freeRemaining = Math.max(0, usage.freeQuestionsLimit - usage.freeQuestionsUsed);

  // Free questions still available — no wallet needed.
  if (freeRemaining > 0) {
    return {
      ok: true,
      reason: "",
      freeRemaining,
      freeQuestionsUsed: usage.freeQuestionsUsed,
      freeQuestionsLimit: usage.freeQuestionsLimit,
      walletBalance: null,
      pricePerQuestion,
      isFree: true,
    };
  }

  // Free exhausted — check wallet.
  const wallet = await getOrCreateWallet(userId);
  if (wallet.balance >= pricePerQuestion) {
    return {
      ok: true,
      reason: "",
      freeRemaining: 0,
      freeQuestionsUsed: usage.freeQuestionsUsed,
      freeQuestionsLimit: usage.freeQuestionsLimit,
      walletBalance: wallet.balance,
      pricePerQuestion,
      isFree: false,
    };
  }

  return {
    ok: false,
    reason: "insufficient_balance",
    freeRemaining: 0,
    freeQuestionsUsed: usage.freeQuestionsUsed,
    freeQuestionsLimit: usage.freeQuestionsLimit,
    walletBalance: wallet.balance,
    pricePerQuestion,
    isFree: false,
  };
};

/// Consume one question: either burn a free question or debit the wallet.
/// Must only be called after ensureBillable() returned ok: true.
///
/// Both paths are atomic so two concurrent requests can never burn the same
/// free question twice or overdraw the wallet.
const consumeQuestion = async (userId, { pricePerQuestion = PRICE_PER_QUESTION_DEFAULT } = {}) => {
  // Burn a free question — the `$expr` guard in the filter makes the increment
  // atomic, so the free limit can never be exceeded by a race. `$expr` compares
  // two fields of the same document, which a plain `$lt` cannot do (the limit
  // is per-user and configurable, not a constant).
  const usage = await NumeroFreeUsage.findOneAndUpdate(
    {
      user: userId,
      $expr: { $lt: ["$freeQuestionsUsed", "$freeQuestionsLimit"] },
    },
    { $inc: { freeQuestionsUsed: 1 } },
    { returnDocument: "after" },
  );

  if (usage) {
    const limit = usage.freeQuestionsLimit ?? FREE_QUESTIONS_DEFAULT;
    if (usage.freeQuestionsUsed >= limit) {
      await NumeroFreeUsage.updateOne({ user: userId }, { $set: { freeExhausted: true } });
    }
    return {
      charged: 0,
      isFree: true,
      freeRemaining: Math.max(0, limit - usage.freeQuestionsUsed),
      walletBalance: null,
    };
  }

  // Paid question — debit the wallet atomically. The `balance >= price` guard
  // means the balance can never go negative, even if two requests race.
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId, balance: { $gte: pricePerQuestion } },
    { $inc: { balance: -pricePerQuestion } },
    { returnDocument: "after" },
  );
  if (!wallet) {
    // The balance dropped between ensureBillable() and here (another request
    // spent it). Report it as insufficient rather than going negative.
    const current = await getOrCreateWallet(userId);
    const error = new Error("INSUFFICIENT_BALANCE");
    error.code = "INSUFFICIENT_BALANCE";
    error.walletBalance = current.balance;
    error.pricePerQuestion = pricePerQuestion;
    throw error;
  }

  await WalletTransaction.create({
    user: userId,
    type: "debit",
    amount: pricePerQuestion,
    balanceAfter: wallet.balance,
    reason: "numerology_charge",
    meta: { pricePerQuestion },
  });

  return {
    charged: pricePerQuestion,
    isFree: false,
    freeRemaining: 0,
    walletBalance: wallet.balance,
  };
};

/// Give back a question that was charged but never answered (the LLM call
/// failed, the profile was missing, …). A free question is returned to the
/// pool; a paid one is credited back to the wallet.
const refundQuestion = async (userId, consumption) => {
  if (!consumption) return null;

  if (consumption.isFree) {
    const usage = await NumeroFreeUsage.findOneAndUpdate(
      { user: userId, freeQuestionsUsed: { $gt: 0 } },
      { $inc: { freeQuestionsUsed: -1 } },
      { returnDocument: "after" },
    );
    // The pool has room again, so the "exhausted" flag must go too.
    if (usage && usage.freeQuestionsUsed < usage.freeQuestionsLimit) {
      await NumeroFreeUsage.updateOne({ user: userId }, { $set: { freeExhausted: false } });
    }
    return { refunded: 0, isFree: true };
  }

  const amount = consumption.charged || 0;
  if (amount <= 0) return null;

  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { balance: amount } },
    { new: true },
  );
  await WalletTransaction.create({
    user: userId,
    type: "credit",
    amount,
    balanceAfter: wallet?.balance ?? 0,
    reason: "refund",
    meta: { refundReason: "numerology_answer_failed", originalAmount: amount },
  });
  return { refunded: amount, isFree: false, walletBalance: wallet?.balance ?? 0 };
};

/// Admin: update free questions limit for a user (or globally via env).
const setFreeQuestionsLimit = async (userId, limit) => {
  const usage = await getOrCreateFreeUsage(userId);
  usage.freeQuestionsLimit = limit;
  await usage.save();
  return usage;
};

/// Admin: reset free usage for a user.
const resetFreeUsage = async (userId) => {
  const usage = await getOrCreateFreeUsage(userId);
  usage.freeQuestionsUsed = 0;
  usage.freeExhausted = false;
  await usage.save();
  return usage;
};

module.exports = {
  FREE_QUESTIONS_DEFAULT,
  PRICE_PER_QUESTION_DEFAULT,
  getOrCreateWallet,
  getOrCreateFreeUsage,
  freeQuestionsRemaining,
  isFreeExhausted,
  ensureBillable,
  consumeQuestion,
  refundQuestion,
  setFreeQuestionsLimit,
  resetFreeUsage,
};
