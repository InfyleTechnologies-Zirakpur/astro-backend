const mongoose = require("mongoose");

const numeroConversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  question: { type: String, required: true, trim: true, maxlength: 1000 },
  answer: { type: String, required: true, trim: true },
  sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Snapshot of the numbers the answer was grounded in, so history stays
  // correct even if the user later updates their name/DOB.
  numeroContext: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

numeroConversationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("NumeroConversation", numeroConversationSchema);
