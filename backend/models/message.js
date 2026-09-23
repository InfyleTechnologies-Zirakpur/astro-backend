const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["text", "sticker", "media"],
      default: "text",
    },
    text: { type: String, trim: true, default: "", maxlength: 2000 },
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, enum: ["image", "video"], default: null },
    deletedForAll: { type: Boolean, default: false },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ match: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, readAt: 1 });

module.exports = mongoose.model("Message", messageSchema);