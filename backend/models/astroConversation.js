const mongoose = require("mongoose");

const astroConversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  question: { type: String, required: true, trim: true, maxlength: 1000 },
  answer: { type: String, required: true, trim: true },
  sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

astroConversationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("AstroConversation", astroConversationSchema);