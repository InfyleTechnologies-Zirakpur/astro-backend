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
  const devices = await DeviceToken.find({
    user: userId,
    isActive: true,
  });

  if (!devices.length) {
    return {
      success: false,
      message: "No active devices found for this user",
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
      await DeviceToken.findByIdAndUpdate(device._id, {
        lastUsedAt: new Date(),
      });
    } else if (result.code === "messaging/registration-token-not-registered") {
      await DeviceToken.findByIdAndUpdate(device._id, {
        isActive: false,
      });
    }
  }

  return {
    success: true,
    results,
  };
};

module.exports = {
  sendNotificationToToken,
  sendNotificationToUser,
  sendChatNotification,
  sendCallNotification,
};