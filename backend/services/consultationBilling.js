// Prepaid consultation billing.
//
// The product rule is "jitna payment, utna minute": the client burns their one
// free trial first, and from the moment it runs out every started minute is
// debited from the client's wallet *before* it is granted. A session can
// therefore never run past the minutes the client actually paid for — if the
// wallet cannot cover the next minute the consultation is ended with
// `reason = "insufficient_balance"` instead of silently running up a bill that
// can never be collected (which is what the old end-of-session settlement did:
// it marked the whole session `paymentStatus: "failed"` and left the
// astrologer unpaid).
//
// The free trial is PER USER, not per (client, astrologer) pair: "pehli baar
// free, phir hamesha paid". A user's single 10-minute window burns down across
// whichever astrologers they consult first, and once it is exhausted every
// later consultation — with any astrologer, including a brand-new one — is
// pay-first.
//
// Billing is incremental and idempotent: `settleConsultation` only charges the
// minutes that have not been charged yet (`consultation.billedMin` is the
// watermark), so it can be called from the 30s sweep, from the status poll and
// from the final end without ever double-charging.

const Match = require("../models/match");
const AstrologerProfile = require("../models/astrologerProfile");
const FreeUsage = require("../models/freeUsage");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");
const ConsultationQueue = require("../models/consultationQueue");
const { getIo, clearUserInCall } = require("./socketHub");

const FREE_MINUTES_DEFAULT = 10;

// A paid session may continue while the client can afford at least this many
// minutes. One minute keeps the rule honest at minute granularity ("jitna
// payment, utna minute") — the wallet is debited a minute at a time.
const MIN_PAID_BLOCK_MIN = 1;

const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });
  return wallet;
};

const freeLimitSecFor = (profile) =>
  profile && profile.freeMinutesEnabled
    ? (profile.freeMinutesLimitMin ?? FREE_MINUTES_DEFAULT) * 60
    : 0;

// The free window is owned by the client, so the astrologer's own
// `freeMinutesEnabled` switch still gates whether that window exists at all
// (a profile that opts out grants nobody a free trial), but the usage counter
// is keyed on the client alone.
const freeRemainingSecFor = async (clientId, profile) => {
  const limit = freeLimitSecFor(profile);
  if (limit <= 0) return 0;
  const usage = await FreeUsage.findOne({ client: clientId }).lean();
  return Math.max(0, limit - (usage?.freeSecondsUsed || 0));
};

const paidMinutesLeft = (balance, ratePerMin) =>
  ratePerMin > 0 ? Math.floor(Math.max(0, balance) / ratePerMin) : 0;

const isMatchDoc = (value) =>
  value && typeof value === "object" && typeof value.save === "function";

const loadMatch = async (matchOrId) => {
  if (isMatchDoc(matchOrId)) return matchOrId;
  const id = typeof matchOrId === "object" && matchOrId !== null ? matchOrId._id : matchOrId;
  return Match.findById(id);
};

// One settle at a time per match: the sweep, a chat:send gate and the client's
// status poll can land together, and each would otherwise read the same
// `billedMin` watermark and charge the same minute twice.
const inFlight = new Set();

const settleConsultation = async (matchOrId, options = {}) => {
  const key = String(
    typeof matchOrId === "object" && matchOrId !== null ? matchOrId._id : matchOrId,
  );
  if (inFlight.has(key)) return { skipped: true, matchId: key };
  inFlight.add(key);
  try {
    return await settleConsultationUnsafe(matchOrId, options);
  } finally {
    inFlight.delete(key);
  }
};

const settleConsultationUnsafe = async (matchOrId, { now } = {}) => {
  const match = await loadMatch(matchOrId);
  if (!match || match.matchType !== "consultation" || !match.consultation) return null;
  const c = match.consultation;
  const rate = c.ratePerMin || 0;

  const profile = await AstrologerProfile.findOne({ user: c.astrologer }).lean();
  const limitSec = freeLimitSecFor(profile);

  const usage = await FreeUsage.findOneAndUpdate(
    { client: c.client },
    { $setOnInsert: { freeSecondsUsed: 0, freeExhausted: false } },
    { new: true, upsert: true },
  );

  // Billing starts from callConnectedAt if the call was connected, otherwise
  // from startedAt. This ensures we only charge for actual call time, not
  // ringing/connection time.
  const billingStartMs = c.callConnectedAt
    ? new Date(c.callConnectedAt).getTime()
    : new Date(c.startedAt || match.createdAt).getTime();
  // The clock stops for good once the session has an `endedAt` — otherwise a
  // status poll arriving after the end (or the sweep re-reading an ended
  // document) would keep extending the duration and charging more minutes.
  const endedAt = c.endedAt
    ? new Date(c.endedAt)
    : now
      ? new Date(now)
      : new Date();
  const durationSec = Math.max(0, Math.round((endedAt.getTime() - billingStartMs) / 1000));

  // Free minutes belong to the client and accumulate across sessions — and
  // across astrologers — so only the seconds never granted before come out of
  // the free window.
  const freeUsedBefore = usage.freeSecondsUsed || 0;
  const freeRemainingBefore = Math.max(0, limitSec - freeUsedBefore);
  const freeSecGrantedTotal = Math.min(durationSec, freeRemainingBefore);
  const newFreeSec = Math.max(0, freeSecGrantedTotal - (c.freeSecGranted || 0));

  const billableSec = Math.max(0, durationSec - freeSecGrantedTotal);
  // A partially started minute is billed as a whole one, exactly like the old
  // end-of-session `Math.ceil` did — just applied as the minute is entered.
  const billableMin = Math.ceil(billableSec / 60);
  const dueAmount = billableMin * rate;

  const billedMinBefore = c.billedMin || 0;
  let billedMin = billedMinBefore;
  let amount = billedMinBefore * rate;
  // A zero-rate astrologer bills nothing and can never block the client.
  let paymentStatus = billableMin === 0 || rate <= 0 ? "free" : "deducted";
  let insufficient = false;
  let walletBalance = null;

  const newMin = billableMin - billedMinBefore;
  if (newMin > 0 && rate > 0) {
    const wallet = await getOrCreateWallet(c.client);
    walletBalance = wallet.balance;
    const affordableMin = Math.min(newMin, Math.floor(wallet.balance / rate));
    const charge = affordableMin * rate;
    if (charge > 0) {
      wallet.balance -= charge;
      await wallet.save();
      await WalletTransaction.create({
        user: c.client,
        type: "debit",
        amount: charge,
        balanceAfter: wallet.balance,
        reason: "consultation_charge",
        consultationMatch: match._id,
        meta: { billableMin: affordableMin, ratePerMin: rate },
      });
      const astroWallet = await getOrCreateWallet(c.astrologer);
      astroWallet.balance += charge;
      await astroWallet.save();
      await WalletTransaction.create({
        user: c.astrologer,
        type: "credit",
        amount: charge,
        balanceAfter: astroWallet.balance,
        reason: "consultation_earning",
        consultationMatch: match._id,
        meta: { billableMin: affordableMin, ratePerMin: rate },
      });
      // The astrologer earns as each paid minute is actually charged.
      await AstrologerProfile.updateOne(
        { user: c.astrologer },
        { $inc: { totalEarnings: charge } },
      );
      billedMin = billedMinBefore + affordableMin;
      amount = billedMin * rate;
    }
    insufficient = affordableMin < newMin;
    paymentStatus = insufficient ? "failed" : "deducted";
    walletBalance = wallet.balance;
  }

  if (newFreeSec > 0) usage.freeSecondsUsed = freeUsedBefore + newFreeSec;
  if (usage.freeSecondsUsed >= limitSec) usage.freeExhausted = true;
  await usage.save();

  c.freeSecGranted = freeSecGrantedTotal;
  c.billableSec = billableSec;
  c.billedMin = billedMin;
  c.amount = amount;
  c.paymentStatus = paymentStatus;
  c.durationSec = durationSec;
  c.billedAt = endedAt;
  await match.save();

  const freeRemainingSec = Math.max(0, limitSec - (usage.freeSecondsUsed || 0));
  if (walletBalance === null && rate > 0) {
    const wallet = await Wallet.findOne({ user: c.client }).lean();
    walletBalance = wallet?.balance ?? 0;
  }

  return {
    match,
    status: match.status,
    durationSec,
    freeSecGranted: freeSecGrantedTotal,
    billableSec,
    billableMin,
    dueAmount,
    amount,
    paymentStatus,
    insufficient,
    ratePerMin: rate,
    freeRemainingSec,
    walletBalance: walletBalance ?? 0,
    paidMinutesLeft: paidMinutesLeft(walletBalance ?? 0, rate),
  };
};

const gateFromSummary = (summary) => {
  if (!summary || summary.skipped) return { ok: false, reason: "busy", summary };
  if (summary.status === "ended") return { ok: false, reason: "ended", summary };
  if (summary.insufficient) return { ok: false, reason: "insufficient_balance", summary };
  if (summary.ratePerMin <= 0 || summary.freeRemainingSec > 0) {
    return { ok: true, reason: "", summary };
  }
  if (summary.walletBalance >= summary.ratePerMin) return { ok: true, reason: "", summary };
  return { ok: false, reason: "insufficient_balance", summary };
};

/// Settle the running session, then answer whether the payer may continue.
/// `{ ok: false, reason: "insufficient_balance" }` means the caller should
/// stop the session (or refuse the action) and ask for a recharge.
const ensureBillable = async (matchOrId) => gateFromSummary(await settleConsultation(matchOrId));

/// Bill preview for the status endpoint without charging again.
const billingPreview = (summary) => {
  if (!summary) return null;
  return {
    durationSec: summary.durationSec,
    freeSecGranted: summary.freeSecGranted,
    billableSec: summary.billableSec,
    billableMin: summary.billableMin,
    dueAmount: summary.dueAmount,
    chargedAmount: summary.amount,
    paymentStatus: summary.paymentStatus,
    freeRemainingSec: summary.freeRemainingSec,
    walletBalance: summary.walletBalance,
    paidMinutesLeft: summary.paidMinutesLeft,
    ratePerMin: summary.ratePerMin,
    // True while the payer (the client) cannot cover the next minute — whether
    // the session is still running or was just stopped for it. The caller
    // scopes this to the client, so the astrologer is never asked to recharge.
    requiresRecharge:
      summary.insufficient ||
      (!gateFromSummary(summary).ok && summary.status !== "ended"),
    insufficient: summary.insufficient,
  };
};

/// End the session for good: close the clock, settle the final minute, credit
/// counters, promote the queue and notify both sides. `reason` is one of
/// `"ended"`, `"insufficient_balance"`, `"user"`, `"astrologer"`.
const finalizeConsultation = async (matchOrId, { reason = "ended", now } = {}) => {
  const match = await loadMatch(matchOrId);
  if (!match || match.matchType !== "consultation" || !match.consultation) return null;

  if (match.status !== "ended") {
    match.status = "ended";
    match.consultation.endedAt = now ? new Date(now) : new Date();
    match.consultation.endedReason = reason;
    await match.save();
  }

  const summary = await settleConsultation(match, {
    now: match.consultation.endedAt,
  });
  if (!summary || summary.skipped) return summary;

  await AstrologerProfile.updateOne(
    { user: match.consultation.astrologer },
    {
      $inc: {
        totalConsultations: 1,
        totalFreeMinutesGiven: Math.round(summary.freeSecGranted / 60),
      },
    },
  );

  const nextQueued = await ConsultationQueue.findOne({
    astrologer: match.consultation.astrologer,
    status: "waiting",
  }).sort({ createdAt: 1 });

  clearUserInCall(String(match.consultation.client));
  clearUserInCall(String(match.consultation.astrologer));

  const io = getIo();
  if (io) {
    const payload = {
      matchId: String(match._id),
      durationSec: summary.durationSec,
      freeSecGranted: summary.freeSecGranted,
      billableSec: summary.billableSec,
      billableMin: summary.billableMin,
      amount: summary.amount,
      dueAmount: summary.dueAmount,
      paymentStatus: summary.paymentStatus,
      reason,
      endedReason: reason,
    };
    io.to(`match:${String(match._id)}`).emit("consultation:ended", payload);
    // A running voice/video call must drop too — CallController already listens
    // for `call:ended`, so no client change is needed for the call path.
    io.to(`match:${String(match._id)}`).emit("call:ended", {
      matchId: String(match._id),
      userId: null,
      reason,
    });
    if (nextQueued) {
      io.to(`user:${String(nextQueued.client)}`).emit("consultation:turn", {
        queueId: nextQueued._id,
        astrologerId: String(match.consultation.astrologer),
      });
    }
  }

  return { ...summary, endedReason: reason };
};

/// Settles every running consultation. Called on a timer so billing (and the
/// automatic stop) also works while neither side touches chat/call.
const sweepActiveConsultations = async ({ limit = 200 } = {}) => {
  const matches = await Match.find({
    matchType: "consultation",
    status: { $in: ["accepted", "active"] },
    "consultation.client": { $exists: true },
    "consultation.startedAt": { $ne: null },
  }).limit(limit);

  let settled = 0;
  let stopped = 0;
  let noAnswer = 0;
  const now = new Date();
  for (const match of matches) {
    try {
      // Auto-timeout: if the call was never connected within 60 seconds of
      // starting, end the consultation and refund any charges. This handles
      // the case where the astrologer doesn't answer the call.
      const c = match.consultation;
      if (!c.callConnectedAt && c.startedAt) {
        const elapsedSec = Math.round((now.getTime() - new Date(c.startedAt).getTime()) / 1000);
        if (elapsedSec > 60) {
          // Refund any charges that were deducted during the ringing period
          if (c.amount > 0 && c.billedMin > 0) {
            const wallet = await getOrCreateWallet(c.client);
            wallet.balance += c.amount;
            await wallet.save();
            await WalletTransaction.create({
              user: c.client,
              type: "credit",
              amount: c.amount,
              balanceAfter: wallet.balance,
              reason: "refund",
              consultationMatch: match._id,
              meta: { refundReason: "no_answer", originalAmount: c.amount },
            });
            // Debit the astrologer's wallet for the refunded amount
            const astroWallet = await getOrCreateWallet(c.astrologer);
            astroWallet.balance = Math.max(0, astroWallet.balance - c.amount);
            await astroWallet.save();
            await WalletTransaction.create({
              user: c.astrologer,
              type: "debit",
              amount: c.amount,
              balanceAfter: astroWallet.balance,
              reason: "consultation_charge_refund",
              consultationMatch: match._id,
              meta: { refundReason: "no_answer", originalAmount: c.amount },
            });
          }
          await finalizeConsultation(match, { reason: "no_answer" });
          noAnswer += 1;
          continue;
        }
      }
      const summary = await settleConsultation(match);
      if (!summary || summary.skipped) continue;
      settled += 1;
      if (summary.insufficient) {
        await finalizeConsultation(match, { reason: "insufficient_balance" });
        stopped += 1;
      }
    } catch (error) {
      // Keep the sweep alive: one bad document must not stop billing for the
      // rest of the running consultations.
      console.error("consultation billing sweep failed", match?._id, error?.message);
    }
  }
  return { checked: matches.length, settled, stopped, noAnswer };
};

let sweepTimer = null;

const startBillingSweep = (intervalMs = 30000) => {
  if (sweepTimer) return sweepTimer;
  sweepTimer = setInterval(() => {
    sweepActiveConsultations().catch(() => {});
  }, intervalMs);
  // Never hold the process open just for billing.
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
  return sweepTimer;
};

const stopBillingSweep = () => {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
};

module.exports = {
  FREE_MINUTES_DEFAULT,
  MIN_PAID_BLOCK_MIN,
  getOrCreateWallet,
  freeLimitSecFor,
  freeRemainingSecFor,
  paidMinutesLeft,
  settleConsultation,
  ensureBillable,
  billingPreview,
  finalizeConsultation,
  sweepActiveConsultations,
  startBillingSweep,
  stopBillingSweep,
};
