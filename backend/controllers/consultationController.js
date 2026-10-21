const mongoose = require("mongoose");
const User = require("../models/user");
const Match = require("../models/match");
const AstrologerProfile = require("../models/astrologerProfile");
const ConsultationQueue = require("../models/consultationQueue");
const Review = require("../models/review");
const { getIo, isUserInCall } = require("../services/socketHub");
const {
  sendConsultationNotification,
  sendQueueNotification,
} = require("../services/notificationService");
const {
  getOrCreateWallet,
  freeRemainingSecFor,
  settleConsultation,
  ensureBillable,
  billingPreview,
  finalizeConsultation,
  paidMinutesLeft,
  MIN_PAID_BLOCK_MIN,
} = require("../services/consultationBilling");

/// The bill fields the app reads back from `end` / `status`, built from the
/// stored document (used for an already-closed session).
const billFromMatch = (match) => {
  const c = match.consultation || {};
  const billableSec = c.billableSec || 0;
  return {
    match,
    status: match.status,
    durationSec: c.durationSec || 0,
    freeSecGranted: c.freeSecGranted || 0,
    billableSec,
    billableMin: c.billedMin || Math.ceil(billableSec / 60),
    dueAmount: Math.ceil(billableSec / 60) * (c.ratePerMin || 0),
    amount: c.amount || 0,
    chargedAmount: c.amount || 0,
    paymentStatus: c.paymentStatus || "pending",
    ratePerMin: c.ratePerMin || 0,
    endedReason: c.endedReason || null,
    insufficient: false,
  };
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
    const freeRemainingSec = await freeRemainingSecFor(req.user._id, profile);

    // A pair owns exactly ONE match document (unique index on userA+userB), so
    // every request has to work with the doc that already exists. Looking only
    // for an *active same-channel* session and then inserting a new doc meant
    // any other state — session already ended, an earlier session on another
    // channel, or a plain matchmaking match between the same pair — hit Mongo's
    // E11000 duplicate key, which the global handler turned into
    // 409 "A record with that value already exists" and the chat never opened.
    const existing = await Match.findOne({
      $or: [
        { userA: req.user._id, userB: astrologerId },
        { userA: astrologerId, userB: req.user._id },
      ],
    });

    // Join an in-progress session this client already owns instead of opening a
    // second one. A session started for any channel is reused as-is: its clock
    // and rate stay untouched (changing them mid-session would lose billable
    // time), while the client decides on its own whether to show the chat or
    // dial a call from the returned matchId.
    const runningConsultation =
      existing &&
      existing.matchType === "consultation" &&
      ["accepted", "active"].includes(existing.status) &&
      String(existing.consultation?.client) === String(req.user._id);
    let match = runningConsultation ? existing : null;

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
      // The socket only reaches a console that is open, so the waiting client
      // is pushed as well — a person in the queue must never be invisible.
      sendQueueNotification({
        astrologerId,
        clientId: req.user._id,
        clientName: req.user.name,
        position: waitingCount + 1,
      }).catch((error) =>
        console.error("[push] queue notification failed:", error?.message || error),
      );
      return res.status(202).json({
        success: true,
        message: "Astrologer is busy. You are in the queue.",
        data: { queued: true, queueId: queueEntry._id, position: waitingCount + 1, freeRemainingSec, ratePerMin },
      });
    }

    // Free minutes come first; only once the pair's free window is used up does
    // the client have to have paid — at least MIN_PAID_BLOCK_MIN minute(s) of
    // balance — before the chat or call can continue. A running session the
    // client can no longer pay for is closed here (and its final minute billed)
    // instead of being handed back as a live-but-unpayable thread.
    if (freeRemainingSec <= 0) {
      if (match) {
        const gate = await ensureBillable(match);
        if (!gate.ok && gate.reason !== "busy") {
          await finalizeConsultation(match, { reason: "insufficient_balance" });
          match = null;
        }
      }
      const wallet = await getOrCreateWallet(req.user._id);
      const minRequired = ratePerMin * MIN_PAID_BLOCK_MIN;
      if (wallet.balance < minRequired) {
        return res.status(402).json({
          success: false,
          code: "INSUFFICIENT_BALANCE",
          message: `Insufficient balance. Minimum ₹${minRequired} required (${MIN_PAID_BLOCK_MIN} min). Please recharge.`,
          data: {
            balance: wallet.balance,
            minRequired,
            ratePerMin,
            freeRemainingSec: 0,
            paidMinutesLeft: paidMinutesLeft(wallet.balance, ratePerMin),
          },
        });
      }
    }

    if (!match) {
      if (existing) {
        // Revive the pair's document instead of inserting a second one (the
        // unique index would reject it): keep its id — chat history and both
        // inboxes stay stable — but start a brand-new session on it. The old
        // session was already ended, ran on another channel, or the doc was a
        // matchmaking match this pair had created earlier.
        match = existing;
        match.matchType = "consultation";
        match.status = "accepted";
        match.requestedBy = req.user._id;
        match.requestedTo = astrologerId;
        match.respondedAt = new Date();
        // A conversation deleted earlier must reappear when the consultation
        // restarts, otherwise the chat opens but the tile never returns.
        match.hiddenFor = (match.hiddenFor || [])
          .filter((id) => String(id) !== String(req.user._id));
        match.consultation = {
          astrologer: astrologerId,
          client: req.user._id,
          channel,
          ratePerMin,
          startedAt: new Date(),
          paymentStatus: "pending",
        };
        await match.save();
      } else {
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

    // The socket event above only reaches a console that is open and
    // connected, so the astrologer is pushed as well — a request has to land
    // even when their app is closed.
    sendConsultationNotification({
      astrologerId,
      astrologerName: astrologer.name || "",
      clientId: req.user._id,
      clientName: req.user.name,
      matchId: match._id,
      channel,
      ratePerMin,
    }).catch((error) =>
      console.error("[push] consultation notification failed:", error?.message || error),
    );

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

// POST /api/consultations/:matchId/end — either participant; the billing
// service closes the clock and settles whatever minute was in progress.
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
      return res.json({
        success: true,
        message: "Already ended",
        data: billFromMatch(match),
      });
    }

    const reason =
      String(match.consultation.client) === String(req.user._id) ? "user" : "astrologer";
    const summary = await finalizeConsultation(match, { reason });

    res.json({
      success: true,
      message:
        summary.paymentStatus === "failed"
          ? "Consultation ended. Wallet balance ran out — please recharge."
          : "Consultation ended",
      data: {
        match: summary.match,
        durationSec: summary.durationSec,
        freeSecGranted: summary.freeSecGranted,
        billableSec: summary.billableSec,
        billableMin: summary.billableMin,
        dueAmount: summary.dueAmount,
        amount: summary.amount,
        chargedAmount: summary.amount,
        paymentStatus: summary.paymentStatus,
        reason,
        endedReason: reason,
      },
    });
  } catch (error) { next(error); }
};

// GET /api/consultations/:matchId/status — billing meter + remaining paid time
const getConsultationStatus = async (req, res, next) => {
  try {
    const match = await Match.findOne({
      _id: req.params.matchId,
      matchType: "consultation",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    });
    if (!match) return res.status(404).json({ success: false, message: "Consultation not found" });

    // Running the meter here is what makes the client's countdown honest: the
    // poll both bills the elapsed minutes and reports how many are still paid
    // for. A session that just ran out of money is closed on the spot.
    const summary = await settleConsultation(match);
    if (summary && !summary.skipped && summary.insufficient && match.status !== "ended") {
      await finalizeConsultation(match, { reason: "insufficient_balance" });
    }
    if (summary && !summary.skipped && match.status === "ended") {
      summary.status = "ended";
    }

    const bill = summary && !summary.skipped ? billingPreview(summary) : null;
    const stored = billFromMatch(match);
    const freeRemainingSec = bill?.freeRemainingSec ?? 0;
    // The meter belongs to the payer (the client). Only the client is asked to
    // recharge — the astrologer keeps their composer so they can nudge them,
    // and the session itself is stopped by the billing sweep.
    const isPayer =
      String(match.consultation.client) === String(req.user._id);

    res.json({
      success: true,
      data: {
        matchId: match._id,
        status: match.status,
        elapsedSec: bill?.durationSec ?? stored.durationSec,
        freeRemainingSec,
        freeSecGranted: bill?.freeSecGranted ?? stored.freeSecGranted,
        ratePerMin: bill?.ratePerMin ?? stored.ratePerMin,
        isPaidPhase: match.status !== "ended" && freeRemainingSec <= 0,
        billableMin: bill?.billableMin ?? stored.billableMin,
        dueAmount: bill?.dueAmount ?? stored.dueAmount,
        amount: bill?.chargedAmount ?? stored.amount,
        chargedAmount: bill?.chargedAmount ?? stored.amount,
        paymentStatus: bill?.paymentStatus ?? stored.paymentStatus,
        walletBalance: bill?.walletBalance ?? 0,
        paidMinutesLeft: bill?.paidMinutesLeft ?? paidMinutesLeft(0, stored.ratePerMin),
        requiresRecharge: isPayer && (bill?.requiresRecharge ?? false),
        endedReason: match.consultation.endedReason || null,
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
