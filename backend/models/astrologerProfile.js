const mongoose = require("mongoose");

const astrologerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    displayName: { type: String, required: true, trim: true },
    photo: { type: String, default: null },
    bio: { type: String, default: "", maxlength: 2000 },
    expertise: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0, min: 0 },
    rateChatPerMin: { type: Number, default: 20, min: 0 },
    rateCallPerMin: { type: Number, default: 30, min: 0 },
    isOnline: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    freeMinutesEnabled: { type: Boolean, default: true },
    freeMinutesLimitMin: { type: Number, default: 10, min: 0, max: 60 },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    totalConsultations: { type: Number, default: 0, min: 0 },
    totalEarnings: { type: Number, default: 0, min: 0 },
    totalFreeMinutesGiven: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

astrologerProfileSchema.index({ isOnline: 1, ratingAvg: -1 });
astrologerProfileSchema.index({ displayName: "text", bio: "text", expertise: "text" });

module.exports = mongoose.model("AstrologerProfile", astrologerProfileSchema);
