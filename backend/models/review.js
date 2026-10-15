const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    consultationMatch: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true, unique: true },
    astrologer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

reviewSchema.index({ astrologer: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
