const { messaging } = require("../config/firebase");
const DeviceToken = require("../models/deviceToken");

const sendNotificationToToken = async ({ token, title, body, data = {} }) => {
  try {
    if (!messaging) {
      return { success: false, error: "Firebase is not initialized" };
    }

    const payload = {
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          String(value),
        ])
      ),
    };

    const messageId = await messaging.send(payload);

    return {
      success: true,
      messageId,
    };
  } catch (error) {
    console.error("FCM send error:", error.code || error.message);
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
};

const { isUserViewingChat } = require("./socketHub");

/// FCM error codes that mean the token itself is dead — the app was
/// uninstalled or the token rotated. Such a token is never tried again.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const messageBodyFor = (type, text) => {
  switch (type) {
    case "sticker":
      return "sent you a sticker";
    case "media":
      return text ? `📎 ${text}` : "sent you a photo/video";
    default:
      return text || "sent you a message";
  }
};

/**
 * Sends an FCM push for a new chat message, but SKIPS it when the
 * recipient is currently viewing that exact chat (their socket joined
 * the match room, tracked in socketHub).
 */
const sendChatNotification = async ({
  recipientId,
  senderId,
  senderName,
  senderPhoto = "",
  matchId,
  text,
  type = "text",
  messageId,
}) => {
  if (String(senderId) === String(recipientId)) return { success: false };
  if (isUserViewingChat(recipientId, matchId)) {
    return { success: false, skipped: "viewing_chat" };
  }

  const body = messageBodyFor(type, text);

  return sendNotificationToUser({
    userId: recipientId,
    title: senderName,
    body,
    data: {
      type: "chat",
      matchId: String(matchId),
      messageId: messageId ? String(messageId) : "",
      senderId: String(senderId),
      senderName: String(senderName),
      senderPhoto: senderPhoto ? String(senderPhoto) : "",
    },
  });
};

/**
 * Sends an FCM push for an incoming voice/video call. Pushes even when the
 * recipient is online (the socket event is the primary channel; the push is
 * the safety net whenever the app is backgrounded/closed).
 */
const sendCallNotification = async ({
  recipientId,
  callerId,
  callerName,
  callerPhoto = "",
  matchId,
  kind,
}) => {
  if (String(callerId) === String(recipientId)) return { success: false };

  const body =
    kind === "video"
      ? "Incoming video call…"
      : kind === "voice"
        ? "Incoming voice call…"
        : "is calling you";
  const title = callerName || "Your match";

  return sendNotificationToUser({
    userId: recipientId,
    title,
    body,
    data: {
      type: "call",
      matchId: String(matchId),
      kind: kind === "video" ? "video" : "voice",
      callerId: String(callerId),
      callerName: String(callerName || ""),
      callerPhoto: callerPhoto ? String(callerPhoto) : "",
    },
  });
};

const sendNotificationToUser = async ({ userId, title, body, data = {} }) => {
  if (!messaging) {
    // Firebase is not configured or could not start — the push is skipped, but
    // the chat or the consultation itself is unaffected.
    console.warn(`[push] Firebase is unavailable — "${title}" skipped`);
    return {
      success: false,
      reason: "firebase_unavailable",
      sent: 0,
      failed: 0,
      results: [],
    };
  }

  let devices = [];
  try {
    devices = await DeviceToken.find({
      user: userId,
      isActive: true,
    });
  } catch (error) {
    // A database hiccup must never take the chat or the consultation down.
    console.error(`[push] could not read device tokens for ${userId}:`, error.message);
    return {
      success: false,
      error: "Could not read device tokens",
      sent: 0,
      failed: 0,
      results: [],
    };
  }

  if (!devices.length) {
    // Not an error: the person may simply not have the app installed.
    console.warn(`[push] no active device for user ${userId} — "${title}" skipped`);
    return {
      success: false,
      reason: "no_device",
      sent: 0,
      failed: 0,
      results: [],
    };
  }

  const results = [];

  for (const device of devices) {
    const result = await sendNotificationToToken({
      token: device.token,
      title,
      body,
      data,
    });

    results.push({
      token: device.token,
      ...result,
    });

    if (result.success) {
      try {
        await DeviceToken.findByIdAndUpdate(device._id, {
          lastUsedAt: new Date(),
        });
      } catch (error) {
        // Keeping the "last used" stamp fresh is nice to have, not critical.
        console.error(`[push] could not update the token stamp: ${error.message}`);
      }
    } else if (DEAD_TOKEN_CODES.has(result.code)) {
      // The app is gone or the token rotated — stop trying this one.
      try {
        await DeviceToken.findByIdAndUpdate(device._id, {
          isActive: false,
        });
        console.warn(`[push] dropped a dead token for user ${userId}`);
      } catch (error) {
        console.error(`[push] could not drop a dead token: ${error.message}`);
      }
    } else {
      console.error(
        `[push] failed for user ${userId} (${result.code || "unknown"}): ${result.error}`,
      );
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.length - sent;
  if (failed > 0) {
    console.warn(`[push] "${title}" → ${sent} sent, ${failed} failed (user ${userId})`);
  } else {
    console.log(`[push] "${title}" → ${sent} sent (user ${userId})`);
  }

  return {
    success: sent > 0,
    sent,
    failed,
    results,
  };
};

/**
 * Push for a brand new consultation request. The socket event only reaches a
 * console that is open and connected, so the astrologer also gets a push —
 * otherwise a request never lands when their app is closed.
 */
const sendConsultationNotification = async ({
  astrologerId,
  astrologerName = "",
  clientId,
  clientName = "",
  matchId,
  channel = "chat",
  ratePerMin = 0,
}) => {
  const name = clientName || "A client";
  const body =
    channel === "chat"
      ? `${name} wants to chat with you.`
      : channel === "video"
        ? `${name} wants a video call with you.`
        : `${name} wants to talk to you.`;

  const result = await sendNotificationToUser({
    userId: astrologerId,
    title: "New consultation request",
    body,
    data: {
      type: "consultation",
      matchId: String(matchId),
      channel,
      ratePerMin: String(ratePerMin || 0),
      clientId: String(clientId || ""),
      clientName: name,
      astrologerId: String(astrologerId || ""),
      astrologerName: astrologerName || "",
    },
  });

  return result;
};

/**
 * Push for a client that had to wait in the queue because the astrologer was
 * busy. The astrologer gets it so someone waiting is never invisible.
 */
const sendQueueNotification = async ({
  astrologerId,
  clientId,
  clientName = "",
  position = 1,
}) => {
  const name = clientName || "A client";
  const result = await sendNotificationToUser({
    userId: astrologerId,
    title: "Someone is waiting",
    body:
      position > 1
        ? `${name} is waiting in your queue (position ${position}).`
        : `${name} is waiting for you.`,
    data: {
      type: "queue",
      position: String(position),
      clientId: String(clientId || ""),
      clientName: name,
      astrologerId: String(astrologerId || ""),
    },
  });

  return result;
};

module.exports = {
  sendNotificationToToken,
  sendNotificationToUser,
  sendChatNotification,
  sendCallNotification,
  sendConsultationNotification,
  sendQueueNotification,
};