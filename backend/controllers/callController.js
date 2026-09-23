const mongoose = require("mongoose");
const { AccessToken } = require("livekit-server-sdk");
const Match = require("../models/match");

const createCallToken = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.matchId)) {
      return res.status(400).json({ success: false, message: "Invalid matchId" });
    }

    const kind = req.body?.kind || "video";
    if (!["voice", "video"].includes(kind)) {
      return res.status(400).json({ success: false, message: "kind must be voice or video" });
    }

    const match = await Match.findOne({
      _id: req.params.matchId,
      status: "accepted",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    }).lean();
    if (!match) return res.status(403).json({ success: false, message: "Calls are available only after the match request is accepted" });

    const secret = process.env.LIVEKIT_API_SECRET || "";
    const looksPlaceholder = /[•*]/.test(secret) || secret.includes("your-secret-here") || secret === "replace_me";
    if (!process.env.LIVEKIT_API_KEY || !secret || !process.env.LIVEKIT_URL || looksPlaceholder) {
      return res.status(503).json({ success: false, message: "LiveKit is not configured on the server" });
    }

    const roomName = `match-${match._id}`;
    const accessToken = new AccessToken(process.env.LIVEKIT_API_KEY, secret, {
      identity: String(req.user._id),
      name: req.user.name,
      ttl: "1h",
    });
    accessToken.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    res.json({
      success: true,
      message: `${kind} call token created`,
      data: { token: await accessToken.toJwt(), serverUrl: process.env.LIVEKIT_URL, roomName, kind },
    });
  } catch (error) { next(error); }
};

module.exports = { createCallToken };