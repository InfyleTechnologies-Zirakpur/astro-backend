const mongoose = require("mongoose");
const User = require("../models/user");
const Match = require("../models/match");
const AstrologerProfile = require("../models/astrologerProfile");
const FreeUsage = require("../models/freeUsage");
const ConsultationQueue = require("../models/consultationQueue");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");
const Review = require("../models/review");
const { getIo, isUserInCall } = require("../services/socketHub");
const { freeRemainingSecFor, MIN_PAID_BLOCK_MIN } = require("./astrologerController");

const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });
  return wallet;
};

// POST /api/consultations/request
const requestConsultation = async (req, res, next) => {
  try {
    const { astrologerId, channel = "chat" } = req.body;
    if (!mongoose.isValidObjectId(astrologerId)) {
      return res.status(400).json({ success: false, message: "Valid astrologerId is required" });
    }
    if (!["chat", "voice", "video"].includes(channel)) {
      return res.status(400).json({ success: false, message: "channel must be chat, voice or video" });
    }
    if (String(astrologerId) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You cannot consult yourself" });
    }

    const astrologer = await User.findOne({ _id: astrologerId, role: "astrologer", isActive: true });
    if (!astrologer) return res.status(404).json({ success: false, message: "Astrologer not found" });
    const profile = await AstrologerProfile.findOne({ user: astrologerId });
    if (!profile || !profile.isVerified) {
      return res.status(403).json({ success: false, message: "Astrologer is not verified yet" });
    }
    if (!profile.isOnline) {
      return res.status(409).json({ success: false, message: "Astrologer is currently offline" });
    }

    const ratePerMin = channel === "chat" ? profile.rateChatPerMin : profile.rateCallPerMin;
    const freeRemainingSec = await freeRemainingSecFor(req.user._id, astrologerId, profile);

    // Reuse an existing active consultation between this pair+channel if present
    let match = await Match.findOne({
      matchType: "consultation",
      status: { $in: ["accepted", "active"] },
      $or: [
        { userA: req.user._id, userB: astrologerId },
        { userA: astrologerId, userB: req.user._id },
      ],
      "consultation.channel": channel,
    });

    const busy = isUserInCall(String(astrologerId));

    if (busy && !match) {
      // Join waitlist — position = waiting count + 1
      const waitingCount = await ConsultationQueue.countDocuments({ astrologer: astrologerId, status: "waiting" });
      const queueEntry = await ConsultationQueue.create({
        astrologer: astrologerId,
        client: req.user._id,
        channel,
        status: "waiting",
      });
      const io = getIo();
      if (io) {
        io.to(`user:${String(astrologerId)}`).emit("consultation:queue-update", { astrologerId: String(astrologerId), waiting: waitingCount + 1 });
        io.to(`user:${String(req.user._id)}`).emit("consultation:queued", { queueId: queueEntry._id, position: waitingCount + 1, freeRemainingSec, ratePerMin });
      }
      return res.status(202).json({
        success: true,
        message: "Astrologer is busy. You are in the queue.",
        data: { queued: true, queueId: queueEntry._id, position: waitingCount + 1, freeRemainingSec, ratePerMin },
      });
    }

    // Wallet gate only when no free time remains
    if (freeRemainingSec <= 0) {
      const wallet = await getOrCreateWallet(req.user._id);
      const minRequired = ratePerMin * MIN_PAID_BLOCK_MIN;
      if (wallet.balance < minRequired) {
        return res.status(402).json({
          success: false,
          message: `Insufficient balance. Minimum ₹${minRequired} required (${MIN_PAID_BLOCK_MIN} min). Please recharge.`,
          data: { balance: wallet.balance, minRequired, ratePerMin, freeRemainingSec: 0 },
        });
      }
    }

    if (!match) {
      match = await Match.create({
        userA: req.user._id,
        userB: astrologerId,
        matchType: "consultation",
        status: "accepted",
        requestedBy: req.user._id,
        requestedTo: astrologerId,
        respondedAt: new Date(),
        consultation: {
          astrologer: astrologerId,
          client: req.user._id,
          channel,
          ratePerMin,
          startedAt: new Date(),
          paymentStatus: "pending",
        },
      });
    }

    const io = getIo();
    if (io) {
      io.to(`user:${String(astrologerId)}`).emit("consultation:incoming", {
        matchId: String(match._id),
        channel,
        client: { id: String(req.user._id), name: req.user.name },
        freeRemainingSec,
        ratePerMin,
      });
    }

    res.status(201).json({
      success: true,
      message: match ? "Consultation ready" : "Consultation created",
      data: {
        matchId: match._id,
        match,
        queued: false,
        freeRemainingSec,
        ratePerMin,
        needsRechargeForContinuation: freeRemainingSec <= 0,
      },
    });
  } catch (error) { next(error); }
};

// POST /api/consultations/:matchId/end — either participant; server computes free vs billable
const endConsultation = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.matchId)) {
      return res.status(400).json({ success: false, message: "Invalid matchId" });
    }
    const match = await Match.findOne({
      _id: req.params.matchId,
      matchType: "consultation",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    });
    if (!match) return res.status(404).json({ success: false, message: "Consultation not found" });
    if (match.status === "ended") {
      return res.json({ success: true, message: "Already ended", data: match });
    }

    const profile = await AstrologerProfile.findOne({ user: match.consultation.astrologer });
    const limitSec = profile && profile.freeMinutesEnabled ? (profile.freeMinutesLimitMin ?? 10) * 60 : 0;
    const usage = await FreeUsage.findOneAndUpdate(
      { client: match.consultation.client, astrologer: match.consultation.astrologer },
      { $setOnInsert: { freeSecondsUsed: 0, freeExhausted: false } },
      { new: true, upsert: true }
    );
    const freeRemainingBefore = Math.max(0, limitSec - usage.freeSecondsUsed);

    const startedAt = match.consultation.startedAt || match.createdAt;
    const endedAt = new Date();
    const durationSec = Math.max(0, Math.round((endedAt - new Date(startedAt)) / 1000));
    const freeSecGranted = Math.min(durationSec, freeRemainingBefore);
    const billableSec = durationSec - freeSecGranted;
    const billableMin = Math.ceil(billableSec / 60);
    const amount = billableMin * (match.consultation.ratePerMin || 0);

    let paymentStatus = "free";
    if (amount > 0) {
      const clientWallet = await getOrCreateWallet(match.consultation.client);
      if (clientWallet.balance < amount) {
        paymentStatus = "failed";
      } else {
        clientWallet.balance -= amount;
        await clientWallet.save();
        await WalletTransaction.create({
          user: match.consultation.client,
          type: "debit",
          amount,
          balanceAfter: clientWallet.balance,
          reason: "consultation_charge",
          consultationMatch: match._id,
          meta: { billableMin, ratePerMin: match.consultation.ratePerMin },
        });
        const astroWallet = await getOrCreateWallet(match.consultation.astrologer);
        astroWallet.balance += amount;
        await astroWallet.save();
        await WalletTransaction.create({
          user: match.consultation.astrologer,
          type: "credit",
          amount,
          balanceAfter: astroWallet.balance,
          reason: "consultation_earning",
          consultationMatch: match._id,
          meta: { billableMin, ratePerMin: match.consultation.ratePerMin },
        });
        paymentStatus = "deducted";
      }
    }

    usage.freeSecondsUsed += freeSecGranted;
    if (usage.freeSecondsUsed >= limitSec) usage.freeExhausted = true;
    await usage.save();

    match.status = "ended";
    match.consultation.endedAt = endedAt;
    match.consultation.durationSec = durationSec;
    match.consultation.freeSecGranted = freeSecGranted;
    match.consultation.billableSec = billableSec;
    match.consultation.amount = amount;
    match.consultation.paymentStatus = paymentStatus;
    await match.save();

    if (profile) {
      profile.totalConsultations += 1;
      profile.totalFreeMinutesGiven += Math.round(freeSecGranted / 60);
      if (paymentStatus === "deducted") profile.totalEarnings += amount;
      await profile.save();
    }

    // Promote next in queue
    const nextQueued = await ConsultationQueue.findOne({ astrologer: match.consultation.astrologer, status: "waiting" }).sort({ createdAt: 1 });
    const io = getIo();
    if (io) {
      io.to(`match:${String(match._id)}`).emit("consultation:ended", {
        matchId: String(match._id),
        durationSec,
        freeSecGranted,
        billableSec,
        billableMin,
        amount,
        paymentStatus,
      });
      if (nextQueued) {
        io.to(`user:${String(nextQueued.client)}`).emit("consultation:turn", { queueId: nextQueued._id, astrologerId: String(match.consultation.astrologer) });
      }
    }

    res.json({
      success: true,
      message: paymentStatus === "failed" ? "Consultation ended. Payment failed — please recharge." : "Consultation ended",
      data: { match, durationSec, freeSecGranted, billableSec, billableMin, amount, paymentStatus },
    });
  } catch (error) { next(error); }
};

// GET /api/consultations/:matchId/status — remaining free + billing preview
const getConsultationStatus = async (req, res, next) => {
  try {
    const match = await Match.findOne({
      _id: req.params.matchId,
      matchType: "consultation",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    }).lean();
    if (!match) return res.status(404).json({ success: false, message: "Consultation not found" });
    const profile = await AstrologerProfile.findOne({ user: match.consultation.astrologer }).lean();
    const limitSec = profile && profile.freeMinutesEnabled ? (profile.freeMinutesLimitMin ?? 10) * 60 : 0;
    const usage = await FreeUsage.findOne({ client: match.consultation.client, astrologer: match.consultation.astrologer }).lean();
    const freeRemainingSec = Math.max(0, limitSec - (usage?.freeSecondsUsed || 0));
    const startedAt = match.consultation.startedAt || match.createdAt;
    const elapsedSec = match.status === "ended"
      ? match.consultation.durationSec
      : Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
    res.json({
      success: true,
      data: {
        matchId: match._id,
        status: match.status,
        elapsedSec,
        freeRemainingSec,
        freeSecGranted: match.consultation.freeSecGranted,
        ratePerMin: match.consultation.ratePerMin,
        isPaidPhase: elapsedSec >= freeRemainingSec + (match.consultation.freeSecGranted || 0),
        amount: match.consultation.amount,
        paymentStatus: match.consultation.paymentStatus,
      },
    });
  } catch (error) { next(error); }
};

// POST /api/consultations/:matchId/review
const submitReview = async (req, res, next) => {
  try {
    const { rating, comment = "" } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "rating (1-5) is required" });
    }
    const match = await Match.findOne({
      _id: req.params.matchId,
      matchType: "consultation",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    });
    if (!match) return res.status(404).json({ success: false, message: "Consultation not found" });
    if (match.status !== "ended") {
      return res.status(400).json({ success: false, message: "You can review only after the consultation ends" });
    }
    // Only the client reviews
    if (String(match.consultation.client) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only the client can review" });
    }
    const existing = await Review.findOne({ consultationMatch: match._id });
    if (existing) return res.status(409).json({ success: false, message: "Already reviewed" });

    const review = await Review.create({
      consultationMatch: match._id,
      astrologer: match.consultation.astrologer,
      client: match.consultation.client,
      rating,
      comment: String(comment).slice(0, 1000),
    });
    match.consultation.reviewGiven = true;
    await match.save();

    // Recompute avg
    const agg = await Review.aggregate([
      { $match: { astrologer: match.consultation.astrologer } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    await AstrologerProfile.findOneAndUpdate(
      { user: match.consultation.astrologer },
      { ratingAvg: agg[0] ? Number(agg[0].avg.toFixed(1)) : rating, ratingCount: agg[0]?.count || 1 }
    );

    res.status(201).json({ success: true, message: "Review submitted", data: review });
  } catch (error) { next(error); }
};

// Queue accept/decline by astrologer
const respondToQueue = async (req, res, next) => {
  try {
    const { action } = req.body; // accept | decline
    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be accept or decline" });
    }
    const entry = await ConsultationQueue.findOne({ _id: req.params.queueId, astrologer: req.user._id, status: "waiting" });
    if (!entry) return res.status(404).json({ success: false, message: "Queue entry not found" });
    entry.status = action === "accept" ? "active" : "cancelled";
    await entry.save();
    const io = getIo();
    if (io) {
      io.to(`user:${String(entry.client)}`).emit(
        action === "accept" ? "consultation:turn" : "consultation:declined",
        { queueId: entry._id, astrologerId: String(req.user._id) }
      );
    }
    res.json({ success: true, message: action === "accept" ? "Client promoted" : "Queue entry declined", data: entry });
  } catch (error) { next(error); }
};

const cancelQueueEntry = async (req, res, next) => {
  try {
    const entry = await ConsultationQueue.findOne({ _id: req.params.queueId, client: req.user._id, status: "waiting" });
    if (!entry) return res.status(404).json({ success: false, message: "Queue entry not found" });
    entry.status = "cancelled";
    await entry.save();
    res.json({ success: true, message: "Removed from queue", data: entry });
  } catch (error) { next(error); }
};

module.exports = {
  requestConsultation,
  endConsultation,
  getConsultationStatus,
  submitReview,
  respondToQueue,
  cancelQueueEntry,
};
