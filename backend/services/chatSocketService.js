const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Match = require("../models/match");
const Message = require("../models/message");
const User = require("../models/user");
const Profile = require("../models/profile");
const { blockedMessageReason } = require("./messageFilter");
const {
  setActiveChat,
  clearActiveChat,
  setUserInCall,
  clearUserInCall,
  isUserInCall,
  getPendingCallsFor,
  addPendingCall,
  removePendingCall,
  clearPendingCalls,
} = require("./socketHub");
const { sendChatNotification, sendCallNotification } = require("./notificationService");

const getCookieValue = (cookieHeader, name) => {
  const cookie = cookieHeader?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
};

const getParticipantMatch = async (matchId, userId) => {
  if (!mongoose.isValidObjectId(matchId)) return null;
  const match = await Match.findOne({ _id: matchId, $or: [{ userA: userId }, { userB: userId }] }).lean();
  return match?.status === "accepted" ? match : null;
};

const getOtherParticipant = (match, userId) =>
  String(match.userA) === String(userId) ? match.userB : match.userA;

const getCallParticipant = (match, userId) =>
  String(match.userA) === String(userId) ? match.userB : match.userA;

const createMessage = async (match, userId, text) => {
  const message = await Message.create({
    match: match._id,
    sender: userId,
    recipient: getOtherParticipant(match, userId),
    text,
  });

  return Message.findById(message._id)
    .populate("sender", "name")
    .populate("recipient", "name")
    .lean();
};

const setupChatSockets = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || getCookieValue(socket.handshake.headers.cookie, "token");
      if (!token) return next(new Error("Authentication required"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) return next(new Error("Authentication required"));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user._id}`);

    socket.on("disconnect", () => {
      clearActiveChat(socket.user._id);
      clearUserInCall(socket.user._id);
      clearPendingCalls(socket.user._id);
    });

    socket.on("chat:join", async ({ matchId } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Match not found or you are not a participant" });

        socket.join(`match:${matchId}`);
        setActiveChat(socket.user._id, matchId);
        acknowledge({ success: true, matchId });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to join chat" });
      }
    });

    socket.on("chat:leave", ({ matchId } = {}, acknowledge = () => {}) => {
      socket.leave(`match:${matchId}`);
      clearActiveChat(socket.user._id);
      acknowledge({ success: true, matchId });
    });

    socket.on("chat:send", async ({ matchId, text } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Match not found or you are not a participant" });

        const cleanText = typeof text === "string" ? text.trim() : "";
        if (!cleanText) return acknowledge({ success: false, message: "Message text is required" });
        if (cleanText.length > 2000) return acknowledge({ success: false, message: "Message text cannot exceed 2000 characters" });

        const blockReason = blockedMessageReason(cleanText);
        if (blockReason) return acknowledge({ success: false, message: blockReason });

        const message = await createMessage(match, socket.user._id, cleanText);
        io.to(`match:${matchId}`).emit("chat:message", message);

        let senderPhoto = "";
        try {
          const senderProfile = await Profile.findOne({ user: socket.user._id })
            .select("photos profilePhoto")
            .lean();
          senderPhoto =
            senderProfile?.photos?.[0] || senderProfile?.profilePhoto || "";
        } catch (_) {}

        sendChatNotification({
          recipientId: message.recipient?._id || message.recipient,
          senderId: socket.user._id,
          senderName: socket.user.name,
          senderPhoto,
          matchId,
          text: cleanText,
          type: "text",
          messageId: message._id,
        });

        acknowledge({ success: true, data: message });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to send message" });
      }
    });

    socket.on("chat:typing", async ({ matchId } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Match not found or you are not a participant" });
        io.to(`match:${matchId}`).emit("chat:typing", { matchId, userId: String(socket.user._id) });
        acknowledge({ success: true });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to notify typing" });
      }
    });

    socket.on("chat:typing-stop", async ({ matchId } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Match not found or you are not a participant" });
        io.to(`match:${matchId}`).emit("chat:typing-stop", { matchId, userId: String(socket.user._id) });
        acknowledge({ success: true });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to notify typing" });
      }
    });

    socket.on("chat:read", async ({ matchId } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Match not found or you are not a participant" });

        const update = await Message.updateMany(
          { match: match._id, recipient: socket.user._id, readAt: null },
          { $set: { readAt: new Date() } }
        );
        io.to(`match:${matchId}`).emit("chat:read", { matchId, userId: String(socket.user._id) });
        acknowledge({ success: true, data: { updatedCount: update.modifiedCount } });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to mark messages as read" });
      }
    });

    socket.on("call:invite", async ({ matchId, kind } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Calls are available only after the match request is accepted" });
        if (!["voice", "video"].includes(kind)) return acknowledge({ success: false, message: "kind must be voice or video" });

        const callerId = String(socket.user._id);
        const calleeId = String(getCallParticipant(match, socket.user._id));

        const busyUser = isUserInCall(calleeId);
        if (busyUser) {
          io.to(`user:${callerId}`).emit("call:busy", { matchId: String(matchId), kind, userId: calleeId, message: "Callee is already in another call" });
          return acknowledge({ success: true, busy: true });
        }

        let callerPhoto = "";
        let calleePhoto = "";
        let calleeName = "Your match";
        const [callerProfile, calleeProfile, calleeUserDoc] = await Promise.all([
          Profile.findOne({ user: socket.user._id }).select("photos profilePhoto").lean(),
          Profile.findOne({ user: calleeId }).select("photos profilePhoto").lean(),
          User.findById(calleeId).select("name").lean(),
        ]);
        callerPhoto = callerProfile?.photos?.[0] || callerProfile?.profilePhoto || "";
        calleePhoto = calleeProfile?.photos?.[0] || calleeProfile?.profilePhoto || "";
        calleeName = calleeUserDoc?.name || "Your match";

        addPendingCall(calleeId, matchId, {
          callerId,
          callerName: socket.user.name,
          kind,
        });

        io.to(`user:${calleeId}`).emit("call:incoming", {
          matchId,
          kind,
          caller: { id: callerId, name: socket.user.name, photo: callerPhoto },
        });

        sendCallNotification({
          recipientId: calleeId,
          callerId,
          callerName: socket.user.name,
          callerPhoto,
          matchId,
          kind,
        });

        acknowledge({ success: true, callee: { id: calleeId, name: calleeName, photo: calleePhoto } });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to start call" });
      }
    });

    socket.on("call:respond", async ({ matchId, accepted } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Calls are available only after the match request is accepted" });
        if (typeof accepted !== "boolean") return acknowledge({ success: false, message: "accepted must be a boolean" });

        const responderId = String(socket.user._id);
        const matchIdStr = String(matchId);

        if (accepted) {
          const peerId = String(getCallParticipant(match, socket.user._id));
          const pending = Array.from(getPendingCallsFor(responderId).entries());
          clearPendingCalls(responderId);

          const acceptedEntry = pending.find(([m]) => m === matchIdStr);
          const acceptedKind = acceptedEntry?.[1]?.kind || "voice";

          setUserInCall(responderId, matchIdStr, acceptedKind);
          setUserInCall(peerId, matchIdStr, acceptedKind);

          for (const [otherMatchId, entry] of pending) {
            if (otherMatchId === matchIdStr) continue;
            const busyKind = entry?.kind || "voice";
            io.to(`user:${entry?.callerId}`).emit("call:busy", {
              matchId: otherMatchId,
              kind: busyKind,
              userId: responderId,
              message: "Callee is already in another call",
            });
          }
        } else {
          removePendingCall(responderId, matchIdStr);
        }

        io.to(`match:${matchId}`).emit("call:response", { matchId, accepted, userId: String(socket.user._id) });
        acknowledge({ success: true });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to respond to call" });
      }
    });

    socket.on("call:end", async ({ matchId } = {}, acknowledge = () => {}) => {
      try {
        const match = await getParticipantMatch(matchId, socket.user._id);
        if (!match) return acknowledge({ success: false, message: "Calls are available only after the match request is accepted" });
        const userId = String(socket.user._id);
        const peerId = String(getCallParticipant(match, socket.user._id));
        clearUserInCall(userId);
        clearUserInCall(peerId);
        removePendingCall(peerId, String(matchId));
        removePendingCall(userId, String(matchId));
        io.to(`match:${matchId}`).emit("call:ended", { matchId, userId });
        acknowledge({ success: true });
      } catch (error) {
        acknowledge({ success: false, message: "Unable to end call" });
      }
    });
  });
};

module.exports = { setupChatSockets };