const mongoose = require("mongoose");
const Match = require("../models/match");
const Message = require("../models/message");
const { blockedMessageReason } = require("../services/messageFilter");
const { getIo } = require("../services/socketHub");
const { sendChatNotification } = require("../services/notificationService");

const getParticipantMatch = async (matchId, userId) => {
  if (!mongoose.isValidObjectId(matchId)) return { error: "Invalid matchId", status: 400 };

  const match = await Match.findOne({
    _id: matchId,
    $or: [{ userA: userId }, { userB: userId }],
  }).lean();

  if (!match) return { error: "Match not found or you are not a participant", status: 404 };
  if (match.status !== "accepted") return { error: "Chat is available only after the match request is accepted", status: 403 };
  return { match };
};

const getOtherParticipant = (match, userId) =>
  String(match.userA) === String(userId) ? match.userB : match.userA;

const parsePagination = (query) => {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 100);
  const before = query.before && !Number.isNaN(Date.parse(query.before)) ? new Date(query.before) : null;
  return { limit, before };
};

const populateMessage = (id) =>
  Message.findById(id)
    .populate("sender", "name")
    .populate("recipient", "name");

const broadcastMessage = (matchId, message) => {
  const io = getIo();
  if (io) io.to(`match:${matchId}`).emit("chat:message", message);
};

const getMessageAsParticipant = async (messageId, userId) => {
  if (!mongoose.isValidObjectId(messageId)) return { error: "Invalid messageId", status: 400 };
  const message = await Message.findById(messageId);
  if (!message) return { error: "Message not found", status: 404 };

  const match = await Match.findOne({
    _id: message.match,
    $or: [{ userA: userId }, { userB: userId }],
  }).lean();
  if (!match) return { error: "You are not a participant of this chat", status: 403 };

  return { message, match };
};

const getChatHistory = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const before = req.query.before && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before) : null;
    const matches = await Match.find({
      status: "accepted",
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
    }).select("_id").lean();
    const filter = { match: { $in: matches.map((match) => match._id) }, deletedFor: { $nin: [req.user._id] } };
    if (before) filter.createdAt = { $lt: before };

    const messages = await Message.find(filter)
      .populate("match", "userA userB")
      .populate("sender", "name")
      .populate("recipient", "name")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, message: "Chat history retrieved", data: messages, pagination: { limit, hasMore: messages.length === limit } });
  } catch (error) { next(error); }
};

const getMessages = async (req, res, next) => {
  try {
    const result = await getParticipantMatch(req.params.matchId, req.user._id);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });

    const { limit, before } = parsePagination(req.query);
    const filter = { match: result.match._id, deletedFor: { $nin: [req.user._id] } };
    if (before) filter.createdAt = { $lt: before };

    const messages = await Message.find(filter)
      .populate("sender", "name")
      .populate("recipient", "name")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, message: "Messages retrieved", data: messages.reverse(), pagination: { limit, hasMore: messages.length === limit } });
  } catch (error) { next(error); }
};

const sendMessage = async (req, res, next) => {
  try {
    const result = await getParticipantMatch(req.params.matchId, req.user._id);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ success: false, message: "Message text is required" });
    if (text.length > 2000) return res.status(400).json({ success: false, message: "Message text cannot exceed 2000 characters" });

    const blockReason = blockedMessageReason(text);
    if (blockReason) return res.status(400).json({ success: false, message: blockReason });

    const message = await Message.create({
      match: result.match._id,
      sender: req.user._id,
      recipient: getOtherParticipant(result.match, req.user._id),
      type: "text",
      text,
    });

    const populatedMessage = await populateMessage(message._id);

    sendChatNotification({
      recipientId: populatedMessage.recipient?._id || populatedMessage.recipient,
      senderId: req.user._id,
      senderName: req.user.name,
      matchId: result.match._id,
      text,
      type: "text",
      messageId: populatedMessage._id,
    });

    res.status(201).json({ success: true, message: "Message sent", data: populatedMessage });
  } catch (error) { next(error); }
};

const sendStickerMessage = async (req, res, next) => {
  try {
    const result = await getParticipantMatch(req.params.matchId, req.user._id);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 200) return res.status(400).json({ success: false, message: "Sticker is invalid" });

    const message = await Message.create({
      match: result.match._id,
      sender: req.user._id,
      recipient: getOtherParticipant(result.match, req.user._id),
      type: "sticker",
      text,
    });

    const populatedMessage = await populateMessage(message._id);
    broadcastMessage(result.match._id.toString(), populatedMessage.toObject());

    sendChatNotification({
      recipientId: populatedMessage.recipient?._id || populatedMessage.recipient,
      senderId: req.user._id,
      senderName: req.user.name,
      matchId: result.match._id,
      text,
      type: "sticker",
      messageId: populatedMessage._id,
    });

    res.status(201).json({ success: true, message: "Sticker sent", data: populatedMessage });
  } catch (error) { next(error); }
};

const sendMediaMessage = async (req, res, next) => {
  try {
    const result = await getParticipantMatch(req.params.matchId, req.user._id);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });
    if (!req.file) return res.status(400).json({ success: false, message: "A media file is required" });

    const mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
    const caption = typeof req.body.caption === "string" ? req.body.caption.trim().slice(0, 500) : "";

    const message = await Message.create({
      match: result.match._id,
      sender: req.user._id,
      recipient: getOtherParticipant(result.match, req.user._id),
      type: "media",
      mediaType,
      mediaUrl: `/uploads/chat-media/${req.file.filename}`,
      text: caption,
    });

    const populatedMessage = await populateMessage(message._id);
    broadcastMessage(result.match._id.toString(), populatedMessage.toObject());

    sendChatNotification({
      recipientId: populatedMessage.recipient?._id || populatedMessage.recipient,
      senderId: req.user._id,
      senderName: req.user.name,
      matchId: result.match._id,
      text: caption,
      type: "media",
      messageId: populatedMessage._id,
    });

    res.status(201).json({ success: true, message: "Media message sent", data: populatedMessage });
  } catch (error) { next(error); }
};

const deleteMessageForMe = async (req, res, next) => {
  try {
    const result = await getMessageAsParticipant(req.params.messageId, req.user._id);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });

    await Message.updateOne(
      { _id: result.message._id, deletedForAll: false },
      { $addToSet: { deletedFor: req.user._id } }
    );
    res.json({ success: true, message: "Message deleted for you", data: { messageId: result.message._id } });
  } catch (error) { next(error); }
};

const deleteMessageForEveryone = async (req, res, next) => {
  try {
    const result = await getMessageAsParticipant(req.params.messageId, req.user._id);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });
    if (String(result.message.sender) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only the sender can delete this message for everyone" });
    }

    await Message.updateOne(
      { _id: result.message._id },
      { $set: { deletedForAll: true, text: "", mediaUrl: null, deletedFor: [] } }
    );
    const io = getIo();
    if (io) io.to(`match:${result.match._id.toString()}`).emit("chat:deleted", { matchId: result.match._id.toString(), messageId: result.message._id });
    res.json({ success: true, message: "Message deleted for everyone", data: { messageId: result.message._id } });
  } catch (error) { next(error); }
};

const markMessagesRead = async (req, res, next) => {
  try {
    const result = await getParticipantMatch(req.params.matchId, req.user._id);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });

    const update = await Message.updateMany(
      { match: result.match._id, recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ success: true, message: "Messages marked as read", data: { updatedCount: update.modifiedCount } });
  } catch (error) { next(error); }
};

module.exports = {
  getChatHistory,
  getMessages,
  sendMessage,
  sendStickerMessage,
  sendMediaMessage,
  deleteMessageForMe,
  deleteMessageForEveryone,
  markMessagesRead,
};