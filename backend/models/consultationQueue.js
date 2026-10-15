const mongoose = require("mongoose");

const consultationQueueSchema = new mongoose.Schema(
  {
    astrologer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    match: { type: mongoose.Schema.Types.ObjectId, ref: "Match", default: null },
    channel: { type: String, enum: ["chat", "voice", "video"], default: "chat" },
    status: {
      type: String,
      enum: ["waiting", "active", "cancelled", "expired"],
      default: "waiting",
    },
  },
  { timestamps: true }
);

consultationQueueSchema.index({ astrologer: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model("ConsultationQueue", consultationQueueSchema);
