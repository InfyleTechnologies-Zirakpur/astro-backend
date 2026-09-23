const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
	level: { type: String, required: true },
	score: { type: Number, min: 0, max: 1 },
	description: { type: String, required: true },
	details: { type: [String], default: undefined },
}, { _id: false });

const astrologySchema = new mongoose.Schema({
	level: { type: String, required: true },
	score: { type: Number, required: true, min: 0, max: 1 },
	description: { type: String, required: true },
	details: { type: [String], default: [] },
	chartA: { type: mongoose.Schema.Types.Mixed },
	chartB: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const matchSchema = new mongoose.Schema({
	userA: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	userB: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending", required: true },
	requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	requestedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	respondedAt: { type: Date, default: null },
	overallLabel: { type: String, required: true },
	score: { type: Number, required: true, default: 0, min: 0, max: 100 },
	overallConclusion: { type: String, required: true },
	personality: { type: categorySchema, required: true },
	emotional: { type: categorySchema, required: true },
	communication: { type: categorySchema, required: true },
	trustAndCommitment: { type: categorySchema, required: true },
	maturity: { type: categorySchema, required: true },
	understanding: { type: categorySchema, required: true },
	lifestyle: { type: categorySchema, required: true },
	familyValues: { type: categorySchema, required: true },
	careerAndFinance: { type: categorySchema, required: true },
	relationshipExpectations: { type: categorySchema, required: true },
	longTermPotential: { type: categorySchema, required: true },
	// Optional: only populated when both users have submitted a Horoscope.
	astrology: { type: astrologySchema, required: false },
	strengths: { type: [String], default: [] },
	potentialChallenges: { type: [String], default: [] },
	recommendations: { type: [String], default: [] },
}, { timestamps: true });

matchSchema.index({ userA: 1, userB: 1 }, { unique: true });
matchSchema.index({ userA: 1, score: -1, updatedAt: -1 });
matchSchema.index({ userB: 1, score: -1, updatedAt: -1 });

module.exports = mongoose.model("Match", matchSchema);
