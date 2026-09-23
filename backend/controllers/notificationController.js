const DeviceToken = require("../models/deviceToken");
const { sendNotificationToUser } = require("../services/notificationService");

const registerDeviceToken = async (req, res, next) => {
  try {
    const { token, platform } = req.body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    const deviceToken = await DeviceToken.findOneAndUpdate(
      { token: token.trim() },
      {
        user: req.user._id,
        token: token.trim(),
        platform: platform || "unknown",
        isActive: true,
        lastUsedAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "FCM token registered successfully",
      data: deviceToken,
    });
  } catch (error) {
    next(error);
  }
};

const removeDeviceToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    await DeviceToken.findOneAndUpdate(
      { user: req.user._id, token: token.trim() },
      { isActive: false }
    );

    return res.status(200).json({
      success: true,
      message: "FCM token removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const removeAllDeviceTokens = async (req, res, next) => {
  try {
    await DeviceToken.updateMany(
      { user: req.user._id, isActive: true },
      { isActive: false }
    );

    return res.status(200).json({
      success: true,
      message: "All FCM tokens removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const getMyDeviceTokens = async (req, res, next) => {
  try {
    const tokens = await DeviceToken.find({
      user: req.user._id,
      isActive: true,
    }).sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

const sendTestNotification = async (req, res, next) => {
  try {
    const { title = "Test Notification", body = "This notification was sent from the backend." } = req.body;

    const result = await sendNotificationToUser({
      userId: req.user._id,
      title,
      body,
      data: { type: "test" },
    });

    return res.status(200).json({
      success: true,
      message: "Notification processed",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerDeviceToken,
  removeDeviceToken,
  removeAllDeviceTokens,
  getMyDeviceTokens,
  sendTestNotification,
};