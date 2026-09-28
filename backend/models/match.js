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

// Vedic (sidereal) report: Ashtakoot Guna Milan, sign matchmaking (Rule 2.2),
// and the computable rule-engine findings. Free-form on purpose — every field
// is an independently-typed object produced by vedicCompatibilityService, and
// the shape differs by precision (a date-only chart still gets Guna Milan but
// no ascendant-derived rules, so `available` is false and those keys are
// absent rather than null). Declaring each nested object explicitly would mean
// a migration every time the rule engine gains a finding.
const vedicSchema = new mongoose.Schema({
	available: { type: Boolean, default: false },
	note: { type: String },
	gunaMilan: { type: mongoose.Schema.Types.Mixed },
	signCompatibility: { type: mongoose.Schema.Types.Mixed },
	ruleEngineA: { type: mongoose.Schema.Types.Mixed },
	ruleEngineB: { type: mongoose.Schema.Types.Mixed },
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
	// Optional: same rule as above, but the sidereal/Vedic report. Runs
	// alongside `astrology` rather than replacing it.
	vedic: { type: vedicSchema, required: false },
	strengths: { type: [String], default: [] },
	potentialChallenges: { type: [String], default: [] },
	recommendations: { type: [String], default: [] },
}, { timestamps: true });

matchSchema.index({ userA: 1, userB: 1 }, { unique: true });
matchSchema.index({ userA: 1, score: -1, updatedAt: -1 });
matchSchema.index({ userB: 1, score: -1, updatedAt: -1 });

module.exports = mongoose.model("Match", matchSchema);
