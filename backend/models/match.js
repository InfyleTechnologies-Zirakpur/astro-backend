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

const consultationSchema = new mongoose.Schema({
	astrologer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	client: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	channel: { type: String, enum: ["chat", "voice", "video"], default: "chat" },
	ratePerMin: { type: Number, default: 0, min: 0 },
	startedAt: { type: Date, default: null },
	endedAt: { type: Date, default: null },
	durationSec: { type: Number, default: 0, min: 0 },
	freeSecGranted: { type: Number, default: 0, min: 0 },
	billableSec: { type: Number, default: 0, min: 0 },
	// Minutes already debited from the client's wallet. The watermark that
	// makes incremental billing idempotent (a minute is charged exactly once).
	billedMin: { type: Number, default: 0, min: 0 },
	amount: { type: Number, default: 0, min: 0 },
	paymentStatus: { type: String, enum: ["free", "pending", "deducted", "failed"], default: "pending" },
	// Last time the meter ran (billing tick), not necessarily the end.
	billedAt: { type: Date, default: null },
	// Why the session ended: "ended" | "insufficient_balance" | "user" | "astrologer".
	endedReason: { type: String, default: null },
	reviewGiven: { type: Boolean, default: false },
}, { _id: false });

const matchSchema = new mongoose.Schema({
	userA: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	userB: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	matchType: { type: String, enum: ["matchmaking", "consultation"], default: "matchmaking" },
	consultation: { type: consultationSchema, required: false, default: undefined },
	status: { type: String, enum: ["pending", "accepted", "rejected", "active", "ended"], default: "pending", required: true },
	requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	requestedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
	respondedAt: { type: Date, default: null },
	overallLabel: { type: String, required: false, default: "consultation" },
	score: { type: Number, required: false, default: 0, min: 0, max: 100 },
	overallConclusion: { type: String, required: false, default: "" },
	personality: { type: categorySchema, required: false },
	emotional: { type: categorySchema, required: false },
	communication: { type: categorySchema, required: false },
	trustAndCommitment: { type: categorySchema, required: false },
	maturity: { type: categorySchema, required: false },
	understanding: { type: categorySchema, required: false },
	lifestyle: { type: categorySchema, required: false },
	familyValues: { type: categorySchema, required: false },
	careerAndFinance: { type: categorySchema, required: false },
	relationshipExpectations: { type: categorySchema, required: false },
	longTermPotential: { type: categorySchema, required: false },
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
